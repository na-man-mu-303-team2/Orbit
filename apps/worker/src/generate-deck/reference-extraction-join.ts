import {
  aiDeckGenerationStageMessageSchema,
  generateDeckRequestSchema,
  jobErrorSchema,
  type AiDeckGenerationStageMessage,
  type JobError,
  type ReferenceExtractionFile,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { AiDeckReferenceExtractionArtifactRepository } from "./reference-extraction-artifact-repository";
import { AiDeckGenerationStageCheckpointRepository } from "./stage-checkpoint-repository";
import { planAiDeckInitialStages } from "./staged-coordinator";

type QueryExecutor = Pick<DataSource, "query">;

const timestampSchema = z.union([z.date(), z.string().min(1)]);
const parentRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  type: z.literal("ai-deck-generation"),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  payload: z.unknown(),
  created_at: timestampSchema.optional(),
  updated_at: timestampSchema.optional(),
});
const storedPayloadSchema = z.object({ request: generateDeckRequestSchema }).passthrough();
const joinRowSchema = z.object({
  shard_key: z.string().min(1),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  usable: z.boolean(),
});

export class AiDeckStageFencingLostError extends Error {
  constructor() {
    super("AI deck stage lease fencing was lost.");
    this.name = "AiDeckStageFencingLostError";
  }
}

export interface CompleteReferenceExtractionStageInput {
  message: AiDeckGenerationStageMessage;
  leaseOwner: string;
  attempt: number;
  extraction?: ReferenceExtractionFile;
  error?: JobError;
  fatalParent?: boolean;
}

export async function completeAiDeckReferenceExtractionStage(
  dataSource: DataSource,
  rawInput: CompleteReferenceExtractionStageInput,
): Promise<void> {
  const message = referenceStageMessage(rawInput.message);
  const error = rawInput.error ? jobErrorSchema.parse(rawInput.error) : undefined;
  if (!rawInput.extraction && !error) {
    throw new Error("Reference extraction completion requires a result or error.");
  }

  await dataSource.transaction(async (manager) => {
    const parent = await lockParent(manager, message);
    if (parent.status === "succeeded" || parent.status === "failed") {
      throw new AiDeckStageFencingLostError();
    }
    const request = storedPayloadSchema.parse(parent.payload).request;
    assertExpectedShard(request, message.shardKey);

    const checkpoints = new AiDeckGenerationStageCheckpointRepository(manager);
    let completed;
    if (rawInput.extraction) {
      const locator = await new AiDeckReferenceExtractionArtifactRepository(
        manager,
      ).upsert(message, rawInput.extraction);
      completed = await checkpoints.succeed(
        message,
        rawInput.leaseOwner,
        rawInput.attempt,
        locator,
      );
    } else {
      completed = await checkpoints.fail(
        message,
        rawInput.leaseOwner,
        rawInput.attempt,
        error ?? {
          code: "REFERENCE_EXTRACTION_UNUSABLE",
          message: "Reference extraction did not produce usable content.",
          failedStage: "reference-extract-file",
          retryable: false,
        },
      );
    }
    if (!completed) throw new AiDeckStageFencingLostError();

    if (rawInput.fatalParent) {
      await failParent(manager, message, error ?? terminalSourceError());
      return;
    }
    await ensureReferenceExtractionJoin(manager, message, request);
  });
}

export async function recoverAiDeckReferenceExtractionJoin(
  dataSource: DataSource,
  rawMessage: unknown,
): Promise<void> {
  const message = referenceStageMessage(rawMessage);
  await dataSource.transaction(async (manager) => {
    await recoverAiDeckReferenceExtractionJoinInTransaction(manager, message);
  });
}

export async function recoverAiDeckReferenceExtractionJoinInTransaction(
  db: QueryExecutor,
  rawMessage: unknown,
): Promise<void> {
  const message = referenceStageMessage(rawMessage);
  const parent = await lockParent(db, message);
  if (parent.status === "succeeded" || parent.status === "failed") return;
  const request = storedPayloadSchema.parse(parent.payload).request;
  assertExpectedShard(request, message.shardKey);
  await ensureReferenceExtractionJoin(db, message, request);
}

