import {
  activityAnswerSchema,
  activityDefinitionSchema,
  activityPresenterResultSchema,
  activityResponseRetentionJobPayloadSchema,
  activityResponseRetentionJobResultSchema,
  buildActivityAggregates,
  type ActivityAnswer,
  type Job,
} from "@orbit/shared";
import type { DataSource, EntityManager } from "typeorm";

type SessionRow = {
  raw_responses_deleted_at: Date | string | null;
  results_deleted_at: Date | string | null;
};

type RunRow = {
  activity_run_id: string;
  activity_id: string;
  definition_snapshot: unknown;
  status: "draft" | "open" | "closed" | "results";
  revision: number;
  response_count: number;
};

type ResponseRow = { answers_json: unknown };
type TextRow = {
  entry_id: string;
  question_id: string;
  text_value: string;
  answered_at: Date | string | null;
  updated_at: Date | string;
};

type JobRow = {
  job_id: string;
  project_id: string;
  type: Job["type"];
  status: Job["status"];
  progress: number;
  message: string;
  result: Record<string, unknown> | null;
  error: Job["error"];
  created_at: Date | string;
  updated_at: Date | string;
};

export async function processActivityResponseRetentionJob(
  dataSource: DataSource,
  rawPayload: unknown,
  now = new Date(),
): Promise<Job> {
  const payloadResult = activityResponseRetentionJobPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    const jobId = readJobId(rawPayload);
    if (!jobId) throw new Error(payloadResult.error.message);
    return updateJob(dataSource, jobId, {
      status: "failed",
      progress: 0,
      message: "Activity response retention payload invalid.",
      result: null,
      error: {
        code: "ACTIVITY_RETENTION_PAYLOAD_INVALID",
        message: payloadResult.error.message,
        retryable: false,
      },
    });
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "Activity response retention running.",
    result: null,
    error: null,
  });

  try {
    const result = await dataSource.transaction(async (manager) =>
      retainSessionResponses(manager, payload.projectId, payload.presentationSessionId, now),
    );
    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "Activity response retention completed.",
      result: activityResponseRetentionJobResultSchema.parse(result),
      error: null,
    });
  } catch (error) {
    await updateJob(dataSource, payload.jobId, {
      status: "failed",
      progress: 10,
      message: "Activity response retention failed and will be retried.",
      result: null,
      error: {
        code: "ACTIVITY_RETENTION_FAILED",
        message:
          error instanceof Error ? error.message : "Activity response retention failed.",
        retryable: true,
      },
    });
    throw error;
  }
}

