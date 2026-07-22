import { applyDeckPatch, createDemoDeck } from "@orbit/editor-core";
import {
  deckSchema,
  designAgentCapabilities,
  slideRedesignJobPayloadSchema,
  slideRedesignJobResultSchema,
  type Deck,
  type SlideRedesignJobPayload,
} from "@orbit/shared";
import type { DataSource, EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import {
  SlideRedesignStageClientError,
  type SlideRedesignStageClient,
} from "./slide-redesign-python.client";
import { processSlideRedesignJob } from "./slide-redesign.processor";

describe("processSlideRedesignJob", () => {
  it("runs layout stages in order, skips illustrating, and publishes a read-only preview", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    const progressEvents: unknown[] = [];

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        publishProgress: async (event) => {
          progressEvents.push(event);
        },
        now: fixedClock(),
      },
    );

    expect(client.interpret).toHaveBeenCalledTimes(1);
    expect(client.compose).toHaveBeenCalledTimes(1);
    expect(client.verify).toHaveBeenCalledTimes(1);
    expect(
      progressEvents.map((event) =>
        event && typeof event === "object" && "payload" in event
          ? (event.payload as { stage: string }).stage
          : "",
      ),
    ).toEqual([
      "interpreting",
      "composing",
      "coloring",
      "ornamenting",
      "verifying",
    ]);
    const previewEvent = progressEvents[3] as {
      payload: { previewProposal?: { proposalId: string; status: string } };
    };
    expect(previewEvent.payload.previewProposal).toMatchObject({
      proposalId: `design_preview_${payload.jobId}`,
      status: "pending",
    });
    expect(
      progressEvents.some((event) =>
        JSON.stringify(event).includes("illustrating"),
      ),
    ).toBe(false);

    expect(job.status).toBe("succeeded");
    expect(job.progress).toBe(100);
    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(result.outcome).toBe("applicable");
    expect(result.stale).toBe(false);
    expect(result.proposal?.status).toBe("pending");
    expect(database.proposals).toHaveLength(1);
    expect(database.proposals[0]?.status).toBe("pending");
    expect(database.requestStatus).toBe("succeeded");
    expect(database.responseMessages).toHaveLength(1);
    expect(JSON.stringify(database.persistedParameters)).not.toContain(
      '"stage":"interpret"',
    );
    expect(JSON.stringify(database.persistedParameters)).not.toContain(
      '"stage":"compose"',
    );
  });

  it("persists a verified proposal as stale when the Deck changes during the job", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.verify.mockImplementationOnce(async () => {
      database.deck.version += 1;
      return verifyArtifact(payload);
    });

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      { client, now: fixedClock() },
    );

    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(result.outcome).toBe("applicable");
    expect(result.stale).toBe(true);
    expect(result.proposal?.status).toBe("stale");
    expect(database.proposals[0]?.status).toBe("stale");
  });

  it("short-circuits a stale Deck before stage or image provider work", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    database.deck.version += 1;
    const client = stageClient(payload);
    const generate = vi.fn();

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        now: fixedClock(),
        imageRuntime: {
          generated: { generate },
          maxPerDeck: 1,
          maxPerUserPerDay: 1,
        },
        storage: { putObject: vi.fn() },
      },
    );

    expect(client.interpret).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(database.proposals).toEqual([]);
    expect(slideRedesignJobResultSchema.parse(job.result)).toMatchObject({
      outcome: "stale",
      stale: true,
    });
  });

  it("runs illustrating only for a generation request and verifies the resolved image patch", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.compose.mockResolvedValueOnce(imageComposeArtifact(payload, 2));
    client.verify.mockImplementationOnce(async (_request, artifact) => {
      if (!artifact.response) throw new Error("compose response is missing");
      return {
        stage: "verify",
        outcome: "applicable",
        response: artifact.response,
      };
    });
    const resolveImageAssets = vi.fn(async (...args: unknown[]) => {
      const previewDeck = args[2] as Deck;
      return {
        deck: resolvedPreviewDeck(previewDeck),
        warnings: [],
        diagnostics: [],
      };
    });
    const progressEvents: Array<{ payload: { stage: string } }> = [];

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        now: fixedClock(),
        publishProgress: async (event) => {
          progressEvents.push(event);
        },
        imageRuntime: { maxPerDeck: 1, maxPerUserPerDay: 1 },
        storage: { putObject: vi.fn() },
        resolveImageAssets,
      },
    );

    expect(progressEvents.map((event) => event.payload.stage)).toEqual([
      "interpreting",
      "composing",
      "coloring",
      "ornamenting",
      "illustrating",
      "verifying",
    ]);
    expect(resolveImageAssets).toHaveBeenCalledTimes(1);
    const verifiedArtifact = client.verify.mock.calls[0]?.[1];
    expect(verifiedArtifact?.response?.operations).toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_media_asset",
          type: "image",
        }),
      }),
    );
    expect(verifiedArtifact?.response?.operations).toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_2_media_placeholder",
          type: "rect",
        }),
      }),
    );
    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(result.proposal?.operations).toEqual(
      verifiedArtifact?.response?.operations,
    );
  });

  it("keeps source text, element references, animations, and semantic cues through the image flow", async () => {
    const payload = jobPayload();
    const sourceSlide = payload.context.slide;
    const sourceElement = sourceSlide.elements.find(
      (element) => element.type === "text",
    );
    if (!sourceElement || sourceElement.type !== "text") {
      throw new Error("text fixture is missing");
    }
    sourceSlide.semanticCues = [
      {
        cueId: "scue_redesign_preserved",
        slideId: sourceSlide.slideId,
        meaning: "발표자는 원문의 핵심 메시지를 설명한다",
        importance: "core",
        reviewStatus: "approved",
        freshness: "current",
        origin: "manual",
        revision: 1,
        sourceRefs: [],
        qualityWarnings: [],
        required: true,
        priority: 1,
        candidateKeywords: ["ORBIT"],
        aliases: {},
        requiredConcepts: ["핵심 메시지"],
        nliHypotheses: ["발표자는 원문의 핵심 메시지를 설명했다"],
        negativeHints: [],
        targetElementIds: [sourceElement.elementId],
        triggerActionIds: [],
      },
    ];
    const sourceDeckFixture = createDemoDeck();
    sourceDeckFixture.slides[0] = structuredClone(sourceSlide);
    const sourceDeck = deckSchema.parse(sourceDeckFixture);
    const normalizedSourceSlide = sourceDeck.slides[0]!;
    const originalText = normalizedSourceSlide.elements
      .filter((element) => element.type === "text")
      .map((element) => ({
        elementId: element.elementId,
        text: element.props.text,
      }));
    const originalImageElementIds = normalizedSourceSlide.elements
      .filter((element) => element.type === "image")
      .map((element) => element.elementId);
    const originalAnimations = structuredClone(normalizedSourceSlide.animations);
    const originalSemanticCues = structuredClone(
      normalizedSourceSlide.semanticCues,
    );
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.compose.mockResolvedValueOnce(imageComposeArtifact(payload));
    client.verify.mockImplementationOnce(async (_request, artifact) => ({
      stage: "verify",
      outcome: "applicable",
      response: artifact.response,
    }));
    const progressEvents: Array<{
      payload: { stage: string; previewProposal?: { operations: unknown[] } };
    }> = [];

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        now: fixedClock(),
        publishProgress: async (event) => {
          progressEvents.push(event);
        },
        imageRuntime: { maxPerDeck: 1, maxPerUserPerDay: 1 },
        storage: { putObject: vi.fn() },
        resolveImageAssets: vi.fn(async (...args: unknown[]) => ({
          deck: resolvedPreviewDeck(args[2] as Deck),
          warnings: [],
          diagnostics: [],
        })),
      },
    );

    const intermediate = progressEvents.find(
      (event) => event.payload.stage === "ornamenting",
    )?.payload.previewProposal;
    expect(intermediate?.operations).toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_media_placeholder",
          type: "rect",
        }),
      }),
    );
    expect(JSON.stringify(intermediate)).not.toContain(
      "el_redesign_media_asset",
    );

    const result = slideRedesignJobResultSchema.parse(job.result);
    const proposal = result.proposal;
    expect(proposal?.operations).toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_media_asset",
          type: "image",
        }),
      }),
    );
    if (!proposal) throw new Error("final proposal is missing");
    const applied = applyDeckPatch(sourceDeck, {
      deckId: proposal.deckId,
      baseVersion: proposal.baseVersion,
      source: "ai",
      operations: proposal.operations,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    const appliedSlide = applied.deck.slides[0]!;
    expect(
      appliedSlide.elements
        .filter((element) => element.type === "text")
        .map((element) => ({
          elementId: element.elementId,
          text: element.props.text,
        })),
    ).toEqual(originalText);
    expect(appliedSlide.animations).toHaveLength(originalAnimations.length);
    for (const animation of originalAnimations) {
      expect(
        appliedSlide.animations.find(
          (candidate) => candidate.animationId === animation.animationId,
        ),
      ).toEqual(expect.objectContaining(animation));
    }
    expect(appliedSlide.semanticCues).toEqual(originalSemanticCues);
    expect(
      appliedSlide.elements.filter((element) => element.type === "image"),
    ).toHaveLength(originalImageElementIds.length + 1);
    for (const elementId of originalImageElementIds) {
      expect(
        appliedSlide.elements.some((element) => element.elementId === elementId),
      ).toBe(true);
    }
    expect(
      appliedSlide.elements.filter(
        (element) => element.elementId === "el_redesign_media_asset",
      ),
    ).toHaveLength(1);
  });

  it("keeps layout operations and succeeds when image resolution falls back", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.compose.mockResolvedValueOnce(imageComposeArtifact(payload));
    client.verify.mockImplementationOnce(async (_request, artifact) => {
      if (!artifact.response) throw new Error("compose response is missing");
      return {
        stage: "verify",
        outcome: "applicable",
        response: artifact.response,
      };
    });

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        now: fixedClock(),
        imageRuntime: { maxPerDeck: 1, maxPerUserPerDay: 1 },
        storage: { putObject: vi.fn() },
        resolveImageAssets: vi.fn(async (...args: unknown[]) => ({
          deck: args[2] as Deck,
          warnings: ["Image fallback retained."],
          diagnostics: [],
        })),
      },
    );

    expect(job.status).toBe("succeeded");
    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(result.proposal?.warnings).toContain("Image fallback retained.");
    expect(result.proposal?.operations).toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_media_placeholder",
          type: "rect",
        }),
      }),
    );
  });

  it("contains provider failure details while succeeding with the styled fallback", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.compose.mockResolvedValueOnce(imageComposeArtifact(payload));
    client.verify.mockImplementationOnce(async (_request, artifact) => ({
      stage: "verify",
      outcome: "applicable",
      response: artifact.response,
    }));
    const fallbackDiagnostics: unknown[] = [];
    const imageEvents: unknown[] = [];
    const putObject = vi.fn();

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        now: fixedClock(),
        imageRuntime: {
          generated: {
            generate: vi.fn(async () => {
              throw new Error("SECRET_PROVIDER_FAILURE_BODY");
            }),
          },
          maxPerDeck: 1,
          maxPerUserPerDay: 30,
        },
        storage: { putObject },
        onImageFallback: (diagnostic) => {
          fallbackDiagnostics.push(diagnostic);
        },
        imageEventLogger: (event, fields) => {
          imageEvents.push({ event, fields });
        },
      },
    );

    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(job.status).toBe("succeeded");
    expect(result.proposal?.operations).toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_media_placeholder",
          type: "rect",
        }),
      }),
    );
    expect(result.proposal?.warnings).toContainEqual(
      expect.stringContaining("layout operations remain available"),
    );
    expect(putObject).not.toHaveBeenCalled();
    expect(fallbackDiagnostics).toEqual([
      expect.objectContaining({
        provider: "openai",
        reasonCode: "IMAGE_PROVIDER_UNAVAILABLE",
      }),
    ]);
    expect(imageEvents).toEqual([
      expect.objectContaining({ event: "slide_redesign.image.started" }),
      expect.objectContaining({ event: "slide_redesign.image.completed" }),
    ]);
    expect(
      JSON.stringify({ job, fallbackDiagnostics, imageEvents }),
    ).not.toContain("SECRET_PROVIDER_FAILURE_BODY");
    expect(JSON.stringify(imageEvents)).not.toContain(payload.question);
    expect(JSON.stringify(imageEvents)).not.toContain(
      payload.context.slide.speakerNotes,
    );
  });

  it("maps a full-slide atmosphere asset to backgroundImage", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.compose.mockResolvedValueOnce(
      imageComposeArtifact(payload, 1, true),
    );
    client.verify.mockImplementationOnce(async (_request, artifact) => {
      if (!artifact.response) throw new Error("compose response is missing");
      return {
        stage: "verify",
        outcome: "applicable",
        response: artifact.response,
      };
    });

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      {
        client,
        now: fixedClock(),
        imageRuntime: { maxPerDeck: 1, maxPerUserPerDay: 1 },
        storage: { putObject: vi.fn() },
        resolveImageAssets: vi.fn(async (...args: unknown[]) => ({
          deck: resolvedPreviewDeck(args[2] as Deck),
          warnings: [],
          diagnostics: [],
        })),
      },
    );

    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(result.proposal?.operations).toContainEqual(
      expect.objectContaining({
        type: "update_slide_style",
        style: expect.objectContaining({
          backgroundImage: expect.objectContaining({
            src: "/api/v1/projects/project-1/assets/file-1/content",
          }),
        }),
      }),
    );
    expect(result.proposal?.operations).not.toContainEqual(
      expect.objectContaining({
        type: "add_element",
        element: expect.objectContaining({
          elementId: "el_redesign_media_asset",
        }),
      }),
    );
  });

  it("short-circuits an unsafe interpretation without compose or a proposal", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.interpret.mockResolvedValueOnce({
      stage: "interpret",
      outcome: "refused-unsafe",
      reason: "unsupported-element-type",
      provenance: {},
    });

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      { client, now: fixedClock() },
    );

    expect(client.compose).not.toHaveBeenCalled();
    expect(client.verify).not.toHaveBeenCalled();
    expect(database.proposals).toEqual([]);
    expect(job.status).toBe("succeeded");
    const result = slideRedesignJobResultSchema.parse(job.result);
    expect(result).toMatchObject({
      outcome: "refused-unsafe",
      stale: false,
    });
    expect(result).not.toHaveProperty("proposal");
  });

  it("fails at the current stage without persisting a partial proposal", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    const client = stageClient(payload);
    client.verify.mockRejectedValueOnce(
      new SlideRedesignStageClientError(
        "SLIDE_REDESIGN_STAGE_FAILED",
        "provider failed",
      ),
    );

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      { client, now: fixedClock() },
    );

    expect(job).toMatchObject({
      status: "failed",
      progress: 80,
      result: null,
      error: {
        code: "SLIDE_REDESIGN_STAGE_FAILED",
        message: "Slide redesign could not be completed.",
      },
    });
    expect(database.proposals).toEqual([]);
    expect(database.responseMessages).toEqual([]);
    expect(database.requestStatus).toBe("failed");
    expect(JSON.stringify(job)).not.toContain("provider failed");
  });

  it("rolls back final message and proposal writes before marking the job failed", async () => {
    const payload = jobPayload();
    const database = new FakeSlideRedesignDatabase(payload);
    database.failProposalInsert = true;

    const job = await processSlideRedesignJob(
      database.dataSource,
      "http://python-worker:8000",
      payload,
      { client: stageClient(payload), now: fixedClock() },
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("SLIDE_REDESIGN_FAILED");
    expect(database.proposals).toEqual([]);
    expect(database.responseMessages).toEqual([]);
    expect(database.requestStatus).toBe("failed");
  });
});

