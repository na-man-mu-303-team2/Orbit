import { randomUUID } from "node:crypto";
import { applyDeckPatch } from "@orbit/editor-core";
import {
  deckSchema,
  designAgentProposalSchema,
  designAgentWorkerRequestSchema,
  jobSchema,
  slideRedesignComposeArtifactSchema,
  slideRedesignJobPayloadSchema,
  slideRedesignJobResultSchema,
  slideRedesignProgressEventSchema,
  type Deck,
  type DesignAgentProposal,
  type DesignAgentWorkerRequest,
  type Job,
  type SlideRedesignJobPayload,
  type SlideRedesignProgressEvent,
  type SlideRedesignStage,
  type SlideRedesignInterpretArtifact,
  type SlideRedesignVerifyArtifact,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import type { DataSource, EntityManager } from "typeorm";
import {
  SlideRedesignPythonClient,
  SlideRedesignStageClientError,
  type SlideRedesignStageClient,
} from "./slide-redesign-python.client";
import {
  resolveSlideImageAssets,
  type ImageAssetFallbackDiagnostic,
  type ImageAssetRuntime,
} from "./image-asset-pipeline";

type QueryExecutor = DataSource | EntityManager;

export type SlideRedesignProgressPublisher = (
  event: SlideRedesignProgressEvent,
) => Promise<void>;

export interface SlideRedesignProcessorOptions {
  client?: SlideRedesignStageClient;
  publishProgress?: SlideRedesignProgressPublisher;
  now?: () => Date;
  imageRuntime?: ImageAssetRuntime;
  storage?: Pick<StoragePort, "putObject">;
  resolveImageAssets?: typeof resolveSlideImageAssets;
  onImageFallback?: (diagnostic: ImageAssetFallbackDiagnostic) => void;
  imageEventLogger?: (event: string, fields: Record<string, unknown>) => void;
}

export async function processSlideRedesignJob(
  dataSource: DataSource,
  pythonWorkerUrl: string,
  rawPayload: unknown,
  options: SlideRedesignProcessorOptions = {},
): Promise<Job> {
  const parsed = slideRedesignJobPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const jobId = readPayloadString(rawPayload, "jobId");
    if (!jobId) throw new Error("Slide redesign payload is invalid.");
    return failJob(
      dataSource,
      jobId,
      readPayloadString(rawPayload, "requestMessageId"),
      0,
      "SLIDE_REDESIGN_PAYLOAD_INVALID",
    );
  }

  const payload = parsed.data;
  const client =
    options.client ?? new SlideRedesignPythonClient(pythonWorkerUrl);
  const publishProgress = options.publishProgress ?? (async () => undefined);
  const now = options.now ?? (() => new Date());
  let failureProgress = 0;

  try {
    const sourceDeck = await loadDeck(dataSource, payload);
    if (sourceDeck.version !== payload.context.baseVersion) {
      const staleJob = await finishWithoutProposal(dataSource, payload, {
        outcome: "stale",
        message: "슬라이드가 변경되어 다시 시도해야 합니다.",
        now,
      });
      return staleJob;
    }

    const request = buildWorkerRequest(payload);
    failureProgress = 5;
    await setRunningStage(dataSource, payload, "interpreting", failureProgress);
    await publishStage(publishProgress, payload, "interpreting", [], now);
    const interpreted = await client.interpret(request);
    if (interpreted.outcome !== "applicable") {
      const completedJob = await finishWithoutProposal(dataSource, payload, {
        outcome: interpreted.outcome,
        message: outcomeMessage(interpreted.outcome),
        now,
      });
      return completedJob;
    }

    failureProgress = 25;
    await setRunningStage(dataSource, payload, "composing", failureProgress);
    await publishStage(
      publishProgress,
      payload,
      "composing",
      ["interpreting"],
      now,
    );
    const composed = await client.compose(request, interpreted);
    if (composed.outcome !== "applicable" || !composed.response) {
      const completedJob = await finishWithoutProposal(dataSource, payload, {
        outcome: composed.outcome,
        message: outcomeMessage(composed.outcome),
        now,
      });
      return completedJob;
    }

    failureProgress = 45;
    await setRunningStage(dataSource, payload, "coloring", failureProgress);
    await publishStage(
      publishProgress,
      payload,
      "coloring",
      ["interpreting", "composing"],
      now,
    );
    const previewProposal = buildTransientProposal(
      payload,
      composed.response,
      now(),
    );
    const previewDeck = assertProposalApplies(sourceDeck, previewProposal);
    failureProgress = 65;
    await setRunningStage(dataSource, payload, "ornamenting", failureProgress);
    await publishStage(
      publishProgress,
      payload,
      "ornamenting",
      ["interpreting", "composing", "coloring"],
      now,
      previewProposal,
    );

    let finalComposed = composed;
    const imageRequests = composed.imageRequests ?? [];
    if (imageRequests.length > 0) {
      failureProgress = 72;
      await setRunningStage(
        dataSource,
        payload,
        "illustrating",
        failureProgress,
      );
      await publishStage(
        publishProgress,
        payload,
        "illustrating",
        ["interpreting", "composing", "coloring", "ornamenting"],
        now,
        previewProposal,
      );
      finalComposed = await resolveComposedImage(
        dataSource,
        payload,
        previewDeck,
        composed,
        options,
      );
    }

    failureProgress = 80;
    await setRunningStage(dataSource, payload, "verifying", failureProgress);
    await publishStage(
      publishProgress,
      payload,
      "verifying",
      imageRequests.length > 0
        ? [
            "interpreting",
            "composing",
            "coloring",
            "ornamenting",
            "illustrating",
          ]
        : ["interpreting", "composing", "coloring", "ornamenting"],
      now,
    );
    const verified = await client.verify(request, finalComposed);
    const completedJob = await finishVerifiedProposal(
      dataSource,
      payload,
      sourceDeck,
      verified,
      now,
    );
    return completedJob;
  } catch (error) {
    const failure = classifyFailure(error, failureProgress);
    return failJob(
      dataSource,
      payload.jobId,
      payload.requestMessageId,
      failure.progress,
      failure.code,
    );
  }
}

