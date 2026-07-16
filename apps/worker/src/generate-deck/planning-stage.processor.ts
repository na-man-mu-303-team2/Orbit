import {
  aiDeckGenerationStageMessageSchema,
  generateDeckResearchIssueCodeSchema,
  generateDeckResearchQualitySchema,
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
  layoutCompileArtifactPayloadSchema,
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
import {
  compactDiagnostics,
  contractErrorDiagnostics,
  emitStageEvent,
  stageEventFields,
  unknownErrorDiagnostics,
  type AiDeckStageEventLogger,
  type SafeStageErrorDiagnostics,
} from "./stage-diagnostics";

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
const sourceGroundingResearchDiagnosticsSchema = z.object({
  research_quality: generateDeckResearchQualitySchema,
  research_issue_codes: z.array(generateDeckResearchIssueCodeSchema),
  research_attempts: z.number().int().nonnegative(),
  relevant_web_source_count: z.number().int().nonnegative(),
  official_web_source_count: z.number().int().nonnegative(),
  independent_web_source_count: z.number().int().nonnegative(),
  research_fact_coverage_satisfied: z.boolean(),
});
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

const nextStageByStage: Partial<
  Record<AiDeckPlanningStage, AiDeckPlanningStage>
> = {
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

export interface AiDeckPlanningStageProcessorOptions extends AiDeckPlanningStagePythonClientOptions {
  heartbeatIntervalMs?: number;
  eventLogger?: AiDeckStageEventLogger;
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
  const startedAt = Date.now();
  emitStageEvent(
    options.eventLogger,
    "ai-ppt.stage.started",
    stageEventFields(message, workerId, claimed.attempt, startedAt),
  );

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
    if (message.stage === "source-grounding") {
      const sourcePayload = sourceGroundingArtifactPayloadSchema.parse(payload);
      const research = sourceGroundingResearchDiagnosticsSchema.safeParse(
        sourcePayload.rawInput,
      );
      if (research.success && research.data.research_quality !== "not-run") {
        emitStageEvent(
          options.eventLogger,
          "ai-ppt.web-research.completed",
          {
            pipelineJobId: message.pipelineJobId,
            projectId: message.projectId,
            quality: research.data.research_quality,
            issueCodes: research.data.research_issue_codes,
            attempts: research.data.research_attempts,
            relevantSourceCount: research.data.relevant_web_source_count,
            officialSourceCount: research.data.official_web_source_count,
            independentSourceCount:
              research.data.independent_web_source_count,
            factCoverageSatisfied:
              research.data.research_fact_coverage_satisfied,
          },
        );
      }
    }
    const result = await completeStage(
      dataSource,
      message,
      claimed.leaseOwner,
      claimed.attempt,
      payload,
    );
    emitStageEvent(
      options.eventLogger,
      "ai-ppt.stage.succeeded",
      stageEventFields(message, workerId, claimed.attempt, startedAt),
    );
    return result;
  } catch (error) {
    if (leaseLost || error instanceof AiDeckStageFencingLostError) return;
    if (isRetrySignal(error)) throw error;
    const normalized = normalizeStageError(error, message.stage);
    const diagnostics = planningErrorDiagnostics(error, normalized);
    if (normalized.retryable && claimed.attempt < 5) {
      const released = await checkpoints.releaseForRetry(
        message,
        claimed.leaseOwner,
        claimed.attempt,
        normalized,
      );
      if (released) {
        emitStageEvent(
          options.eventLogger,
          "ai-ppt.stage.attempt-failed",
          stageEventFields(
            message,
            workerId,
            claimed.attempt,
            startedAt,
            false,
            diagnostics,
          ),
        );
        throw retrySignal();
      }
      return;
    }
    const result = await failStageAndParent(
      dataSource,
      message,
      claimed.leaseOwner,
      claimed.attempt,
      normalized,
    );
    if (result) {
      emitStageEvent(
        options.eventLogger,
        "ai-ppt.stage.failed",
        stageEventFields(
          message,
          workerId,
          claimed.attempt,
          startedAt,
          true,
          diagnostics,
        ),
      );
    }
    return result;
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
      const artifact = await artifacts.get(
        message,
        inputRef,
        "content-planning",
      );
      return designPlanningStageInput(
        contentPlanningArtifactPayloadSchema.parse(artifact.payload),
      );
    }
    case "layout-compile": {
      const design = await artifacts.get(message, inputRef, "design-planning");
      const content = await artifacts.getByStage(message, "content-planning");
      const source = await artifacts.getByStage(message, "source-grounding");
      return layoutCompileStageInput(
        contentPlanningArtifactPayloadSchema.parse(content.payload),
        designPlanningArtifactPayloadSchema.parse(design.payload),
        sourceGroundingArtifactPayloadSchema.parse(source.payload).warnings,
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
  if (
    !rawParent ||
    typeof rawParent !== "object" ||
    !("payload" in rawParent)
  ) {
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
      if (!next)
        throw new Error("Next AI deck planning checkpoint was not created.");
    } else {
      await ensureImageOrSemanticCheckpoints(
        checkpoints,
        message,
        payload,
        resultRef,
      );
    }
    return updateParentProgress(
      manager,
      message,
      progressByStage[message.stage],
    );
  });
}

async function ensureImageOrSemanticCheckpoints(
  checkpoints: AiDeckGenerationStageCheckpointRepository,
  message: AiDeckGenerationStageMessage & { stage: AiDeckPlanningStage },
  payload: AiDeckPlanningArtifactPayload,
  layoutReference: Record<string, unknown>,
): Promise<void> {
  if (message.stage !== "layout-compile") return;
  const layout = layoutCompileArtifactPayloadSchema.parse(payload);
  const visualRequirements = z
    .object({
      items: z.array(
        z.object({
          slideId: z.string().min(1),
          visualPlan: z
            .object({ imageNeeded: z.boolean().optional() })
            .passthrough(),
        }),
      ),
    })
    .parse(layout.visualRequirements);
  const slideIds = visualRequirements.items
    .filter((item) => item.visualPlan.imageNeeded === true)
    .map((item) => item.slideId);
  const nextMessages =
    slideIds.length > 0
      ? slideIds.map((slideId) => ({
          ...message,
          stage: "image-slide" as const,
          shardKey: slideId,
        }))
      : [
          {
            ...message,
            stage: "semantic-quality" as const,
            shardKey: "",
          },
        ];
  for (const nextMessage of nextMessages) {
    const next = await checkpoints.ensureQueued(nextMessage, layoutReference);
    if (!next)
      throw new Error("Next AI deck execution checkpoint was not created.");
  }
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

function planningErrorDiagnostics(
  error: unknown,
  normalized: JobError,
): SafeStageErrorDiagnostics {
  if (error instanceof AiDeckPlanningStageError) {
    return compactDiagnostics({
      code: normalized.code,
      reasonCode: error.diagnostics.reasonCode,
      name: error.name,
      httpStatus: error.diagnostics.httpStatus,
      providerHttpStatus: error.diagnostics.providerHttpStatus,
      provider: error.diagnostics.provider,
      providerRequestId: error.diagnostics.providerRequestId,
      retryAfterMs: error.diagnostics.retryAfterMs,
    });
  }
  if (error instanceof z.ZodError) {
    return contractErrorDiagnostics(
      error,
      normalized.code,
      "PLANNING_RESPONSE_CONTRACT_INVALID",
    );
  }
  return unknownErrorDiagnostics(
    error,
    normalized.code,
    "PLANNING_FAILURE_UNCLASSIFIED",
  );
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
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
