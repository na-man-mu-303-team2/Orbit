import { createDemoDeck } from "@orbit/editor-core";
import type { Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { DecksService } from "../decks/decks.service";
import type { JobsService } from "../jobs/jobs.service";
import { DesignAgentMessageEntity } from "./design-agent-message.entity";
import { SlideRedesignJobService } from "./slide-redesign-job.service";

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({
    JOB_QUEUE_DRIVER: "bullmq",
    REDIS_URL: "redis://test",
  }),
}));

const paletteOptions = [
  {
    optionId: "current-theme",
    name: "Current theme",
    isCurrentTheme: true,
    palette: {
      dominant: "#FFFFFF",
      surface: "#F8FAFC",
      text: "#111827",
      focal: "#3B82F6",
      secondary: "#7C3AED",
    },
    rationale: "Keep the current theme.",
  },
  {
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
  {
    optionId: "vivid-coral",
    name: "Vivid coral",
    isCurrentTheme: false,
    palette: {
      dominant: "#FFF7ED",
      surface: "#FFFFFF",
      text: "#431407",
      focal: "#EA580C",
      secondary: "#DB2777",
    },
    rationale: "Use a vivid coral palette.",
  },
] as const;

describe("SlideRedesignJobService", () => {
  it("creates a dedicated job with scoped palette selection and safe logs", async () => {
    const deck = createDemoDeck();
    deck.slides[0]!.speakerNotes = "SECRET_SPEAKER_NOTES";
    const harness = createHarness(deck);
    const request = redesignRequest(deck, "SECRET_REDESIGN_PROMPT");

    const response = await harness.service.create(
      deck.projectId,
      "user-1",
      request,
    );

    expect(response.job.type).toBe("slide-redesign");
    expect(response.requestMessage.status).toBe("pending");
    expect(harness.messagesRepository.find).toHaveBeenCalledWith({
      where: {
        projectId: deck.projectId,
        actorUserId: "user-1",
        sessionId: request.sessionId,
        status: "succeeded",
      },
      order: { createdAt: "DESC" },
      take: 10,
    });
    expect(harness.jobsService.create).toHaveBeenCalledWith({
      projectId: deck.projectId,
      type: "slide-redesign",
      payload: expect.objectContaining({
        sessionId: request.sessionId,
        deckId: deck.deckId,
        slideId: deck.slides[0]!.slideId,
        baseVersion: deck.version,
        selectedPaletteOptionId: "calm-blue",
      }),
    });
    expect(JSON.stringify(harness.jobsService.create.mock.calls)).not.toContain(
      "SECRET_REDESIGN_PROMPT",
    );
    expect(harness.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "SECRET_REDESIGN_PROMPT",
        selectedPaletteOption: expect.objectContaining({
          optionId: "calm-blue",
        }),
        driver: "bullmq",
        redisUrl: "redis://test",
      }),
    );
    const serializedLogs = JSON.stringify([
      harness.logger.info.mock.calls,
      harness.logger.error.mock.calls,
    ]);
    expect(serializedLogs).not.toContain("SECRET_REDESIGN_PROMPT");
    expect(serializedLogs).not.toContain("SECRET_SPEAKER_NOTES");
  });

  it("rejects stale baseVersion before reading palette messages or creating a job", async () => {
    const deck = createDemoDeck();
    const harness = createHarness(deck);
    const request = redesignRequest(deck);
    request.context.baseVersion += 1;

    await expect(
      harness.service.create(deck.projectId, "user-1", request),
    ).rejects.toThrow("baseVersion is stale");

    expect(harness.messagesRepository.find).not.toHaveBeenCalled();
    expect(harness.messagesRepository.save).not.toHaveBeenCalled();
    expect(harness.jobsService.create).not.toHaveBeenCalled();
    expect(harness.enqueue).not.toHaveBeenCalled();
  });

  it("rejects palette options outside the actor, project, and session scope", async () => {
    const deck = createDemoDeck();
    const harness = createHarness(deck, []);

    await expect(
      harness.service.create(deck.projectId, "user-1", redesignRequest(deck)),
    ).rejects.toThrow(
      "selectedPaletteOptionId does not match this design agent session",
    );

    expect(harness.messagesRepository.save).not.toHaveBeenCalled();
    expect(harness.jobsService.create).not.toHaveBeenCalled();
  });

  it("marks both the job and request message failed when enqueue fails", async () => {
    const deck = createDemoDeck();
    const harness = createHarness(deck);
    harness.enqueue.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      harness.service.create(deck.projectId, "user-1", redesignRequest(deck)),
    ).rejects.toThrow("redis unavailable");

    expect(harness.jobsService.update).toHaveBeenCalledWith("job-redesign-1", {
      status: "failed",
      progress: 0,
      message: "Slide redesign enqueue failed.",
      error: {
        code: "SLIDE_REDESIGN_ENQUEUE_FAILED",
        message: "Slide redesign could not be queued.",
      },
    });
    const lastSavedMessage =
      harness.messagesRepository.save.mock.calls.at(-1)?.[0];
    expect(lastSavedMessage).toEqual(
      expect.objectContaining({
        status: "failed",
        errorCode: "SLIDE_REDESIGN_ENQUEUE_FAILED",
        errorMessage: "Slide redesign could not be queued.",
      }),
    );
  });
});

