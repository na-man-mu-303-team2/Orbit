import {
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  referenceExtractQueueName,
} from "@orbit/job-queue";
import {
  aiDeckGenerationStageMessageSchema,
  jobErrorSchema,
  type AiDeckGenerationStageMessage,
  type JobError,
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
const activeParentRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  status: z.enum(["queued", "running"]),
});

export type AiDeckBullMqFailureRecoveryResult =
  | "coordinator-failed"
  | "stage-dispatch-released"
  | "ignored";

export interface AiDeckBullMqFinalFailureInput {
  queueName: string;
  jobName: string;
  data: unknown;
}

export async function recoverAiDeckBullMqFinalFailure(
  dataSource: DataSource,
  input: AiDeckBullMqFinalFailureInput,
): Promise<AiDeckBullMqFailureRecoveryResult> {
  if (
    input.queueName === generateDeckQueueName &&
    input.jobName === generateDeckStagedCoordinatorJobName
  ) {
    return failCoordinatorParent(dataSource, input.data);
  }
  if (
    input.queueName === referenceExtractQueueName &&
    input.jobName === "reference-extract-file"
  ) {
    const message = aiDeckGenerationStageMessageSchema.parse(input.data);
    if (message.stage !== "reference-extract-file") return "ignored";
    return releaseStageDispatch(dataSource, message);
  }
  return "ignored";
}

async function failCoordinatorParent(
  dataSource: DataSource,
  rawPayload: unknown,
): Promise<AiDeckBullMqFailureRecoveryResult> {
  const payload = coordinatorPayloadSchema.parse(rawPayload);
  const error = coordinatorFailureError();
  return dataSource.transaction(async (manager) => {
    const parent = await lockActiveParent(
      manager,
      payload.jobId,
      payload.projectId,
    );
    if (!parent) return "ignored";

    await manager.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET status = 'failed',
            result_ref_json = NULL,
            error_json = $2::jsonb,
            lease_owner = NULL,
            lease_expires_at = NULL,
            dispatched_at = NULL,
            updated_at = now()
        WHERE stages.pipeline_job_id = $1
          AND stages.status IN ('queued','running')
      `,
      [payload.jobId, error],
    );
    const rows = await manager.query(
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
        RETURNING job_id
      `,
      [payload.jobId, payload.projectId, error],
    );
    return hasQueryRow(rows) ? "coordinator-failed" : "ignored";
  });
}

async function releaseStageDispatch(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage,
): Promise<AiDeckBullMqFailureRecoveryResult> {
  return dataSource.transaction(async (manager) => {
    const parent = await lockActiveParent(
      manager,
      message.pipelineJobId,
      message.projectId,
    );
    if (!parent) return "ignored";
    const checkpoint =
      await new AiDeckGenerationStageCheckpointRepository(
        manager,
      ).releaseDispatchedForTransportRetry(message);
    return checkpoint ? "stage-dispatch-released" : "ignored";
  });
}

async function lockActiveParent(
  dataSource: Pick<DataSource, "query">,
  jobId: string,
  projectId: string,
): Promise<z.infer<typeof activeParentRowSchema> | null> {
  const rows = await dataSource.query(
    `
      SELECT job_id, project_id, status
      FROM jobs
      WHERE job_id = $1
        AND project_id = $2
        AND type = 'ai-deck-generation'
        AND status IN ('queued','running')
      FOR UPDATE
    `,
    [jobId, projectId],
  );
  const row = firstQueryRow(rows);
  return row === null ? null : activeParentRowSchema.parse(row);
}

function coordinatorFailureError(): JobError {
  return jobErrorSchema.parse({
    code: "AI_DECK_COORDINATOR_FAILED",
    message: "AI deck staged coordinator retries were exhausted.",
    failedStage: "reference-extract-file",
    retryable: true,
  });
}

function hasQueryRow(queryResult: unknown): boolean {
  return firstQueryRow(queryResult) !== null;
}

function firstQueryRow(queryResult: unknown): unknown | null {
  if (!Array.isArray(queryResult)) return null;
  const first = queryResult[0];
  if (Array.isArray(first)) return first[0] ?? null;
  return first ?? null;
}