async function retainSessionResponses(
  manager: EntityManager,
  projectId: string,
  sessionId: string,
  now: Date,
) {
  const sessions = readQueryRows<SessionRow>(
    await manager.query(
      `
        SELECT raw_responses_deleted_at, results_deleted_at
        FROM presentation_sessions
        WHERE project_id = $1 AND session_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [projectId, sessionId],
    ),
  );
  const session = sessions[0];
  if (!session) return retentionResult(sessionId, "session-missing", 0, 0);
  if (session.results_deleted_at) {
    return retentionResult(sessionId, "owner-deleted", 0, 0);
  }
  if (session.raw_responses_deleted_at) {
    return retentionResult(sessionId, "already-retained", 0, 0);
  }

  const runs = readQueryRows<RunRow>(
    await manager.query(
      `
        SELECT activity_run_id, activity_id, definition_snapshot,
               status, revision, response_count
        FROM activity_runs
        WHERE project_id = $1 AND session_id = $2
        ORDER BY created_at ASC
        FOR UPDATE
      `,
      [projectId, sessionId],
    ),
  );

  for (const run of runs) {
    const [responses, approvedText] = await Promise.all([
      manager.query(
        `
          SELECT answers_json
          FROM activity_responses
          WHERE project_id = $1 AND activity_run_id = $2
          ORDER BY submitted_at ASC
        `,
        [projectId, run.activity_run_id],
      ),
      manager.query(
        `
          SELECT entries.entry_id, entries.question_id, entries.text_value,
                 entries.answered_at, entries.updated_at
          FROM activity_text_entries AS entries
          INNER JOIN activity_responses AS responses
            ON responses.project_id = entries.project_id
           AND responses.response_id = entries.response_id
          WHERE entries.project_id = $1
            AND responses.activity_run_id = $2
            AND entries.moderation_status = 'approved'
          ORDER BY entries.updated_at ASC
        `,
        [projectId, run.activity_run_id],
      ),
    ]);
    const definition = activityDefinitionSchema.parse(run.definition_snapshot);
    const answers = readQueryRows<ResponseRow>(responses).map((row) =>
      activityAnswerSchema.array().parse(row.answers_json),
    );
    const snapshot = activityPresenterResultSchema.parse({
      activityRunId: run.activity_run_id,
      activityId: run.activity_id,
      status: run.status,
      revision: run.revision,
      responseCount: run.response_count,
      aggregates: buildActivityAggregates(definition, answers as ActivityAnswer[][]),
      textEntries: readQueryRows<TextRow>(approvedText).map((entry) => ({
        entryId: entry.entry_id,
        questionId: entry.question_id,
        text: entry.text_value,
        displayName: null,
        moderationStatus: "approved" as const,
        answeredAt: toOptionalIso(entry.answered_at),
        updatedAt: toIso(entry.updated_at),
      })),
    });
    await manager.query(
      `
        INSERT INTO activity_result_snapshots (
          snapshot_id, project_id, session_id, activity_run_id, aggregate_json, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (activity_run_id) DO UPDATE
        SET aggregate_json = EXCLUDED.aggregate_json,
            created_at = EXCLUDED.created_at
      `,
      [
        `activity_snapshot_${run.activity_run_id}`,
        projectId,
        sessionId,
        run.activity_run_id,
        snapshot,
        now,
      ],
    );
  }

  const deletedRows = readQueryRows<{ response_id: string }>(
    await manager.query(
      `
        DELETE FROM activity_responses
        WHERE project_id = $1
          AND activity_run_id IN (
            SELECT activity_run_id FROM activity_runs
            WHERE project_id = $1 AND session_id = $2
          )
        RETURNING response_id
      `,
      [projectId, sessionId],
    ),
  );
  await manager.query(
    `
      UPDATE presentation_sessions
      SET raw_responses_deleted_at = $3, updated_at = $3
      WHERE project_id = $1 AND session_id = $2
        AND results_deleted_at IS NULL
        AND raw_responses_deleted_at IS NULL
    `,
    [projectId, sessionId, now],
  );
  return retentionResult(
    sessionId,
    "retained-aggregate",
    runs.length,
    deletedRows.length,
  );
}

function retentionResult(
  presentationSessionId: string,
  outcome: "retained-aggregate" | "already-retained" | "owner-deleted" | "session-missing",
  snapshotCount: number,
  deletedResponseCount: number,
) {
  return {
    presentationSessionId,
    outcome,
    snapshotCount,
    deletedResponseCount,
  };
}

async function updateJob(
  dataSource: Pick<DataSource, "query">,
  jobId: string,
  patch: {
    status: "running" | "succeeded" | "failed";
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: Job["error"];
  },
): Promise<Job> {
  const rows = readQueryRows<JobRow>(
    await dataSource.query(
      `
        UPDATE jobs
        SET status = $2, progress = $3, message = $4,
            result = $5, error = $6, updated_at = now()
        WHERE job_id = $1
        RETURNING *
      `,
      [jobId, patch.status, patch.progress, patch.message, patch.result, patch.error],
    ),
  );
  const row = rows[0];
  if (!row) throw new Error(`Job not found: ${jobId}`);
  return {
    jobId: row.job_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function readJobId(value: unknown): string {
  return value && typeof value === "object" && "jobId" in value &&
    typeof value.jobId === "string"
    ? value.jobId
    : "";
}

function readQueryRows<T>(queryResult: unknown): T[] {
  if (!Array.isArray(queryResult)) return [];
  if (Array.isArray(queryResult[0])) return queryResult[0] as T[];
  return queryResult as T[];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}