function createHarness(
  deck: ReturnType<typeof createDemoDeck>,
  sessionMessages = [paletteMessage(deck)],
) {
  const messagesRepository = {
    create: vi.fn(
      (value: Partial<DesignAgentMessageEntity>) =>
        value as DesignAgentMessageEntity,
    ),
    save: vi.fn(async (value: DesignAgentMessageEntity) => value),
    find: vi.fn(async () => sessionMessages),
  };
  const jobsService = {
    create: vi.fn(async () => queuedJob(deck.projectId)),
    update: vi.fn(async () => queuedJob(deck.projectId)),
  };
  const enqueue = vi.fn(async () => undefined);
  const logger = { info: vi.fn(), error: vi.fn() };
  const service = new SlideRedesignJobService(
    messagesRepository as unknown as Repository<DesignAgentMessageEntity>,
    {
      getDeck: vi.fn(async () => ({
        projectId: deck.projectId,
        deck,
        updatedAt: "2026-07-22T00:00:00.000Z",
      })),
    } as unknown as DecksService,
    jobsService as unknown as JobsService,
    enqueue,
    logger as never,
  );

  return {
    service,
    messagesRepository,
    jobsService,
    enqueue,
    logger,
  };
}

function redesignRequest(
  deck: ReturnType<typeof createDemoDeck>,
  content = "Redesign this slide",
) {
  return {
    sessionId: "design-session-1",
    content,
    selectedPaletteOptionId: "calm-blue",
    context: {
      deckId: deck.deckId,
      baseVersion: deck.version,
      canvas: deck.canvas,
      slide: deck.slides[0]!,
      selectedElementIds: [],
      theme: deck.theme,
    },
  };
}

function paletteMessage(deck: ReturnType<typeof createDemoDeck>) {
  const timestamp = new Date("2026-07-22T00:00:00.000Z");
  return {
    messageId: "design-message-palette",
    sessionId: "design-session-1",
    projectId: deck.projectId,
    actorUserId: "user-1",
    deckId: deck.deckId,
    slideId: deck.slides[0]!.slideId,
    role: "assistant" as const,
    content: "Choose a palette",
    status: "succeeded" as const,
    contextJson: { paletteOptions: [...paletteOptions] },
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as DesignAgentMessageEntity;
}

function queuedJob(projectId: string) {
  return {
    jobId: "job-redesign-1",
    projectId,
    type: "slide-redesign" as const,
    status: "queued" as const,
    progress: 0,
    message: "Job queued",
    result: null,
    error: null,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
  };
}