function buildWorkerRequest(
  payload: SlideRedesignJobPayload,
): DesignAgentWorkerRequest {
  return designAgentWorkerRequestSchema.parse({
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    question: payload.question,
    intentPreset: "redesign-slide",
    context: payload.context,
    history: payload.history,
    capabilities: payload.capabilities,
    requestPaletteOptions: false,
    selectedPaletteOption: payload.selectedPaletteOption,
  });
}

async function loadDeck(
  executor: QueryExecutor,
  payload: SlideRedesignJobPayload,
): Promise<Deck> {
  const rows = await executor.query(
    `SELECT deck_json, version
     FROM decks
     WHERE project_id = $1 AND deck_id = $2`,
    [payload.projectId, payload.context.deckId],
  );
  const row = firstRow(rows) as
    | { deck_json?: unknown; version?: unknown }
    | undefined;
  if (!row)
    throw new SlideRedesignProcessorError("SLIDE_REDESIGN_DECK_MISSING", 0);
  const deck = deckSchema.parse(row.deck_json);
  if (
    deck.projectId !== payload.projectId ||
    deck.deckId !== payload.context.deckId ||
    deck.version !== row.version
  ) {
    throw new SlideRedesignProcessorError("SLIDE_REDESIGN_DECK_INVALID", 0);
  }
  return deck;
}

async function setRunningStage(
  executor: QueryExecutor,
  payload: SlideRedesignJobPayload,
  stage: SlideRedesignStage,
  progress: number,
): Promise<Job> {
  return updateJob(executor, payload.jobId, {
    status: "running",
    progress,
    message: stageMessage(stage),
    result: null,
    error: null,
  });
}

