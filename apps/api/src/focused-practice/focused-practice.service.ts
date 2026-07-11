import {
  completeFocusedPracticeAudioRequestSchema,
  createFocusedPracticeAttemptRequestSchema,
  createFocusedPracticeSessionRequestSchema,
  focusedPracticeAttemptSchema,
  focusedPracticeSessionSchema,
  type FocusedPracticeAttempt,
  type FocusedPracticeSession,
} from "@orbit/shared";
import { enqueueFocusedPracticeAnalysisJob } from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class FocusedPracticeService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
    private readonly files: FilesService,
    private readonly jobs: JobsService,
  ) {}

  async createSession(projectId: string, actorUserId: string, body: unknown) {
    const request = createFocusedPracticeSessionRequestSchema.parse(body);
    await this.projects.assertCanWriteProject(projectId, actorUserId);
    return this.dataSource.transaction(async (manager) => {
      const existing = first(await manager.query(
        `SELECT * FROM focused_practice_sessions WHERE project_id = $1 AND client_request_id = $2`,
        [projectId, request.clientRequestId],
      ));
      if (existing) return { session: toSession(existing) };
      const rows = await manager.query(
        `
          SELECT runs.deck_id, runs.evaluation_snapshot_json, sets.analysis_state,
                 sets.goal_set_id, json_agg(goals ORDER BY goals.priority) AS goals
          FROM rehearsal_runs runs
          JOIN practice_goal_sets sets ON sets.project_id = runs.project_id
            AND sets.goal_set_id = $3 AND sets.source_full_run_id = runs.run_id
          JOIN practice_goals goals ON goals.project_id = sets.project_id
            AND goals.goal_set_id = sets.goal_set_id AND goals.goal_id = ANY($4::text[])
          WHERE runs.project_id = $1 AND runs.run_id = $2 AND runs.status = 'succeeded'
          GROUP BY runs.deck_id, runs.evaluation_snapshot_json, sets.analysis_state, sets.goal_set_id
        `,
        [projectId, request.sourceFullRunId, request.sourceGoalSetId, request.goalIds],
      );
      const source = first(rows);
      const goals = Array.isArray(source?.goals) ? source.goals as Record<string, unknown>[] : [];
      if (!source || source.analysis_state !== "final" || goals.length !== request.goalIds.length) {
        throw new ConflictException({ code: "SOURCE_INCOMPATIBLE", message: "Focused practice source is not current and final." });
      }
      for (const goal of goals) {
        if (canonical(goal.target_scope_json) !== canonical(request.targetScope) || goal.measurement_state !== "measured") {
          throw new BadRequestException("Focused practice goals must share the requested measured target scope.");
        }
      }
      const snapshot = source.evaluation_snapshot_json as Record<string, any>;
      const plan = snapshot?.evaluationPlan;
      if (!plan) throw new ConflictException({ code: "SOURCE_INCOMPATIBLE", message: "Evaluation plan is unavailable." });
      const now = new Date().toISOString();
      const session = focusedPracticeSessionSchema.parse({
        practiceSessionId: `practice_${randomUUID()}`,
        projectId,
        deckId: source.deck_id,
        sourceFullRunId: request.sourceFullRunId,
        sourceGoalSetId: request.sourceGoalSetId,
        goalIds: request.goalIds,
        targetScope: request.targetScope,
        snapshot: {
          deckVersion: snapshot.deckVersion,
          briefRef: plan.briefRef,
          evaluatorLensRef: plan.evaluatorLensRef,
          criterionRefs: goals.map((goal) => goal.criterion_ref_json),
        },
        compatibilityState: "current",
        status: "active",
        dataOrigin: "live",
        createdBy: actorUserId,
        createdAt: now,
        completedAt: null,
      });
      await manager.query(
        `INSERT INTO focused_practice_sessions (
          practice_session_id, project_id, deck_id, source_full_run_id, source_goal_set_id,
          client_request_id, goal_ids_json, target_scope_json, snapshot_json,
          compatibility_state, status, data_origin, created_by, created_at, completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [session.practiceSessionId, projectId, session.deckId, session.sourceFullRunId,
          session.sourceGoalSetId, request.clientRequestId, session.goalIds, session.targetScope,
          session.snapshot, session.compatibilityState, session.status, session.dataOrigin,
          session.createdBy, session.createdAt, null],
      );
      return { session };
    });
  }

  async getSession(sessionId: string, actorUserId: string) {
    const row = await this.getSessionRow(sessionId);
    await this.projects.assertCanReadProject(String(row.project_id), actorUserId);
    const attempts = (await this.dataSource.query(
      `SELECT * FROM focused_practice_attempts WHERE practice_session_id = $1 ORDER BY attempt_number ASC`,
      [sessionId],
    )).map(toAttempt);
    return { session: toSession(row), attempts, stabilization: deriveStabilization(attempts) };
  }

  async createAttempt(sessionId: string, actorUserId: string, body: unknown) {
    const request = createFocusedPracticeAttemptRequestSchema.parse(body);
    const sessionRow = await this.getSessionRow(sessionId);
    const projectId = String(sessionRow.project_id);
    await this.projects.assertCanWriteProject(projectId, actorUserId);
    if (sessionRow.status !== "active" || sessionRow.compatibility_state !== "current") {
      throw new ConflictException({ code: "INVALID_STATE_TRANSITION", message: "Focused practice session is not active." });
    }
    const existing = first(await this.dataSource.query(
      `SELECT * FROM focused_practice_attempts WHERE practice_session_id = $1 AND client_request_id = $2`,
      [sessionId, request.clientRequestId],
    ));
    if (existing) return { attempt: toAttempt(existing), upload: null };
    const upload = await this.files.createUploadUrl(projectId, {
      originalName: "focused-practice-audio",
      mimeType: request.mimeType,
      size: request.size,
      purpose: "focused-practice-audio",
    });
    const now = new Date();
    const rows = await this.dataSource.query(
      `INSERT INTO focused_practice_attempts (
        attempt_id, project_id, practice_session_id, client_request_id, attempt_number,
        status, result, audio_file_id, analysis_job_id, cleanup_state, cleanup_generation,
        raw_audio_deleted_at, raw_audio_delete_deadline_at, duration_ms,
        slide_timeline_json, goal_outcomes_json, error_code, created_at, completed_at
      ) SELECT $1,$2,$3,$4,COALESCE(MAX(attempt_number),0)+1,'uploading',NULL,$5,NULL,
        'pending',1,NULL,$6,NULL,'[]'::jsonb,'[]'::jsonb,NULL,$7,NULL
        FROM focused_practice_attempts WHERE practice_session_id = $3 RETURNING *`,
      [`attempt_${randomUUID()}`, projectId, sessionId, request.clientRequestId,
        upload.fileId, new Date(now.getTime() + 30 * 60_000).toISOString(), now.toISOString()],
    );
    return { attempt: toAttempt(rows[0]), upload };
  }

  async completeAttempt(attemptId: string, actorUserId: string, body: unknown) {
    const request = completeFocusedPracticeAudioRequestSchema.parse(body);
    const attempt = await this.getAttemptRow(attemptId);
    await this.projects.assertCanWriteProject(String(attempt.project_id), actorUserId);
    if (attempt.status === "queued" || attempt.status === "processing" || ["succeeded", "failed", "cancelled"].includes(String(attempt.status))) {
      return { attempt: toAttempt(attempt) };
    }
    if (attempt.status !== "uploading" || attempt.audio_file_id !== request.fileId) {
      throw new ConflictException({ code: "INVALID_STATE_TRANSITION", message: "Attempt is not awaiting this audio file." });
    }
    await this.files.completeUpload(String(attempt.project_id), { fileId: request.fileId }, "focused-practice-audio");
    validateTimeline(request.slideTimeline, request.durationMs);
    const job = await this.jobs.create({
      projectId: String(attempt.project_id),
      type: "focused-practice-analysis",
      payload: { practiceSessionId: attempt.practice_session_id, attemptId, audioFileId: request.fileId },
    });
    const rows = await this.dataSource.query(
      `UPDATE focused_practice_attempts SET status = 'queued', analysis_job_id = $2,
        duration_ms = $3, slide_timeline_json = $4 WHERE attempt_id = $1 AND status = 'uploading' RETURNING *`,
      [attemptId, job.jobId, request.durationMs, request.slideTimeline],
    );
    await enqueueFocusedPracticeAnalysisJob({
      driver: this.config.JOB_QUEUE_DRIVER,
      redisUrl: this.config.REDIS_URL,
      jobId: job.jobId,
      projectId: String(attempt.project_id),
      practiceSessionId: String(attempt.practice_session_id),
      attemptId,
      audioFileId: request.fileId,
    });
    return { attempt: toAttempt(rows[0]), job };
  }

  async finishSession(sessionId: string, actorUserId: string, status: "completed" | "cancelled") {
    const row = await this.getSessionRow(sessionId);
    await this.projects.assertCanWriteProject(String(row.project_id), actorUserId);
    const rows = await this.dataSource.query(
      `UPDATE focused_practice_sessions SET status = $2, completed_at = now()
       WHERE practice_session_id = $1 AND status = 'active' RETURNING *`,
      [sessionId, status],
    );
    if (!rows[0]) throw new ConflictException({ code: "INVALID_STATE_TRANSITION", message: "Session is already terminal." });
    return { session: toSession(rows[0]) };
  }

  private async getSessionRow(sessionId: string) {
    const row = first(await this.dataSource.query(`SELECT * FROM focused_practice_sessions WHERE practice_session_id = $1`, [sessionId]));
    if (!row) throw new NotFoundException("Focused practice session not found.");
    return row;
  }

  private async getAttemptRow(attemptId: string) {
    const row = first(await this.dataSource.query(`SELECT * FROM focused_practice_attempts WHERE attempt_id = $1`, [attemptId]));
    if (!row) throw new NotFoundException("Focused practice attempt not found.");
    return row;
  }
}

function toSession(row: Record<string, any>): FocusedPracticeSession {
  return focusedPracticeSessionSchema.parse({
    practiceSessionId: row.practice_session_id, projectId: row.project_id, deckId: row.deck_id,
    sourceFullRunId: row.source_full_run_id, sourceGoalSetId: row.source_goal_set_id,
    goalIds: row.goal_ids_json, targetScope: row.target_scope_json, snapshot: row.snapshot_json,
    compatibilityState: row.compatibility_state, status: row.status, dataOrigin: row.data_origin,
    createdBy: row.created_by, createdAt: iso(row.created_at), completedAt: row.completed_at ? iso(row.completed_at) : null,
  });
}

function toAttempt(row: Record<string, any>): FocusedPracticeAttempt {
  return focusedPracticeAttemptSchema.parse({
    attemptId: row.attempt_id, projectId: row.project_id, practiceSessionId: row.practice_session_id,
    attemptNumber: row.attempt_number, status: row.status, result: row.result,
    audioFileId: row.audio_file_id, analysisJobId: row.analysis_job_id, cleanupState: row.cleanup_state,
    cleanupGeneration: row.cleanup_generation, rawAudioDeletedAt: row.raw_audio_deleted_at ? iso(row.raw_audio_deleted_at) : null,
    rawAudioDeleteDeadlineAt: iso(row.raw_audio_delete_deadline_at), durationMs: row.duration_ms,
    slideTimeline: row.slide_timeline_json ?? [], goalOutcomes: row.goal_outcomes_json ?? [],
    errorCode: row.error_code, createdAt: iso(row.created_at), completedAt: row.completed_at ? iso(row.completed_at) : null,
  });
}

export function deriveStabilization(attempts: FocusedPracticeAttempt[]) {
  const terminal = attempts.filter((attempt) => ["succeeded", "failed", "cancelled"].includes(attempt.status));
  const latest = terminal.at(-1);
  const previous = terminal.at(-2);
  const goalIds = new Set([...(latest?.goalOutcomes ?? []), ...(previous?.goalOutcomes ?? [])].map((item) => item.goalId));
  return [...goalIds].map((goalId) => ({
    goalId,
    stabilized: Boolean(
      latest?.status === "succeeded" &&
      previous?.status === "succeeded" &&
      latest?.goalOutcomes.find((item) => item.goalId === goalId)?.outcome === "passed" &&
      previous?.goalOutcomes.find((item) => item.goalId === goalId)?.outcome === "passed"
    ),
  }));
}

function validateTimeline(timeline: Array<{ enteredAtMs: number; exitedAtMs: number | null }>, durationMs: number) {
  if (timeline.some((item) => item.enteredAtMs > durationMs || (item.exitedAtMs ?? durationMs) > durationMs)) {
    throw new BadRequestException("Slide timeline must stay within the recording duration.");
  }
}

function first(rows: unknown): Record<string, any> | undefined {
  return Array.isArray(rows) && rows[0] && typeof rows[0] === "object" ? rows[0] as Record<string, any> : undefined;
}
function iso(value: unknown) { return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString(); }
function canonical(value: unknown) { return JSON.stringify(value, Object.keys((value ?? {}) as object).sort()); }
