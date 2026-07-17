import {
  aiDeckGenerationStageMessageSchema,
  generateDeckResearchIssueCodeSchema,
  generateDeckResearchQualitySchema,
  generateDeckRequestSchema,
  generateDeckStoredJobPayloadSchema,
  jobErrorSchema,
  jobSchema,
  jobStatusSchema,
  referenceExtractionResultSchema,
  type AiDeckGenerationStageMessage,
  type GenerateDeckRequest,
  type Job,
  type JobError,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AiDeckPlanningArtifactRepository } from "./planning-artifact-repository";
import {
  completedSlideV2ArtifactPayloadSchema,
  coverSlideArtifactPayloadSchema,
} from "./execution-stage-contract";
import {
  contentPlanningArtifactPayloadSchema,
  designPlanningArtifactPayloadSchema,
  isAiDeckPlanningStage,
  isLayoutCompileV2Artifact,
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
import {
  AiDeckGenerationStageCheckpointRepository,
  type AiDeckGenerationStageCheckpoint,
} from "./stage-checkpoint-repository";
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
  claimedCheckpoint?: AiDeckGenerationStageCheckpoint;
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
  const claimed =
    options.claimedCheckpoint ?? (await checkpoints.claim(message, workerId));
  if (!claimed) return;
  assertClaimMatches(message, claimed);
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

function assertClaimMatches(
  message: AiDeckGenerationStageMessage,
  claimed: AiDeckGenerationStageCheckpoint,
): void {
  if (
    claimed.pipelineJobId !== message.pipelineJobId ||
    claimed.stage !== message.stage ||
    claimed.shardKey !== message.shardKey ||
    claimed.status !== "running"
  ) {
    throw new Error("Preclaimed AI deck checkpoint identity mismatch.");
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
        await applySelectedDesign(dataSource, message, artifact.payload),
        true,
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

async function applySelectedDesign(
  dataSource: Pick<DataSource, "query">,
  message: AiDeckGenerationStageMessage,
  rawContent: unknown,
) {
  const content = contentPlanningArtifactPayloadSchema.parse(rawContent);
  const parent = firstQueryRow(
    await dataSource.query(
      `SELECT payload FROM jobs
       WHERE job_id = $1 AND project_id = $2 AND type = 'ai-deck-generation'`,
      [message.pipelineJobId, message.projectId],
    ),
  );
  if (!parent || typeof parent !== "object" || !("payload" in parent)) {
    throw new Error("AI deck generation parent job not found.");
  }
  const stored = generateDeckStoredJobPayloadSchema.parse(parent.payload);
  if (!stored.designSelection) return content;
  const rawInput = z.record(z.unknown()).parse(content.rawInput);
  const rawDesign = z.record(z.unknown()).catch({}).parse(rawInput.design);
  return contentPlanningArtifactPayloadSchema.parse({
    ...content,
    rawInput: {
      ...rawInput,
      designPrompt:
        stored.designSelection.designPrompt ?? stored.request.designPrompt ?? "",
      design: {
        ...rawDesign,
        paletteOverride: stored.designSelection.paletteOverride,
        fontOverride: stored.designSelection.fontOverride,
      },
    },
  });
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
  const storedPayload = generateDeckStoredJobPayloadSchema.parse(
    rawParent.payload,
  );
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

    if (
      message.stage === "content-planning" &&
      !(await canStartDesignPlanning(manager, message))
    ) {
      return updateParentProgress(
        manager,
        message,
        progressByStage[message.stage],
      );
    }

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
        manager,
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

async function canStartDesignPlanning(
  manager: Pick<DataSource, "query">,
  message: AiDeckGenerationStageMessage,
): Promise<boolean> {
  const parent = firstQueryRow(
    await manager.query(
      `
        SELECT payload
        FROM jobs
        WHERE job_id = $1 AND project_id = $2
          AND type = 'ai-deck-generation'
        FOR UPDATE
      `,
      [message.pipelineJobId, message.projectId],
    ),
  );
  const designSelected = Boolean(
    parent &&
      typeof parent === "object" &&
      "payload" in parent &&
      generateDeckStoredJobPayloadSchema.parse(parent.payload).designSelection,
  );
  if (!designSelected) return false;
  const cover = firstQueryRow(
    await manager.query(
      `SELECT status FROM ai_deck_generation_stages
       WHERE pipeline_job_id = $1
         AND stage = 'cover-slide' AND shard_key = ''`,
      [message.pipelineJobId],
    ),
  );
  return Boolean(
    cover &&
      typeof cover === "object" &&
      "status" in cover &&
      (cover.status === "succeeded" || cover.status === "failed"),
  );
}

async function ensureImageOrSemanticCheckpoints(
  db: Pick<DataSource, "query">,
  checkpoints: AiDeckGenerationStageCheckpointRepository,
  message: AiDeckGenerationStageMessage & { stage: AiDeckPlanningStage },
  payload: AiDeckPlanningArtifactPayload,
  layoutReference: Record<string, unknown>,
): Promise<void> {
  if (message.stage !== "layout-compile") return;
  const layout = layoutCompileArtifactPayloadSchema.parse(payload);
  if (isLayoutCompileV2Artifact(layout)) {
    const reusedSourceOrder = await reuseCoverAsFirstSlide(
      db,
      message,
      layout,
      layoutReference,
    );
    let queued = 0;
    for (const slide of layout.slides) {
      if (slide.sourceOrder === reusedSourceOrder) continue;
      const next = await checkpoints.ensureQueued(
        {
          ...message,
          stage: "image-slide",
          shardKey: slide.shardKey,
        },
        layoutReference,
      );
      if (!next) {
        throw new Error("Next AI deck slide checkpoint was not created.");
      }
      queued += 1;
    }
    if (queued === 0 && reusedSourceOrder !== null) {
      await checkpoints.ensureQueued(
        { ...message, stage: "semantic-quality", shardKey: "" },
        layoutReference,
      );
    }
    return;
  }
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

async function reuseCoverAsFirstSlide(
  db: Pick<DataSource, "query">,
  message: AiDeckGenerationStageMessage,
  layout: Extract<
    ReturnType<typeof layoutCompileArtifactPayloadSchema.parse>,
    { artifactVersion: 2 }
  >,
  layoutReference: Record<string, unknown>,
): Promise<number | null> {
  const descriptor = [...layout.slides].sort(
    (left, right) => left.order - right.order,
  )[0];
  if (!descriptor || descriptor.order !== 1) return null;
  const rawCover = firstQueryRow(
    await db.query(
      `SELECT artifacts.payload_json
       FROM ai_deck_execution_artifacts artifacts
       JOIN ai_deck_generation_stages stages
         ON stages.pipeline_job_id = artifacts.pipeline_job_id
        AND stages.stage = artifacts.stage
        AND stages.shard_key = artifacts.shard_key
       WHERE artifacts.pipeline_job_id = $1 AND artifacts.project_id = $2
         AND artifacts.stage = 'cover-slide' AND stages.status = 'succeeded'`,
      [message.pipelineJobId, message.projectId],
    ),
  );
  if (
    !rawCover ||
    typeof rawCover !== "object" ||
    !("payload_json" in rawCover)
  ) return null;
  const cover = coverSlideArtifactPayloadSchema.parse(rawCover.payload_json);
  const sourceSlide = cover.deck.slides[0];
  if (!sourceSlide) return null;
  const slide = {
    ...sourceSlide,
    slideId: descriptor.slideId,
    order: descriptor.order,
  };
  const completed = completedSlideV2ArtifactPayloadSchema.parse({
    artifactVersion: 2,
    sourceOrder: descriptor.sourceOrder,
    order: descriptor.order,
    slideId: descriptor.slideId,
    slide,
    warnings: cover.warnings,
    validation: cover.validation,
  });
  const checkpointRows = await db.query(
    `INSERT INTO ai_deck_generation_stages (
       pipeline_job_id, stage, shard_key, status, attempt,
       input_ref_json, result_ref_json
     ) VALUES ($1, 'image-slide', $2, 'succeeded', 0, $3::jsonb, NULL)
     ON CONFLICT (pipeline_job_id, stage, shard_key) DO NOTHING
     RETURNING pipeline_job_id`,
    [message.pipelineJobId, descriptor.shardKey, layoutReference],
  );
  if (!firstQueryRow(checkpointRows)) return null;
  const artifactId = randomUUID();
  const artifactRows = await db.query(
    `INSERT INTO ai_deck_execution_artifacts (
       artifact_id, pipeline_job_id, project_id, stage, shard_key, payload_json
     ) VALUES ($1, $2, $3, 'image-slide', $4, $5::jsonb)
     ON CONFLICT (pipeline_job_id, stage, shard_key) DO UPDATE
       SET payload_json = EXCLUDED.payload_json, updated_at = now()
     RETURNING artifact_id`,
    [artifactId, message.pipelineJobId, message.projectId, descriptor.shardKey, completed],
  );
  const storedArtifact = z
    .object({ artifact_id: z.string().uuid() })
    .parse(firstQueryRow(artifactRows));
  await db.query(
    `UPDATE ai_deck_generation_stages
     SET result_ref_json = $3::jsonb, updated_at = now()
     WHERE pipeline_job_id = $1 AND stage = 'image-slide'
       AND shard_key = $2 AND status = 'succeeded'`,
    [
      message.pipelineJobId,
      descriptor.shardKey,
      { executionArtifactId: storedArtifact.artifact_id },
    ],
  );
  return descriptor.sourceOrder;
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
