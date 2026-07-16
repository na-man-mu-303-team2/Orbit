import {
  aiDeckGenerationStageMessageSchema,
  generateDeckJobResultSchema,
  generateDeckRequestSchema,
  generateDeckResponseSchema,
  jobErrorSchema,
  jobSchema,
  jobStatusSchema,
  savedDesignPackSnapshotSchema,
  type AiDeckGenerationStageMessage,
  type GenerateDeckResponse,
  type Job,
  type JobError,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { z } from "zod";
import type { ImageAssetRuntime } from "../image-asset-pipeline";
import {
  OptionalMediaFallbackUnavailableError,
  hasMediaPlaceholder,
  resolveGenerateDeckAssets,
} from "./asset-resolution";
import { AiDeckExecutionArtifactRepository } from "./execution-artifact-repository";
import {
  imageSlideArtifactPayloadSchema,
  isAiDeckExecutionStage,
  qualityArtifactPayloadSchema,
  type AiDeckExecutionArtifactPayload,
  type AiDeckExecutionStage,
} from "./execution-stage-contract";
import { AiDeckPlanningArtifactRepository } from "./planning-artifact-repository";
import { layoutCompileArtifactPayloadSchema } from "./planning-stage-contract";
import { markDeckForInitialThumbnailRefresh } from "./pipeline";
import {
  RenderedVisualQualityUnavailableError,
  renderedVisualQualityDiagnostics,
  runRenderedVisualQuality,
} from "./rendered-visual-quality";
import {
  allValidationIssues,
  hasBlockingQualityGateIssues,
  runInitialSemanticQuality,
  withDuplicateMediaAssetIssue,
  withHybridMediaBudgetIssue,
  withVisualIssues,
} from "./semantic-quality";
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

const executionMessageSchema = aiDeckGenerationStageMessageSchema.refine(
  (message) => isAiDeckExecutionStage(message.stage),
  { message: "AI deck execution stage required" },
);
const storedPayloadSchema = z
  .object({
    request: generateDeckRequestSchema,
    designPackSnapshot: savedDesignPackSnapshotSchema.optional(),
    imageAssetScope: z
      .object({ userId: z.string().min(1) })
      .strict()
      .optional(),
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
  result: z.record(z.unknown()).nullable(),
  error: jobErrorSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export interface AiDeckExecutionStageProcessorOptions {
  heartbeatIntervalMs?: number;
  eventLogger?: AiDeckStageEventLogger;
}

export async function processAiDeckExecutionStage(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  workerId: string,
  rawMessage: unknown,
  imageRuntime?: ImageAssetRuntime,
  options: AiDeckExecutionStageProcessorOptions = {},
): Promise<Job | void> {
  const parsed = executionMessageSchema.parse(rawMessage);
  if (!isAiDeckExecutionStage(parsed.stage)) {
    throw new Error("AI deck execution stage required.");
  }
  const message = { ...parsed, stage: parsed.stage };
  const checkpoints = new AiDeckGenerationStageCheckpointRepository(dataSource);
  const claimed = await checkpoints.claim(message, workerId);
  if (!claimed) return;
  if (!claimed.leaseOwner) throw new Error("Claimed stage has no lease owner.");
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
    if (leaseLost || heartbeatRunning) return;
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
    const context = await loadParentContext(dataSource, message);
    const payload = await executeStage({
      dataSource,
      storage,
      pythonWorkerUrl,
      message,
      inputRef: claimed.inputRef,
      context,
      imageRuntime,
      eventLogger: options.eventLogger,
      workerId,
      attempt: claimed.attempt,
      startedAt,
    });
    if (leaseLost) return;
    if (message.stage === "publication") {
      const result = generateDeckJobResultSchema.parse(
        (payload as { result: unknown }).result,
      );
      const job = await publishAtomically(
        dataSource,
        { ...message, stage: "publication" },
        claimed.leaseOwner,
        claimed.attempt,
        result,
        options.eventLogger,
      );
      emitStageEvent(
        options.eventLogger,
        "ai-ppt.stage.succeeded",
        stageEventFields(message, workerId, claimed.attempt, startedAt),
      );
      return job;
    }
    const job = await completeStage(
      dataSource,
      message,
      claimed.leaseOwner,
      claimed.attempt,
      claimed.inputRef,
      payload,
    );
    emitStageEvent(
      options.eventLogger,
      "ai-ppt.stage.succeeded",
      stageEventFields(message, workerId, claimed.attempt, startedAt),
    );
    return job;
  } catch (error) {
    if (leaseLost || error instanceof AiDeckExecutionFencingLostError) return;
    if (isRetrySignal(error)) throw error;
    const normalized = normalizeExecutionError(error, message.stage);
    const diagnostics = executionErrorDiagnostics(error, normalized.error);
    if (normalized.error.retryable && claimed.attempt < 5) {
      const released = await checkpoints.releaseForRetry(
        message,
        claimed.leaseOwner,
        claimed.attempt,
        normalized.error,
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
      normalized.error,
      normalized.result,
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

async function executeStage(input: {
  dataSource: DataSource;
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">;
  pythonWorkerUrl: string;
  message: AiDeckGenerationStageMessage & { stage: AiDeckExecutionStage };
  inputRef: Record<string, unknown>;
  context: Awaited<ReturnType<typeof loadParentContext>>;
  imageRuntime?: ImageAssetRuntime;
  eventLogger?: AiDeckStageEventLogger;
  workerId: string;
  attempt: number;
  startedAt: number;
}): Promise<AiDeckExecutionArtifactPayload> {
  switch (input.message.stage) {
    case "image-slide":
      return executeImageSlide(input);
    case "semantic-quality":
      return executeSemanticQuality(input);
    case "rendered-visual-quality":
      return executeRenderedVisualQuality(input);
    case "publication": {
      const artifact = await new AiDeckExecutionArtifactRepository(
        input.dataSource,
      ).get(input.message, input.inputRef, "rendered-visual-quality");
      const workerPayload = qualityArtifactPayloadSchema.parse(
        artifact.payload,
      ).workerPayload;
      return {
        result: generateDeckJobResultSchema.parse({
          deckId: workerPayload.deck.deckId,
          ...workerPayload,
          coachingProvenance: input.context.request.coachingContext,
        }),
      };
    }
  }
}

async function executeImageSlide(
  input: Parameters<typeof executeStage>[0],
): Promise<AiDeckExecutionArtifactPayload> {
  const layout = await loadLayoutArtifact(
    input.dataSource,
    input.message,
    input.inputRef,
  );
  const workerPayload = layout.workerPayload;
  let deck = markDeckForInitialThumbnailRefresh(
    workerPayload.deck,
    input.context.designPackSnapshot,
  );
  const slideIds = visualSlideIds(layout.visualRequirements);
  const slideIndex = slideIds.indexOf(input.message.shardKey);
  if (slideIndex < 0) {
    throw new StageTerminalError(
      "AI_DECK_IMAGE_SHARD_INVALID",
      "AI deck image shard does not match the layout artifact.",
    );
  }
  const runtime =
    input.imageRuntime && slideIndex >= input.imageRuntime.maxPerDeck
      ? { ...input.imageRuntime, maxPerDeck: 0 }
      : input.imageRuntime;
  const resolved = await resolveGenerateDeckAssets({
    dataSource: input.dataSource,
    storage: input.storage,
    pythonWorkerUrl: input.pythonWorkerUrl,
    deck,
    validation: workerPayload.validation,
    imageRuntime: runtime,
    imageAssetScope: input.context.imageAssetScope,
    officialAssetFileIds: input.context.request.officialAssetFileIds ?? [],
    onlySlideIds: new Set([input.message.shardKey]),
    deterministicIdentity: `${input.message.projectId}:${input.message.pipelineJobId}`,
    onImageFallback: (diagnostic) =>
      emitStageEvent(
        input.eventLogger,
        "ai-ppt.image-asset.fallback",
        stageEventFields(
          input.message,
          input.workerId,
          input.attempt,
          input.startedAt,
          false,
          {
            code: "GENERATE_DECK_OPTIONAL_IMAGE_FALLBACK",
            ...diagnostic,
          },
        ),
      ),
  });
  deck = resolved.deck;
  const slide = deck.slides.find(
    (candidate) => candidate.slideId === input.message.shardKey,
  );
  if (!slide) throw new Error("Resolved AI deck image slide is missing.");
  emit(input.eventLogger, "ai-ppt.asset.resolved", {
    jobId: input.message.pipelineJobId,
    projectId: input.message.projectId,
    slideId: slide.slideId,
  });
  return imageSlideArtifactPayloadSchema.parse({
    slide,
    warnings: resolved.warnings,
  });
}

async function executeSemanticQuality(
  input: Parameters<typeof executeStage>[0],
): Promise<AiDeckExecutionArtifactPayload> {
  const layout = await loadLayoutArtifact(
    input.dataSource,
    input.message,
    input.inputRef,
  );
  let workerPayload = generateDeckResponseSchema.parse(layout.workerPayload);
  const artifacts = await new AiDeckExecutionArtifactRepository(
    input.dataSource,
  ).listImageSlides(input.message);
  const imageSlides = new Map(
    artifacts.map((artifact) => {
      const payload = imageSlideArtifactPayloadSchema.parse(artifact.payload);
      return [payload.slide.slideId, payload] as const;
    }),
  );
  const deck = markDeckForInitialThumbnailRefresh(
    {
      ...workerPayload.deck,
      slides: workerPayload.deck.slides.map(
        (slide) => imageSlides.get(slide.slideId)?.slide ?? slide,
      ),
    },
    input.context.designPackSnapshot,
  );
  const imageWarnings = [...imageSlides.values()].flatMap(
    (payload) => payload.warnings,
  );
  if (hasBlockingQualityGateIssues(workerPayload.validation)) {
    throw qualityGateError(
      "GENERATE_DECK_QUALITY_GATE_FAILED",
      workerPayload,
      deck,
      workerPayload.validation,
      imageWarnings,
    );
  }
  let validation = withDuplicateMediaAssetIssue(workerPayload.validation, deck);
  if (input.context.request.design.mediaPolicy === "hybrid") {
    validation = withHybridMediaBudgetIssue(validation, deck);
  }
  const semantic = runInitialSemanticQuality({ deck, validation });
  workerPayload = generateDeckResponseSchema.parse({
    ...workerPayload,
    deck: semantic.deck,
    warnings: [
      ...workerPayload.warnings,
      ...imageWarnings,
      ...semantic.warnings,
    ],
    validation: semantic.validation,
    diagnostics: {
      ...workerPayload.diagnostics,
      validationIssueCount: allValidationIssues(semantic.validation).length,
    },
  });
  if (
    hasBlockingQualityGateIssues(semantic.validation) ||
    semantic.unresolvedMedia
  ) {
    throw qualityGateError(
      "GENERATE_DECK_QUALITY_GATE_FAILED",
      workerPayload,
      semantic.deck,
      semantic.validation,
    );
  }
  return qualityArtifactPayloadSchema.parse({ workerPayload });
}

async function executeRenderedVisualQuality(
  input: Parameters<typeof executeStage>[0],
): Promise<AiDeckExecutionArtifactPayload> {
  const artifact = await new AiDeckExecutionArtifactRepository(
    input.dataSource,
  ).get(input.message, input.inputRef, "semantic-quality");
  let workerPayload = qualityArtifactPayloadSchema.parse(
    artifact.payload,
  ).workerPayload;
  try {
    const outcome = await runRenderedVisualQuality({
      dataSource: input.dataSource,
      storage: input.storage,
      pythonWorkerUrl: input.pythonWorkerUrl,
      deck: workerPayload.deck,
      validation: workerPayload.validation,
      imageRuntime: input.imageRuntime,
      imageAssetScope: input.context.imageAssetScope,
      officialAssetFileIds: input.context.request.officialAssetFileIds ?? [],
      enforcesHybridMediaBudget:
        input.context.request.design.mediaPolicy === "hybrid",
      jobId: input.message.pipelineJobId,
      projectId: input.message.projectId,
      onRepairProgress: async () => undefined,
      emitEvent: (event, fields) => emit(input.eventLogger, event, fields),
    });
    const diagnostics = {
      ...renderedVisualQualityDiagnostics(outcome, workerPayload.diagnostics),
      validationIssueCount: allValidationIssues(outcome.validation).length,
    };
    workerPayload = generateDeckResponseSchema.parse({
      ...workerPayload,
      deck: outcome.deck,
      warnings: [...workerPayload.warnings, ...outcome.warnings],
      validation: outcome.validation,
      diagnostics,
    });
    if (!outcome.passed) {
      throw qualityGateError(
        "GENERATE_DECK_VISUAL_QUALITY_GATE_FAILED",
        workerPayload,
        outcome.deck,
        withVisualIssues(outcome.validation, outcome.issues),
      );
    }
    return qualityArtifactPayloadSchema.parse({ workerPayload });
  } catch (error) {
    if (!(error instanceof RenderedVisualQualityUnavailableError)) throw error;
    if (
      hasBlockingQualityGateIssues(error.validation) ||
      hasMediaPlaceholder(error.deck)
    ) {
      throw qualityGateError(
        "GENERATE_DECK_QUALITY_GATE_FAILED",
        workerPayload,
        error.deck,
        error.validation,
        error.warnings,
      );
    }
    workerPayload = generateDeckResponseSchema.parse({
      ...workerPayload,
      deck: error.deck,
      warnings: [
        ...workerPayload.warnings,
        ...error.warnings,
        "Rendered Visual QA was unavailable; deterministic validation was used.",
      ],
      validation: error.validation,
      diagnostics: {
        ...workerPayload.diagnostics,
        warningCodes: unique([
          ...workerPayload.diagnostics.warningCodes,
          "GENERATE_DECK_VISUAL_QA_UNAVAILABLE",
        ]),
        visualQaStatus: "unavailable",
        visualReviewAttempts: error.reviewAttempts,
        visualRepairAttempts: error.repairAttempts,
        visualIssueCodes: [],
        validationIssueCount: allValidationIssues(error.validation).length,
      },
    });
    return qualityArtifactPayloadSchema.parse({ workerPayload });
  }
}

async function completeStage(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage & { stage: AiDeckExecutionStage },
  leaseOwner: string,
  attempt: number,
  inputRef: Record<string, unknown>,
  payload: AiDeckExecutionArtifactPayload,
): Promise<Job> {
  return dataSource.transaction(async (manager) => {
    const artifacts = new AiDeckExecutionArtifactRepository(manager);
    const checkpoints = new AiDeckGenerationStageCheckpointRepository(manager);
    const resultRef = await artifacts.upsert(message, payload);
    const succeeded = await checkpoints.succeed(
      message,
      leaseOwner,
      attempt,
      resultRef,
    );
    if (!succeeded) throw new AiDeckExecutionFencingLostError();

    if (message.stage === "image-slide") {
      const rows = await manager.query(
        `
          SELECT count(*)::int AS expected,
                 count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded
          FROM ai_deck_generation_stages
          WHERE pipeline_job_id = $1 AND stage = 'image-slide'
        `,
        [message.pipelineJobId],
      );
      const counts = z
        .object({
          expected: z.coerce.number().int(),
          succeeded: z.coerce.number().int(),
        })
        .parse(firstQueryRow(rows));
      if (counts.expected > 0 && counts.expected === counts.succeeded) {
        await checkpoints.ensureQueued(
          { ...message, stage: "semantic-quality", shardKey: "" },
          inputRef,
        );
      }
      return updateParentProgress(manager, message, 70);
    }
    const nextStage =
      message.stage === "semantic-quality"
        ? "rendered-visual-quality"
        : "publication";
    await checkpoints.ensureQueued(
      { ...message, stage: nextStage, shardKey: "" },
      resultRef,
    );
    return updateParentProgress(
      manager,
      message,
      message.stage === "semantic-quality" ? 80 : 95,
    );
  });
}

export async function publishAtomically(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage & { stage: "publication" },
  leaseOwner: string,
  attempt: number,
  result: ReturnType<typeof generateDeckJobResultSchema.parse>,
  eventLogger?: (event: string, fields: Record<string, unknown>) => void,
): Promise<Job> {
  const job = await dataSource.transaction(async (manager) => {
    const artifacts = new AiDeckExecutionArtifactRepository(manager);
    const checkpoints = new AiDeckGenerationStageCheckpointRepository(manager);
    const resultRef = await artifacts.upsert(message, { result });
    const succeeded = await checkpoints.succeed(
      message,
      leaseOwner,
      attempt,
      resultRef,
    );
    if (!succeeded) throw new AiDeckExecutionFencingLostError();
    await manager.query(
      `
        INSERT INTO decks (project_id, deck_id, deck_json, version, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (project_id) DO UPDATE
        SET deck_id = EXCLUDED.deck_id,
            deck_json = EXCLUDED.deck_json,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at
      `,
      [message.projectId, result.deck.deckId, result.deck, result.deck.version],
    );
    const rows = await manager.query(
      `
        UPDATE jobs
        SET status = 'succeeded', progress = 100,
            message = 'AI deck generation completed.',
            result = $3::jsonb, error = NULL, updated_at = now()
        WHERE job_id = $1 AND project_id = $2
          AND type = 'ai-deck-generation' AND status IN ('queued','running')
        RETURNING *
      `,
      [message.pipelineJobId, message.projectId, result],
    );
    const updated = parentJobFromQuery(rows);
    if (!updated) throw new AiDeckExecutionFencingLostError();
    return updated;
  });
  emit(eventLogger, "ai-ppt.deck.published", {
    jobId: message.pipelineJobId,
    projectId: message.projectId,
    deckId: result.deck.deckId,
    slideCount: result.deck.slides.length,
  });
  return job;
}

async function failStageAndParent(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage & { stage: AiDeckExecutionStage },
  leaseOwner: string,
  attempt: number,
  rawError: JobError,
  result: Record<string, unknown> | null,
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
        SET status = 'failed', message = 'AI deck generation failed.',
            result = $4::jsonb, error = $3::jsonb, updated_at = now()
        WHERE job_id = $1 AND project_id = $2
          AND type = 'ai-deck-generation' AND status IN ('queued','running')
        RETURNING *
      `,
      [message.pipelineJobId, message.projectId, error, result],
    );
    return parentJobFromQuery(rows);
  });
}

async function loadLayoutArtifact(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage,
  inputRef: Record<string, unknown>,
) {
  const artifact = await new AiDeckPlanningArtifactRepository(dataSource).get(
    message,
    inputRef,
    "layout-compile",
  );
  return layoutCompileArtifactPayloadSchema.parse(artifact.payload);
}

async function loadParentContext(
  dataSource: DataSource,
  message: AiDeckGenerationStageMessage,
) {
  const rows = await dataSource.query(
    `
      SELECT payload FROM jobs
      WHERE job_id = $1 AND project_id = $2
        AND type = 'ai-deck-generation' AND status IN ('queued','running')
    `,
    [message.pipelineJobId, message.projectId],
  );
  const row = z.object({ payload: z.unknown() }).parse(firstQueryRow(rows));
  return storedPayloadSchema.parse(row.payload);
}

function visualSlideIds(rawVisualRequirements: unknown): string[] {
  return z
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
    .parse(rawVisualRequirements)
    .items.filter((item) => item.visualPlan.imageNeeded === true)
    .map((item) => item.slideId);
}

function qualityGateError(
  code: string,
  workerPayload: GenerateDeckResponse,
  deck: GenerateDeckResponse["deck"],
  validation: GenerateDeckResponse["validation"],
  extraWarnings: string[] = [],
) {
  const payload = generateDeckResponseSchema.parse({
    ...workerPayload,
    deck,
    validation,
    warnings: [...workerPayload.warnings, ...extraWarnings],
    diagnostics: {
      ...workerPayload.diagnostics,
      validationIssueCount: allValidationIssues(validation).length,
    },
  });
  return new StageTerminalError(
    code,
    `Deck generation retained ${allValidationIssues(validation).length} quality issue(s).`,
    generateDeckJobResultSchema.parse({
      deckId: deck.deckId,
      ...payload,
      coachingProvenance: null,
    }),
    {
      reasonCode: "QUALITY_GATE_BLOCKING",
      issueCodes: unique(
        allValidationIssues(validation).map((issue) => issue.code),
      ),
      issueCount: allValidationIssues(validation).length,
      unresolvedMediaCount: deck.slides.reduce(
        (count, slide) =>
          count +
          slide.elements.filter((element) =>
            element.elementId.endsWith("_media_placeholder"),
          ).length,
        0,
      ),
    },
  );
}

function normalizeExecutionError(
  error: unknown,
  stage: AiDeckExecutionStage,
): { error: JobError; result: Record<string, unknown> | null } {
  if (error instanceof StageTerminalError) {
    return {
      error: jobErrorSchema.parse({
        code: error.code,
        message: error.message,
        failedStage: stage,
        retryable: false,
      }),
      result: error.result,
    };
  }
  if (error instanceof OptionalMediaFallbackUnavailableError) {
    return {
      error: jobErrorSchema.parse({
        code: "GENERATE_DECK_OPTIONAL_IMAGE_FALLBACK_FAILED",
        message: "Optional image fallback could not be completed.",
        failedStage: stage,
        retryable: false,
      }),
      result: null,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      error: jobErrorSchema.parse({
        code: "AI_DECK_EXECUTION_CONTRACT_INVALID",
        message: "AI deck execution stage contract is invalid.",
        failedStage: stage,
        retryable: false,
      }),
      result: null,
    };
  }
  return {
    error: jobErrorSchema.parse({
      code: "AI_DECK_EXECUTION_INTERNAL_ERROR",
      message: "AI deck execution stage could not be completed.",
      failedStage: stage,
      retryable: true,
    }),
    result: null,
  };
}

function executionErrorDiagnostics(
  error: unknown,
  normalized: JobError,
): SafeStageErrorDiagnostics {
  if (error instanceof StageTerminalError) {
    return compactDiagnostics({
      code: normalized.code,
      reasonCode: error.diagnostics?.reasonCode ?? error.code,
      name: error.name,
      issueCodes: error.diagnostics?.issueCodes,
      issueCount: error.diagnostics?.issueCount,
      unresolvedMediaCount: error.diagnostics?.unresolvedMediaCount,
    });
  }
  if (error instanceof OptionalMediaFallbackUnavailableError) {
    return compactDiagnostics({
      code: normalized.code,
      reasonCode:
        error.imageFailureDiagnostic?.reasonCode ??
        "OPTIONAL_IMAGE_FALLBACK_FAILED",
      name: error.name,
      providerHttpStatus: error.imageFailureDiagnostic?.providerHttpStatus,
      provider: error.imageFailureDiagnostic?.provider,
      providerRequestId: error.imageFailureDiagnostic?.providerRequestId,
    });
  }
  if (error instanceof z.ZodError) {
    return contractErrorDiagnostics(
      error,
      normalized.code,
      "EXECUTION_CONTRACT_INVALID",
    );
  }
  return unknownErrorDiagnostics(
    error,
    normalized.code,
    "EXECUTION_FAILURE_UNCLASSIFIED",
  );
}

async function updateParentProgress(
  db: Pick<DataSource, "query">,
  message: AiDeckGenerationStageMessage,
  progress: number,
): Promise<Job> {
  const rows = await db.query(
    `
      UPDATE jobs SET status = 'running', progress = GREATEST(progress, $3),
          message = 'AI deck staged generation running.', error = NULL,
          updated_at = now()
      WHERE job_id = $1 AND project_id = $2
        AND type = 'ai-deck-generation' AND status IN ('queued','running')
      RETURNING *
    `,
    [message.pipelineJobId, message.projectId, progress],
  );
  const job = parentJobFromQuery(rows);
  if (!job) throw new Error("AI deck generation parent job is not runnable.");
  return job;
}

class StageTerminalError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly result: Record<string, unknown> | null = null,
    readonly diagnostics?: Pick<
      SafeStageErrorDiagnostics,
      "reasonCode" | "issueCodes" | "issueCount" | "unresolvedMediaCount"
    >,
  ) {
    super(message);
    this.name = "StageTerminalError";
  }
}

class AiDeckExecutionFencingLostError extends Error {}

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

function emit(
  logger:
    | ((event: string, fields: Record<string, unknown>) => void)
    | undefined,
  event: string,
  fields: Record<string, unknown>,
) {
  try {
    logger?.(event, fields);
  } catch {
    // Business event logging must not change generation behavior.
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