class FakeSlideRedesignDatabase {
  readonly deck: Deck;
  readonly dataSource: DataSource;
  readonly proposals: Array<{ proposalId: string; status: string }> = [];
  readonly responseMessages: string[] = [];
  readonly persistedParameters: unknown[][] = [];
  requestStatus = "pending";
  failProposalInsert = false;
  private job: Record<string, unknown>;

  constructor(payload: SlideRedesignJobPayload) {
    this.deck = createDemoDeck();
    this.deck.projectId = payload.projectId;
    this.deck.deckId = payload.context.deckId;
    this.deck.version = payload.context.baseVersion;
    this.job = {
      job_id: payload.jobId,
      project_id: payload.projectId,
      type: "slide-redesign",
      status: "queued",
      progress: 0,
      message: "Job queued",
      result: null,
      error: null,
      created_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z",
    };
    const query = vi.fn((sql: string, parameters: unknown[] = []) =>
      this.execute(sql, parameters),
    );
    const manager = { query } as unknown as EntityManager;
    this.dataSource = {
      query,
      transaction: vi.fn(
        async (operation: (manager: EntityManager) => unknown) => {
          const snapshot = {
            job: structuredClone(this.job),
            proposals: structuredClone(this.proposals),
            responseMessages: [...this.responseMessages],
            requestStatus: this.requestStatus,
            parameterCount: this.persistedParameters.length,
          };
          try {
            return await operation(manager);
          } catch (error) {
            this.job = snapshot.job;
            this.proposals.splice(
              0,
              this.proposals.length,
              ...snapshot.proposals,
            );
            this.responseMessages.splice(
              0,
              this.responseMessages.length,
              ...snapshot.responseMessages,
            );
            this.requestStatus = snapshot.requestStatus;
            this.persistedParameters.splice(snapshot.parameterCount);
            throw error;
          }
        },
      ),
    } as unknown as DataSource;
  }

