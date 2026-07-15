import {
  aiDeckGenerationStageMessageSchema,
  generateDeckRequestSchema,
  jobErrorSchema,
  jobSchema,
  jobStatusSchema,
  referenceExtractionResultSchema,
  savedDesignPackSnapshotSchema,
  type AiDeckGenerationStageMessage,
  type GenerateDeckRequest,
  type Job,
  type JobError,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { AiDeckPlanningArtifactRepository } from "./planning-artifact-repository";
import {
  contentPlanningArtifactPayloadSchema,
  designPlanningArtifactPayloadSchema,
  isAiDeckPlanningStage,
  sourceGroundingArtifactPayloadSchema,
  type AiDeckPlanningArtifactPayload,
  type AiDeckPlanningStage,
} from "./planning-stage-contract";
import {
  AiDeckPlanningStageError,
  contentPlanningStageInput,
  designPlanningStageInput,
  executeAiDeckPlanningStage,
  layoutCompileStageInput,
  sourceGroundingStageInput,
  type AiDeckPlanningStagePythonClientOptions,
} from "./planning-stage-python-client";
import { AiDeckGenerationStageCheckpointRepository } from "./stage-checkpoint-repository";

const planningMessageSchema = aiDeckGenerationStageMessageSchema.refine(
  (message) => isAiDeckPlanningStage(message.stage),
  { message: "Planning stage required" },
);
const storedPayloadSchema = z
  .object({
    request: generateDeckRequestSchema,
    designPackSnapshot: savedDesignPackSnapshotSchema.optional(),
  })
  .passthrough();
const extractionRowSchema = z.object({ extraction_json: z.unknown() });
const timestampSchema = z.union([z.date(), z.string().min(1)]);
const parentJobRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  type: z.literal("ai-deck-generation"),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string(),
  result: z.record(z.unknown()).nullable(),
  error: jobErrorSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const nextStageByStage: Partial<Record<AiDeckPlanningStage, AiDeckPlanningStage>> = {
  "source-grounding": "content-planning",
  "content-planning": "design-planning",
  "design-planning": "layout-compile",
};
const progressByStage: Record<AiDeckPlanningStage, number> = {
  "source-grounding": 25,
  "content-planning": 40,
  "design-planning": 50,
  "layout-compile": 60,
};

export interface AiDeckPlanningStageProcessorOptions
  extends AiDeckPlanningStagePythonClientOptions {
  heartbeatIntervalMs?: number;
}

export async function processAiDeckPlanningStage(
  dataSource: DataSource,
  pythonWorkerUrl: string,
  workerId: string,
  rawMessage: unknown,
  options: AiDeckPlanningStageProcessorOptions = {},
): Promise<Job | void> {
  const parsedMessage = planningMessageSchema.parse(rawMessage);
  if (!isAiDeckPlanningStage(parsedMessage.stage)) {
    throw new Error("Planning stage required.");
  }
  const message = { ...parsedMessage, stage: parsedMessage.stage };
  const checkpoints = new AiDeckGenerationStageCheckpointRepository(dataSource);
  const claimed = await checkpoints.claim(message, workerId);
  if (!claimed) return;
  if (!claimed.leaseOwner) {
    throw new Error("Claimed stage is missing its lease owner.");
  }

  const controller = new AbortController();
  let leaseLost = false;
  let heartbeatRunning = false;
  const heartbeat = setInterval(() => {
    if (heartbeatRunning || leaseLost) return;
    heartbeatRunning = true;
    void checkpoints
      .renewLease(message, claimed.leaseOwner!, claimed.attempt)
      .then((renewed) => {
        if (!renewed) {
          leaseLost = true;
          controller.abort();
        }
      })
      .catch(() => {
        leaseLost = true;
        controller.abort();
      })
      .finally(() => {
        heartbeatRunning = false;
      });
  }, options.heartbeatIntervalMs ?? 60_000);
  heartbeat.unref?.();

  try {
    const input = await buildStageInput(dataSource, message, claimed.inputRef);
    const payload = await executeAiDeckPlanningStage(
      pythonWorkerUrl,
      message.stage,
      input,
      {
        fetchImpl: options.fetchImpl,
        signal: AbortSignal.any([
          controller.signal,
          options.signal ?? AbortSignal.timeout(180_000),
        ]),
      },
    );
    if (leaseLost) return;
    return await completeStage(
      dataSource,
      message,
      claimed.leaseOwner,
      claimed.attempt,
      payload,
    );
  } catch (error) {
    if (leaseLost || error instanceof AiDeckStageFencingLostError) return;
    if (isRetrySignal(error)) throw error;
    const normalized = normalizeStageError(error, message.stage);
    if (normalized.retryable && claimed.attempt < 5) {
      const released = await checkpoints.releaseForRetry(
        message,
        claimed.leaseOwner,
        claimed.attempt,
        normalized,
      );
      if (released) throw retrySignal();
      return;
    }
    return failStageAndParent(
      dataSource,
      message,
      claimed.leaseOwner,
      claimed.attempt,
      { ...normalized, retryable: false },
    );
  } finally {
    clearInterval(heartbeat);
  }
}

async function buildStageInput(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage & { stage: AiDeckPlanningStage },
  inputRef: Record<string, unknown>,
): Promise<unknown> {
  const artifacts = new AiDeckPlanningArtifactRepository(dataSource);
  switch (message.stage) {
    case "source-grounding":
      const groundingInput = await loadGroundingRequest(dataSource, message);
      return sourceGroundingStageInput(
        message.projectId,
        groundingInput.request,
        groundingInput.savedDesignPreferences,
      );
    case "content-planning": {
      const artifact = await artifacts.get(
        message,
        inputRef,
        "source-grounding",
      );
      return contentPlanningStageInput(
        sourceGroundingArtifactPayloadSchema.parse(artifact.payload),
      );
    }
    case "design-planning": {
      const artifact = await artifacts.get(message, inputRef, "content-planning");
      return designPlanningStageInput(
        contentPlanningArtifactPayloadSchema.parse(artifact.payload),
      );
    }
    case "layout-compile": {
      const design = await artifacts.get(message, inputRef, "design-planning");
      const content = await artifacts.getByStage(message, "content-planning");
      return layoutCompileStageInput(
        contentPlanningArtifactPayloadSchema.parse(content.payload),
        designPlanningArtifactPayloadSchema.parse(design.payload),
      );
    }
  }
}

async function loadGroundingRequest(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage,
): Promise<{
  request: GenerateDeckRequest;
  savedDesignPreferences: Record<string, unknown>;
}> {
  const parentRows = await dataSource.query(
    `
      SELECT payload
      FROM jobs
      WHERE job_id = $1
        AND project_id = $2
        AND type = 'ai-deck-generation'
        AND status IN ('queued','running')
    `,
    [message.pipelineJobId, message.projectId],
  );
  const rawParent = firstQueryRow(parentRows);
  if (!rawParent || typeof rawParent !== "object" || !("payload" in rawParent)) {
    throw new Error("AI deck generation parent job not found.");
  }
  const storedPayload = storedPayloadSchema.parse(rawParent.payload);
  const request = storedPayload.request;
  const extractionRows = await dataSource.query(
    `
      SELECT extraction_json
      FROM ai_deck_reference_extraction_artifacts
      WHERE pipeline_job_id = $1
        AND project_id = $2
        AND usable = true
      ORDER BY file_id
    `,
    [message.pipelineJobId, message.projectId],
  );
  const savedDesignPreferences =
    storedPayload.designPackSnapshot?.preferences ?? {};
  if (!Array.isArray(extractionRows)) {
    return { request, savedDesignPreferences };
  }
  const covered = new Set(request.referenceContext.map((item) => item.fileId));
  const extractedContexts = extractionRows.flatMap((rawRow) => {
    const row = extractionRowSchema.parse(rawRow);
    const result = referenceExtractionResultSchema.parse({
      files: [row.extraction_json],
    });
    const extraction = result.files[0];
    if (!extraction || covered.has(extraction.fileId)) return [];
    const content = (extraction.cleanedText || extraction.rawText).trim();
    if (!extraction.usable || !content) return [];
    covered.add(extraction.fileId);
    return [
      {
        fileId: extraction.fileId,
        title: extraction.fileName,
        content,
        sourceId: `reference:${extraction.fileId}`,
      },
    ];
  });
  return {
    request: generateDeckRequestSchema.parse({
      ...request,
      referenceContext: [...request.referenceContext, ...extractedContexts],
    }),
    savedDesignPreferences,
  };
}

async function completeStage(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage & { stage: AiDeckPlanningStage },
  leaseOwner: string,
  attempt: number,
  payload: AiDeckPlanningArtifactPayload,
): Promise<Job> {
  return dataSource.transaction(async (manager) => {
    const artifacts = new AiDeckPlanningArtifactRepository(manager);
    const checkpoints = new AiDeckGenerationStageCheckpointRepository(manager);
    const resultRef = await artifacts.upsert(message, payload);
    const succeeded = await checkpoints.succeed(
      message,
      leaseOwner,
      attempt,
      resultRef,
    );
    if (!succeeded) throw new AiDeckStageFencingLostError();

    const nextStage = nextStageByStage[message.stage];
    if (nextStage) {
      const next = await checkpoints.ensureQueued(
        { ...message, stage: nextStage },
        resultRef,
      );
      if (!next) throw new Error("Next AI deck planning checkpoint was not created.");
    }
    return updateParentProgress(manager, message, progressByStage[message.stage]);
  });
}

async function failStageAndParent(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage & { stage: AiDeckPlanningStage },
  leaseOwner: string,
  attempt: number,
  rawError: JobError,
): Promise<Job | void> {
  const error = jobErrorSchema.parse(rawError);
  return dataSource.transaction(async (manager) => {
    const failed = await new AiDeckGenerationStageCheckpointRepository(
      manager,
    ).fail(message, leaseOwner, attempt, error);
    if (!failed) return;
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
        RETURNING *
      `,
      [message.pipelineJobId, message.projectId, error],
    );
    return parentJobFromQuery(rows);
  });
}

async function updateParentProgress(
  db: Pick<DataSource, "query">,
  message: AiDeckGenerationStageMessage,
  progress: number,
): Promise<Job> {
  const rows = await db.query(
    `
      UPDATE jobs
      SET status = 'running',
          progress = GREATEST(progress, $3),
          message = 'AI deck staged generation running.',
          error = NULL,
          updated_at = now()
      WHERE job_id = $1
        AND project_id = $2
        AND type = 'ai-deck-generation'
        AND status IN ('queued','running')
      RETURNING *
    `,
    [message.pipelineJobId, message.projectId, progress],
  );
  const job = parentJobFromQuery(rows);
  if (!job) throw new Error("AI deck generation parent job is not runnable.");
  return job;
}

function normalizeStageError(
  error: unknown,
  stage: AiDeckPlanningStage,
): JobError {
  if (error instanceof AiDeckPlanningStageError) {
    return jobErrorSchema.parse({
      code: error.code,
      message: error.message,
      failedStage: stage,
      retryable: error.retryable,
    });
  }
  if (error instanceof z.ZodError) {
    return jobErrorSchema.parse({
      code: "AI_DECK_PLANNING_CONTRACT_INVALID",
      message: "AI deck planning stage contract is invalid.",
      failedStage: stage,
      retryable: false,
    });
  }
  return jobErrorSchema.parse({
    code: "AI_DECK_PLANNING_INTERNAL_ERROR",
    message: "AI deck planning stage could not be completed.",
    failedStage: stage,
    retryable: true,
  });
}

class AiDeckStageFencingLostError extends Error {
  constructor() {
    super("AI deck planning stage lease fencing was lost.");
    this.name = "AiDeckStageFencingLostError";
  }
}

function retrySignal(): Error {
  const error = new Error("AI_DECK_STAGE_RETRY");
  error.name = "AiDeckStageRetrySignal";
  return error;
}

function isRetrySignal(error: unknown): boolean {
  return error instanceof Error && error.message === "AI_DECK_STAGE_RETRY";
}

function parentJobFromQuery(queryResult: unknown): Job | void {
  const raw = firstQueryRow(queryResult);
  if (!raw) return;
  const row = parentJobRowSchema.parse(raw);
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

function firstQueryRow(queryResult: unknown): unknown | null {
  if (!Array.isArray(queryResult)) return null;
  const first = queryResult[0];
  if (Array.isArray(first)) return first[0] ?? null;
  return first ?? null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