async function ensureReferenceExtractionJoin(
  db: QueryExecutor,
  message: AiDeckGenerationStageMessage,
  request: ReturnType<typeof generateDeckRequestSchema.parse>,
): Promise<void> {
  const plan = planAiDeckInitialStages(request);
  if (plan.uncoveredReferenceFileIds.length === 0) {
    await ensureSourceGrounding(db, message);
    return;
  }
  const rows = await db.query(
    `
      SELECT stages.shard_key,
             stages.status,
             COALESCE(artifacts.usable, false) AS usable
      FROM ai_deck_generation_stages stages
      LEFT JOIN ai_deck_reference_extraction_artifacts artifacts
        ON artifacts.pipeline_job_id = stages.pipeline_job_id
       AND artifacts.file_id = stages.shard_key
      WHERE stages.pipeline_job_id = $1
        AND stages.stage = 'reference-extract-file'
        AND stages.shard_key = ANY($2::text[])
      ORDER BY stages.shard_key
      FOR UPDATE OF stages
    `,
    [message.pipelineJobId, plan.uncoveredReferenceFileIds],
  );
  const states = Array.isArray(rows) ? rows.map((row) => joinRowSchema.parse(row)) : [];
  const expected = new Set(plan.uncoveredReferenceFileIds);
  if (
    states.length !== expected.size ||
    states.some((state) => !expected.has(state.shard_key))
  ) {
    return;
  }
  if (states.some((state) => state.status === "queued" || state.status === "running")) {
    return;
  }

  const coveredUsableCount = new Set(
    request.referenceContext.map((context) => context.fileId),
  ).size;
  const extractedUsableCount = states.filter(
    (state) => state.usable,
  ).length;
  const usableCount = coveredUsableCount + extractedUsableCount;
  const canContinue =
    plan.referencePolicy === "research-first" ||
    (plan.referencePolicy === "references-first" && usableCount > 0) ||
    (plan.referencePolicy === "references-only" &&
      states.every((state) => state.usable));
  if (!canContinue) {
    await failParent(db, message, terminalSourceError());
    return;
  }
  await ensureSourceGrounding(db, message);
}

async function ensureSourceGrounding(
  db: QueryExecutor,
  message: AiDeckGenerationStageMessage,
): Promise<void> {
  const checkpoint = await new AiDeckGenerationStageCheckpointRepository(
    db,
  ).ensureQueued({
    pipelineJobId: message.pipelineJobId,
    projectId: message.projectId,
    stage: "source-grounding",
    shardKey: "",
  });
  if (!checkpoint) {
    throw new Error("Source grounding checkpoint could not be created.");
  }
}

async function lockParent(
  db: QueryExecutor,
  message: AiDeckGenerationStageMessage,
): Promise<z.infer<typeof parentRowSchema>> {
  const rows = await db.query(
    `
      SELECT *
      FROM jobs
      WHERE job_id = $1
        AND project_id = $2
        AND type = 'ai-deck-generation'
      FOR UPDATE
    `,
    [message.pipelineJobId, message.projectId],
  );
  const raw = firstQueryRow(rows);
  if (!raw) throw new Error("AI deck generation parent job not found.");
  const parent = parentRowSchema.parse(raw);
  if (
    parent.job_id !== message.pipelineJobId ||
    parent.project_id !== message.projectId
  ) {
    throw new Error("AI deck generation parent job identity mismatch.");
  }
  return parent;
}

async function failParent(
  db: QueryExecutor,
  message: AiDeckGenerationStageMessage,
  rawError: JobError,
): Promise<void> {
  const error = jobErrorSchema.parse(rawError);
  await db.query(
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
    `,
    [message.pipelineJobId, message.projectId, error],
  );
}

function assertExpectedShard(
  request: ReturnType<typeof generateDeckRequestSchema.parse>,
  fileId: string,
): void {
  const expected = planAiDeckInitialStages(request).uncoveredReferenceFileIds;
  if (!expected.includes(fileId)) {
    throw new Error("Reference extraction shard is outside the parent request.");
  }
}

function referenceStageMessage(rawMessage: unknown): AiDeckGenerationStageMessage {
  const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
  if (message.stage !== "reference-extract-file") {
    throw new Error("Reference extraction stage message required.");
  }
  return message;
}

function terminalSourceError(): JobError {
  return {
    code: "SOURCE_GROUNDING_REQUIRED",
    message: "The selected reference policy requires usable grounding.",
    failedStage: "reference-extract-file",
    retryable: false,
  };
}

function firstQueryRow(queryResult: unknown): unknown | null {
  if (!Array.isArray(queryResult)) return null;
  const first = queryResult[0];
  if (Array.isArray(first)) return first[0] ?? null;
  return first ?? null;
}