  private async execute(sql: string, parameters: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.persistedParameters.push(parameters);
    if (normalized.startsWith("SELECT deck_json, version")) {
      return [
        { deck_json: structuredClone(this.deck), version: this.deck.version },
      ];
    }
    if (normalized.startsWith("SELECT count(*) FILTER")) {
      return [{ user_count: "0" }];
    }
    if (normalized.startsWith("UPDATE jobs")) {
      this.job = {
        ...this.job,
        status: parameters[1],
        progress: parameters[2],
        message: parameters[3],
        result: parameters[4],
        error: parameters[5],
        updated_at: "2026-07-22T00:00:01.000Z",
      };
      return [structuredClone(this.job)];
    }
    if (normalized.startsWith("INSERT INTO design_agent_messages")) {
      this.responseMessages.push(String(parameters[0]));
      return [];
    }
    if (
      normalized.startsWith("UPDATE design_agent_messages") &&
      normalized.includes("status = 'succeeded'")
    ) {
      this.requestStatus = "succeeded";
      return [];
    }
    if (
      normalized.startsWith("UPDATE design_agent_messages") &&
      normalized.includes("status = 'failed'")
    ) {
      this.requestStatus = "failed";
      return [];
    }
    if (normalized.startsWith("INSERT INTO design_agent_proposals")) {
      if (this.failProposalInsert) throw new Error("proposal insert failed");
      this.proposals.push({
        proposalId: String(parameters[0]),
        status: String(parameters[13]),
      });
      return [];
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function jobPayload(): SlideRedesignJobPayload {
  const deck = createDemoDeck();
  return slideRedesignJobPayloadSchema.parse({
    jobId: "job-redesign-1",
    projectId: deck.projectId,
    userId: "user-1",
    requestMessageId: "message-request-1",
    sessionId: "session-1",
    question: "Redesign this slide",
    context: {
      deckId: deck.deckId,
      baseVersion: deck.version,
      canvas: deck.canvas,
      slide: deck.slides[0]!,
      selectedElementIds: [],
      theme: deck.theme,
    },
    history: [],
    capabilities: designAgentCapabilities,
    selectedPaletteOption: {
      optionId: "calm-blue",
      name: "Calm blue",
      isCurrentTheme: false,
      palette: {
        dominant: "#EFF6FF",
        surface: "#FFFFFF",
        text: "#172554",
        focal: "#2563EB",
        secondary: "#0F766E",
      },
      rationale: "Use a restrained blue palette.",
    },
  });
}

function stageClient(payload: SlideRedesignJobPayload) {
  return {
    interpret: vi.fn<SlideRedesignStageClient["interpret"]>(async () =>
      interpretArtifact(),
    ),
    compose: vi.fn<SlideRedesignStageClient["compose"]>(async () =>
      composeArtifact(payload),
    ),
    verify: vi.fn<SlideRedesignStageClient["verify"]>(async () =>
      verifyArtifact(payload),
    ),
  };
}

function interpretArtifact() {
  return {
    stage: "interpret" as const,
    outcome: "applicable" as const,
    slideTypeSource: "heuristic" as const,
    summary: {
      title: "Sample",
      message: "Sample",
      contentItems: [],
      slideType: "title" as const,
      visualIntent: {},
      mediaIntent: { alt: "" },
    },
    provenance: {},
    constraints: {
      referencedElementIds: [],
      lockedElementIds: [],
      groupedElementIds: [],
      ooxmlElementIds: [],
    },
  };
}

function composeArtifact(payload: SlideRedesignJobPayload) {
  return {
    stage: "compose" as const,
    outcome: "applicable" as const,
    response: stageResponse(payload),
    candidateCount: 2,
    safeCandidateCount: 1,
    chosenCompositionId: "title-statement",
    irreversibleCount: 0,
    ornamentApplied: true,
    imageRequests: [],
  };
}

function imageComposeArtifact(
  payload: SlideRedesignJobPayload,
  requestCount = 1,
  fullBleed = false,
) {
  const template = payload.context.slide.elements.find(
    (element) => element.type === "rect",
  );
  if (!template || template.type !== "rect") {
    throw new Error("rect fixture is missing");
  }
  return {
    ...composeArtifact(payload),
    response: {
      ...stageResponse(payload),
      operations: [
        ...stageResponse(payload).operations,
        {
          type: "add_element" as const,
          slideId: payload.context.slide.slideId,
          element: {
            ...template,
            elementId: "el_redesign_media_placeholder",
            role: "media" as const,
            x: fullBleed ? 0 : 960,
            y: fullBleed ? 0 : 120,
            width: fullBleed ? payload.context.canvas.width : 840,
            height: fullBleed ? payload.context.canvas.height : 720,
            props: { ...template.props, fill: "#DBEAFE" },
          },
        },
        ...(requestCount > 1
          ? [
              {
                type: "add_element" as const,
                slideId: payload.context.slide.slideId,
                element: {
                  ...template,
                  elementId: "el_redesign_2_media_placeholder",
                  role: "media" as const,
                  x: 120,
                  y: 780,
                  width: 480,
                  height: 240,
                  props: { ...template.props, fill: "#E0F2FE" },
                },
              },
            ]
          : []),
      ],
      affectedElementIds: [
        "el_redesign_media_placeholder",
        ...(requestCount > 1 ? ["el_redesign_2_media_placeholder"] : []),
      ],
    },
    imageRequests: [
      {
        placeholderElementId: "el_redesign_media_placeholder",
        assetRole: "atmosphere" as const,
        needsGeneration: true as const,
        prompt: "Calm abstract collaboration",
        alt: "Calm abstract collaboration",
      },
      ...(requestCount > 1
        ? [
            {
              placeholderElementId: "el_redesign_2_media_placeholder",
              assetRole: "atmosphere" as const,
              needsGeneration: true as const,
              prompt: "Secondary abstract collaboration",
              alt: "Secondary abstract collaboration",
            },
          ]
        : []),
    ],
  };
}

function resolvedPreviewDeck(previewDeck: Deck): Deck {
  const raw = structuredClone(previewDeck);
  const slide = raw.slides[0]!;
  slide.elements = slide.elements.map((element) =>
    element.elementId === "el_redesign_media_placeholder"
      ? ({
          ...element,
          elementId: "el_redesign_media_asset",
          type: "image",
          props: {
            src: "/api/v1/projects/project-1/assets/file-1/content",
            alt: "Calm abstract collaboration",
            fit: "cover",
            focusX: 0.5,
            focusY: 0.5,
          },
        } as never)
      : element,
  );
  return deckSchema.parse(raw);
}

function verifyArtifact(payload: SlideRedesignJobPayload) {
  return {
    stage: "verify" as const,
    outcome: "applicable" as const,
    response: stageResponse(payload),
  };
}

function stageResponse(payload: SlideRedesignJobPayload) {
  return {
    message: "Redesign ready",
    interpretedIntent: {
      target: "current-slide" as const,
      action: "redesign-slide",
      alignment: null,
    },
    operations: [
      {
        type: "update_slide_style" as const,
        slideId: payload.context.slide.slideId,
        style: { backgroundColor: "#F8FAFC" },
      },
    ],
    affectedElementIds: [],
    warnings: [],
    smartArtRequest: null,
    uiAction: null,
  };
}

function fixedClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 22, 0, 0, tick++));
}
