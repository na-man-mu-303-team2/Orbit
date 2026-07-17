import type { ActivityResponseRetentionJobPayload } from "@orbit/shared";
import type { DataSource, EntityManager } from "typeorm";

type DueSessionRow = {
  project_id: string;
  session_id: string;
};

export type ActivityRetentionEnqueue = (
  payload: ActivityResponseRetentionJobPayload,
) => Promise<void>;

export async function dispatchDueActivityRetentionJobs(
  dataSource: DataSource,
  enqueue: ActivityRetentionEnqueue,
  now = new Date(),
  batchSize = 100,
): Promise<{ scanned: number; dispatched: number; failed: number }> {
  const payloads = await dataSource.transaction(async (manager) => {
    const sessions = readQueryRows<DueSessionRow>(
      await manager.query(
        `
          SELECT project_id, session_id
          FROM presentation_sessions
          WHERE raw_responses_delete_after <= $1
            AND raw_responses_deleted_at IS NULL
            AND results_deleted_at IS NULL
          ORDER BY raw_responses_delete_after ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `,
        [now, Math.max(1, batchSize)],
      ),
    );
    const queued: ActivityResponseRetentionJobPayload[] = [];
    for (const session of sessions) {
      const payload = {
        jobId: retentionJobId(session.session_id),
        projectId: session.project_id,
        presentationSessionId: session.session_id,
      } satisfies ActivityResponseRetentionJobPayload;
      await upsertRetentionJob(manager, payload, now);
      queued.push(payload);
    }
    return queued;
  });

  let dispatched = 0;
  let failed = 0;
  for (const payload of payloads) {
    try {
      await enqueue(payload);
      dispatched += 1;
    } catch (error) {
      failed += 1;
      await dataSource.query(
        `
          UPDATE jobs
          SET status = 'failed', progress = 0,
              message = 'Activity response retention enqueue failed.',
              error = $2, updated_at = $3
          WHERE job_id = $1 AND status = 'queued'
        `,
        [
          payload.jobId,
          {
            code: "ACTIVITY_RETENTION_ENQUEUE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Activity response retention enqueue failed.",
            retryable: true,
          },
          now,
        ],
      );
    }
  }
  return { scanned: payloads.length, dispatched, failed };
}

export function retentionJobId(sessionId: string): string {
  return `job_activity_retention_${sessionId}`;
}

async function upsertRetentionJob(
  manager: EntityManager,
  payload: ActivityResponseRetentionJobPayload,
  now: Date,
): Promise<void> {
  await manager.query(
    `
      INSERT INTO jobs (
        job_id, project_id, type, status, progress, message,
        payload, result, error, created_at, updated_at
      )
      VALUES ($1, $2, 'activity-response-retention', 'queued', 0,
              'Activity response retention queued.', $3, NULL, NULL, $4, $4)
      ON CONFLICT (job_id) DO UPDATE
      SET status = CASE WHEN jobs.status = 'failed' THEN 'queued' ELSE jobs.status END,
          progress = CASE WHEN jobs.status = 'failed' THEN 0 ELSE jobs.progress END,
          message = CASE WHEN jobs.status = 'failed'
            THEN 'Activity response retention queued.' ELSE jobs.message END,
          error = CASE WHEN jobs.status = 'failed' THEN NULL ELSE jobs.error END,
          updated_at = CASE WHEN jobs.status = 'failed' THEN EXCLUDED.updated_at ELSE jobs.updated_at END
    `,
    [payload.jobId, payload.projectId, payload, now],
  );
}

function readQueryRows<T>(queryResult: unknown): T[] {
  if (!Array.isArray(queryResult)) return [];
  if (Array.isArray(queryResult[0])) return queryResult[0] as T[];
  return queryResult as T[];
}