async function publishStage(
  publisher: SlideRedesignProgressPublisher,
  payload: SlideRedesignJobPayload,
  stage: SlideRedesignStage,
  completedStages: SlideRedesignStage[],
  now: () => Date,
  previewProposal?: DesignAgentProposal,
): Promise<void> {
  await publisher(
    slideRedesignProgressEventSchema.parse({
      roomId: payload.projectId,
      sessionId: payload.sessionId,
      userId: "system",
      sentAt: now().toISOString(),
      payload: {
        jobId: payload.jobId,
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        stage,
        completedStages,
        ...(previewProposal ? { previewProposal } : {}),
      },
    }),
  );
}

function buildTransientProposal(
  payload: SlideRedesignJobPayload,
  response: NonNullable<SlideRedesignVerifyArtifact["response"]>,
  now: Date,
): DesignAgentProposal {
  if (response.operations.length === 0) {
    throw new SlideRedesignProcessorError("SLIDE_REDESIGN_PROPOSAL_EMPTY", 65);
  }
  return designAgentProposalSchema.parse({
    proposalId: `design_preview_${payload.jobId}`,
    projectId: payload.projectId,
    deckId: payload.context.deckId,
    slideId: payload.context.slide.slideId,
    requestMessageId: payload.requestMessageId,
    baseVersion: payload.context.baseVersion,
    title: "AI 디자인 변경안",
    summary: response.message,
    operations: response.operations,
    interpretedIntent: response.interpretedIntent,
    affectedElementIds: response.affectedElementIds,
    warnings: response.warnings,
    status: "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

function assertProposalApplies(
  deck: Deck,
  proposal: DesignAgentProposal,
): Deck {
  const preview = applyDeckPatch(deck, {
    deckId: proposal.deckId,
    baseVersion: proposal.baseVersion,
    source: "ai",
    operations: proposal.operations,
  });
  if (!preview.ok) {
    throw new SlideRedesignProcessorError(
      "SLIDE_REDESIGN_PROPOSAL_INVALID",
      65,
    );
  }
  return preview.deck;
}

async function resolveComposedImage(
  dataSource: DataSource,
  payload: SlideRedesignJobPayload,
  previewDeck: Deck,
  composed: ReturnType<typeof slideRedesignComposeArtifactSchema.parse>,
  options: SlideRedesignProcessorOptions,
) {
  const request = composed.imageRequests[0];
  if (!request || !composed.response) return composed;
  emitImageEvent(options, "slide_redesign.image.started", {
    jobId: payload.jobId,
    projectId: payload.projectId,
    assetRole: request.assetRole,
    requestCount: composed.imageRequests.length,
  });
  if (!options.imageRuntime || !options.storage) {
    emitImageEvent(options, "slide_redesign.image.completed", {
      jobId: payload.jobId,
      projectId: payload.projectId,
      assetRole: request.assetRole,
      resolved: false,
      warningCount: 1,
    });
    return slideRedesignComposeArtifactSchema.parse({
      ...composed,
      response: {
        ...composed.response,
        warnings: uniqueWarnings([
          ...composed.response.warnings,
          "Image runtime was unavailable; styled media fallback retained.",
        ]),
      },
    });
  }
  const resolution = await (
    options.resolveImageAssets ?? resolveSlideImageAssets
  )(
    dataSource,
    options.storage,
    previewDeck,
    {
      ...request,
      slideId: payload.context.slide.slideId,
      palette: payload.selectedPaletteOption.palette,
    },
    options.imageRuntime,
    { userId: payload.userId },
    options.onImageFallback,
  );
  const resolved = !resolution.deck.slides.some((slide) =>
    slide.elements.some(
      (element) => element.elementId === request.placeholderElementId,
    ),
  );
  emitImageEvent(options, "slide_redesign.image.completed", {
    jobId: payload.jobId,
    projectId: payload.projectId,
    assetRole: request.assetRole,
    resolved,
    warningCount: resolution.warnings.length,
  });
  return slideRedesignComposeArtifactSchema.parse({
    ...composed,
    response: mergeResolvedImageResponse(
      composed.response,
      resolution.deck,
      request.placeholderElementId,
      request.assetRole,
      payload.context.canvas,
      resolution.warnings,
    ),
  });
}

function emitImageEvent(
  options: SlideRedesignProcessorOptions,
  event: string,
  fields: Record<string, unknown>,
): void {
  try {
    options.imageEventLogger?.(event, fields);
  } catch {
    // Business-event logging must not change image fallback behavior.
  }
}

function mergeResolvedImageResponse(
  response: NonNullable<
    ReturnType<typeof slideRedesignComposeArtifactSchema.parse>["response"]
  >,
  resolvedDeck: Deck,
  placeholderElementId: string,
  assetRole: "atmosphere" | "evidence" | "decoration",
  canvas: SlideRedesignJobPayload["context"]["canvas"],
  warnings: string[],
) {
  const slide =
    resolvedDeck.slides.find((item) =>
      item.elements.some(
        (element) => element.elementId === placeholderElementId,
      ),
    ) ??
    resolvedDeck.slides.find((item) =>
      item.elements.some(
        (element) =>
          element.elementId ===
          placeholderElementId.replace(/_media_placeholder$/, "_media_asset"),
      ),
    );
  const assetElementId = placeholderElementId.replace(
    /_media_placeholder$/,
    "_media_asset",
  );
  const imageElement = slide?.elements.find(
    (element) =>
      element.elementId === assetElementId && element.type === "image",
  );
  if (!imageElement) {
    return {
      ...response,
      warnings: uniqueWarnings([...response.warnings, ...warnings]),
    };
  }

  const placeholderOperation = response.operations.find(
    (operation) =>
      operation.type === "add_element" &&
      operation.element.elementId === placeholderElementId,
  );
  const placeholder =
    placeholderOperation?.type === "add_element"
      ? placeholderOperation.element
      : undefined;
  const isBackground =
    assetRole === "atmosphere" &&
    placeholder !== undefined &&
    placeholder.x <= canvas.width * 0.05 &&
    placeholder.y <= canvas.height * 0.05 &&
    placeholder.width >= canvas.width * 0.9 &&
    placeholder.height >= canvas.height * 0.9;
  const captionElementId = placeholderElementId.replace(
    /_media_placeholder$/,
    "_media_caption",
  );
  let operations = response.operations.filter(
    (operation) =>
      operation.type !== "add_element" ||
      operation.element.elementId !== captionElementId,
  );
  if (isBackground && imageElement.type === "image") {
    operations = operations
      .filter(
        (operation) =>
          operation.type !== "add_element" ||
          operation.element.elementId !== placeholderElementId,
      )
      .map((operation) =>
        operation.type === "update_slide_style"
          ? {
              ...operation,
              style: {
                ...operation.style,
                backgroundImage: {
                  src: imageElement.props.src,
                  alt: imageElement.props.alt,
                  fit: imageElement.props.fit,
                  opacity: 1,
                },
              },
            }
          : operation,
      );
  } else {
    operations = operations.map((operation) =>
      operation.type === "add_element" &&
      operation.element.elementId === placeholderElementId
        ? { ...operation, element: imageElement }
        : operation,
    );
  }
  return {
    ...response,
    operations,
    affectedElementIds: affectedElementIds(operations),
    warnings: uniqueWarnings([...response.warnings, ...warnings]),
  };
}

function affectedElementIds(
  operations: NonNullable<
    ReturnType<typeof slideRedesignComposeArtifactSchema.parse>["response"]
  >["operations"],
): string[] {
  return [
    ...new Set(
      operations.flatMap((operation) => {
        if ("elementId" in operation) return [operation.elementId];
        if (operation.type === "add_element")
          return [operation.element.elementId];
        return [];
      }),
    ),
  ];
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)].slice(0, 20);
}

async function finishVerifiedProposal(
  dataSource: DataSource,
  payload: SlideRedesignJobPayload,
  sourceDeck: Deck,
  verified: SlideRedesignVerifyArtifact,
  now: () => Date,
): Promise<Job> {
  if (verified.outcome !== "applicable" || !verified.response) {
    return finishWithoutProposal(dataSource, payload, {
      outcome: verified.outcome,
      message: outcomeMessage(verified.outcome),
      now,
    });
  }

  const createdAt = now();
  const proposal = buildTransientProposal(
    payload,
    verified.response,
    createdAt,
  );
  assertProposalApplies(sourceDeck, proposal);
  const latestDeck = await loadDeck(dataSource, payload);
  const stale = latestDeck.version !== payload.context.baseVersion;
  const responseMessageId = `design_message_${randomUUID()}`;
  const proposalId = `design_proposal_${randomUUID()}`;
  const persistedProposal = designAgentProposalSchema.parse({
    ...proposal,
    proposalId,
    responseMessageId,
    status: stale ? "stale" : "pending",
  });

  return dataSource.transaction(async (manager) => {
    await insertResponseMessage(manager, payload, {
      responseMessageId,
      content: verified.response!.message,
      now: createdAt,
    });
    await markRequestMessageSucceeded(
      manager,
      payload.requestMessageId,
      createdAt,
    );
    await manager.query(
      `INSERT INTO design_agent_proposals (
         proposal_id, project_id, deck_id, slide_id, request_message_id,
         response_message_id, base_version, title, summary, operations,
         interpreted_intent, affected_element_ids, warnings, status,
         applied_change_id, rejected_reason, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, null, null, $15, $15
       )`,
      [
        proposalId,
        payload.projectId,
        payload.context.deckId,
        payload.context.slide.slideId,
        payload.requestMessageId,
        responseMessageId,
        payload.context.baseVersion,
        persistedProposal.title,
        persistedProposal.summary ?? null,
        persistedProposal.operations,
        persistedProposal.interpretedIntent ?? null,
        persistedProposal.affectedElementIds,
        persistedProposal.warnings,
        persistedProposal.status,
        createdAt,
      ],
    );
    return updateJob(manager, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: stale
        ? "Slide redesign completed but is stale."
        : "Slide redesign completed.",
      result: slideRedesignJobResultSchema.parse({
        outcome: "applicable",
        sessionId: payload.sessionId,
        requestMessageId: payload.requestMessageId,
        responseMessageId,
        proposal: persistedProposal,
        stale,
      }),
      error: null,
    });
  });
}

