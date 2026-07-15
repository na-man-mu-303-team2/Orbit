import {
  generateDeckRequestSchema,
  jobErrorSchema,
  jobSchema,
  jobStatusSchema,
  type GenerateDeckRequest,
  type Job,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { AiDeckGenerationStageCheckpointRepository } from "./stage-checkpoint-repository";

const coordinatorPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
  })
  .strict();

const storedPayloadSchema = z
  .object({
    request: generateDeckRequestSchema,
  })
  .passthrough();

const timestampSchema = z.union([z.date(), z.string().min(1)]);
const parentJobRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  type: z.literal("ai-deck-generation"),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string(),
  payload: z.unknown(),
  result: z.record(z.unknown()).nullable(),
  error: jobErrorSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export interface AiDeckInitialStagePlan {
  referencePolicy: GenerateDeckRequest["brief"]["referencePolicy"];
  selectedReferenceFileIds: string[];
  uncoveredReferenceFileIds: string[];
}

export function planAiDeckInitialStages(
  request: GenerateDeckRequest,
): AiDeckInitialStagePlan {
  const referencePolicy =
    request.referencePolicy ??
    request.design.referencePolicy ??
    request.brief.referencePolicy;
  const selectedReferenceFileIds = [
    ...new Set(
      request.references.length > 0
        ? request.references.map((reference) => reference.fileId)
        : request.referenceFileIds,
    ),
  ];
  if (referencePolicy === "topic-only" || referencePolicy === "user-input-only") {
    return {
      referencePolicy,
      selectedReferenceFileIds,
      uncoveredReferenceFileIds: [],
    };
  }

  const coveredFileIds = new Set(
    request.referenceContext.map((context) => context.fileId),
  );
  const uncoveredReferenceFileIds = selectedReferenceFileIds.filter(
    (fileId) => !coveredFileIds.has(fileId),
  );
  return {
    referencePolicy,
    selectedReferenceFileIds,
    uncoveredReferenceFileIds,
  };
}

export async function processAiDeckStagedCoordinatorJob(
  dataSource: DataSource,
  rawPayload: unknown,
): Promise<Job> {
  const payload = coordinatorPayloadSchema.parse(rawPayload);
  return dataSource.transaction(async (manager) => {
    const rows = await manager.query(
      `
        SELECT *
        FROM jobs
        WHERE job_id = $1
          AND project_id = $2
          AND type = 'ai-deck-generation'
        FOR UPDATE
      `,
      [payload.jobId, payload.projectId],
    );
    const parent = parentJobFromQuery(rows);
    if (!parent) {
      throw new Error("AI deck generation parent job not found.");
    }
    if (
      parent.job_id !== payload.jobId ||
      parent.project_id !== payload.projectId
    ) {
      throw new Error("AI deck generation parent job identity mismatch.");
    }
    if (parent.status === "succeeded" || parent.status === "failed") {
      return rowToJob(parent);
    }

    const storedPayload = storedPayloadSchema.parse(parent.payload);
    const plan = planAiDeckInitialStages(storedPayload.request);
    if (requiresUnavailableGrounding(storedPayload.request, plan)) {
      const failedRows = await manager.query(
        `
          UPDATE jobs
          SET status = 'failed',
              message = 'AI deck generation failed.',
              error = $3::jsonb,
              updated_at = now()
          WHERE job_id = $1
            AND project_id = $2
            AND type = 'ai-deck-generation'
            AND status IN ('queued','running')
          RETURNING *
        `,
        [
          payload.jobId,
          payload.projectId,
          {
            code: "SOURCE_GROUNDING_REQUIRED",
            message: "The selected reference policy requires usable grounding.",
            failedStage: "reference-extract-file",
            retryable: false,
          },
        ],
      );
      const failedParent = parentJobFromQuery(failedRows);
      if (!failedParent) {
        throw new Error("AI deck generation parent job is not runnable.");
      }
      return rowToJob(failedParent);
    }

    const updatedRows = await manager.query(
      `
        UPDATE jobs
        SET status = 'running',
            progress = GREATEST(progress, 10),
            message = 'AI deck staged generation running.',
            error = NULL,
            updated_at = now()
        WHERE job_id = $1
          AND project_id = $2
          AND type = 'ai-deck-generation'
          AND status IN ('queued','running')
        RETURNING *
      `,
      [payload.jobId, payload.projectId],
    );
    const updatedParent = parentJobFromQuery(updatedRows);
    if (!updatedParent) {
      throw new Error("AI deck generation parent job is not runnable.");
    }

    const messages = plan.uncoveredReferenceFileIds.length
      ? plan.uncoveredReferenceFileIds.map((fileId) => ({
          pipelineJobId: payload.jobId,
          projectId: payload.projectId,
          stage: "reference-extract-file" as const,
          shardKey: fileId,
        }))
      : [
          {
            pipelineJobId: payload.jobId,
            projectId: payload.projectId,
            stage: "source-grounding" as const,
            shardKey: "",
          },
        ];
    const repository = new AiDeckGenerationStageCheckpointRepository(manager);
    for (const message of messages) {
      const checkpoint = await repository.ensureQueued(message);
      if (!checkpoint) {
        throw new Error("AI deck generation checkpoint could not be created.");
      }
    }

    return rowToJob(updatedParent);
  });
}

function requiresUnavailableGrounding(
  request: GenerateDeckRequest,
  plan: AiDeckInitialStagePlan,
): boolean {
  if (plan.referencePolicy === "references-only") {
    return plan.selectedReferenceFileIds.length === 0;
  }
  if (plan.referencePolicy !== "references-first") return false;
  if (plan.uncoveredReferenceFileIds.length > 0) return false;
  return new Set(request.referenceContext.map((context) => context.fileId)).size === 0;
}

type ParentJobRow = z.infer<typeof parentJobRowSchema>;

function parentJobFromQuery(queryResult: unknown): ParentJobRow | null {
  const row = firstQueryRow(queryResult);
  return row === null ? null : parentJobRowSchema.parse(row);
}

function firstQueryRow(queryResult: unknown): unknown | null {
  if (!Array.isArray(queryResult)) return null;
  const first = queryResult[0];
  if (Array.isArray(first)) return first[0] ?? null;
  return first ?? null;
}

function rowToJob(row: ParentJobRow): Job {
  return jobSchema.parse({
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
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
