import { randomUUID } from "node:crypto";
import { applyDeckPatch } from "@orbit/editor-core";
import {
  deckSchema,
  designAgentProposalSchema,
  designAgentWorkerRequestSchema,
  jobSchema,
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
import type { DataSource, EntityManager } from "typeorm";
import {
  SlideRedesignPythonClient,
  SlideRedesignStageClientError,
  type SlideRedesignStageClient,
} from "./slide-redesign-python.client";

type QueryExecutor = DataSource | EntityManager;

export type SlideRedesignProgressPublisher = (
  event: SlideRedesignProgressEvent,
) => Promise<void>;

export interface SlideRedesignProcessorOptions {
  client?: SlideRedesignStageClient;
  publishProgress?: SlideRedesignProgressPublisher;
  now?: () => Date;
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
    assertProposalApplies(sourceDeck, previewProposal);
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

    failureProgress = 80;
    await setRunningStage(dataSource, payload, "verifying", failureProgress);
    await publishStage(
      publishProgress,
      payload,
      "verifying",
      ["interpreting", "composing", "coloring", "ornamenting"],
      now,
    );
    const verified = await client.verify(request, composed);
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
): void {
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