async function finishWithoutProposal(
  dataSource: DataSource,
  payload: SlideRedesignJobPayload,
  input: {
    outcome: SlideRedesignInterpretArtifact["outcome"] | "stale";
    message: string;
    now: () => Date;
  },
): Promise<Job> {
  const timestamp = input.now();
  const responseMessageId = `design_message_${randomUUID()}`;
  return dataSource.transaction(async (manager) => {
    await insertResponseMessage(manager, payload, {
      responseMessageId,
      content: input.message,
      now: timestamp,
    });
    await markRequestMessageSucceeded(
      manager,
      payload.requestMessageId,
      timestamp,
    );
    return updateJob(manager, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message:
        input.outcome === "stale"
          ? "Slide redesign request is stale."
          : "Slide redesign completed without a proposal.",
      result: slideRedesignJobResultSchema.parse({
        outcome: input.outcome,
        sessionId: payload.sessionId,
        requestMessageId: payload.requestMessageId,
        responseMessageId,
        stale: input.outcome === "stale",
      }),
      error: null,
    });
  });
}

async function insertResponseMessage(
  manager: EntityManager,
  payload: SlideRedesignJobPayload,
  input: { responseMessageId: string; content: string; now: Date },
): Promise<void> {
  await manager.query(
    `INSERT INTO design_agent_messages (
       message_id, session_id, project_id, actor_user_id, deck_id, slide_id,
       role, content, status, context_json, error_code, error_message,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'assistant', $7, 'succeeded',
       null, null, null, $8, $8)`,
    [
      input.responseMessageId,
      payload.sessionId,
      payload.projectId,
      payload.userId,
      payload.context.deckId,
      payload.context.slide.slideId,
      input.content,
      input.now,
    ],
  );
}

async function markRequestMessageSucceeded(
  manager: EntityManager,
  requestMessageId: string,
  now: Date,
): Promise<void> {
  await manager.query(
    `UPDATE design_agent_messages
     SET status = 'succeeded', error_code = null, error_message = null,
         updated_at = $2
     WHERE message_id = $1`,
    [requestMessageId, now],
  );
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  requestMessageId: string,
  progress: number,
  code: string,
): Promise<Job> {
  return dataSource.transaction(async (manager) => {
    if (requestMessageId) {
      await manager.query(
        `UPDATE design_agent_messages
         SET status = 'failed', error_code = $2, error_message = $3,
             updated_at = now()
         WHERE message_id = $1`,
        [requestMessageId, code, "Slide redesign could not be completed."],
      );
    }
    return updateJob(manager, jobId, {
      status: "failed",
      progress,
      message: "Slide redesign failed.",
      result: null,
      error: { code, message: "Slide redesign could not be completed." },
    });
  });
}

async function updateJob(
  executor: QueryExecutor,
  jobId: string,
  patch: Pick<Job, "status" | "progress" | "message" | "result" | "error">,
): Promise<Job> {
  const rows = await executor.query(
    `UPDATE jobs
     SET status = $2, progress = $3, message = $4, result = $5, error = $6,
         updated_at = now()
     WHERE job_id = $1
     RETURNING *`,
    [
      jobId,
      patch.status,
      patch.progress,
      patch.message,
      patch.result,
      patch.error,
    ],
  );
  const raw = firstRow(rows) as Record<string, unknown> | undefined;
  if (!raw) throw new Error(`Job not found: ${jobId}`);
  return jobSchema.parse({
    jobId: raw.job_id,
    projectId: raw.project_id,
    type: raw.type,
    status: raw.status,
    progress: raw.progress,
    message: raw.message,
    result: raw.result,
    error: raw.error,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
  });
}

function classifyFailure(
  error: unknown,
  progress: number,
): {
  code: string;
  progress: number;
} {
  if (error instanceof SlideRedesignProcessorError) {
    return { code: error.code, progress: error.progress };
  }
  if (error instanceof SlideRedesignStageClientError) {
    return { code: error.code, progress };
  }
  return { code: "SLIDE_REDESIGN_FAILED", progress };
}

class SlideRedesignProcessorError extends Error {
  constructor(
    readonly code: string,
    readonly progress: number,
  ) {
    super(code);
    this.name = "SlideRedesignProcessorError";
  }
}

function stageMessage(stage: SlideRedesignStage): string {
  switch (stage) {
    case "interpreting":
      return "Reading slide.";
    case "composing":
      return "Selecting composition.";
    case "coloring":
      return "Applying palette.";
    case "ornamenting":
      return "Adding ornaments.";
    case "illustrating":
      return "Preparing imagery.";
    case "verifying":
      return "Verifying proposal.";
  }
}

function outcomeMessage(
  outcome: SlideRedesignInterpretArtifact["outcome"],
): string {
  return outcome === "refused-unsafe"
    ? "안전하게 변경할 수 없는 요소가 있어 리디자인을 진행하지 않았습니다."
    : "현재 슬라이드는 자동 리디자인을 지원하지 않습니다.";
}

function firstRow(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  if (Array.isArray(value[0])) return value[0][0];
  return value[0];
}

function readPayloadString(
  value: unknown,
  key: "jobId" | "requestMessageId",
): string {
  if (!value || typeof value !== "object" || !(key in value)) return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : "";
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("Job timestamp is invalid.");
}
