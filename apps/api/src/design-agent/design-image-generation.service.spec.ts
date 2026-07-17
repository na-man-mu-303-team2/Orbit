import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it, vi } from "vitest";
import type { DecksService } from "../decks/decks.service";
import type { JobsService } from "../jobs/jobs.service";
import { DesignImageGenerationService } from "./design-image-generation.service";

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({ JOB_QUEUE_DRIVER: "bullmq", REDIS_URL: "redis://test" }),
}));

describe("DesignImageGenerationService", () => {
  it("queues a sanitized slide context without speaker notes", async () => {
    const deck = createDemoDeck();
    deck.slides[0]!.speakerNotes = "외부 provider에 보내면 안 되는 발표자 스크립트";
    const job = {
      jobId: "job_image_1",
      projectId: deck.projectId,
      type: "design-image-generation" as const,
      status: "queued" as const,
      progress: 0,
      message: "queued",
      result: null,
      error: null,
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const enqueue = vi.fn(async () => undefined);
    const service = new DesignImageGenerationService(
      { getDeck: vi.fn(async () => ({ projectId: deck.projectId, deck, updatedAt: job.updatedAt })) } as unknown as DecksService,
      { create: vi.fn(async () => job), update: vi.fn() } as unknown as JobsService,
      enqueue,
      { info: vi.fn(), error: vi.fn() } as never,
    );

    const response = await service.create(deck.projectId, "user_1", {
      prompt: "미래 도시의 친환경 교통",
      deckId: deck.deckId,
      slideId: deck.slides[0]!.slideId,
      baseVersion: deck.version,
    });

    expect(response.job.type).toBe("design-image-generation");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "미래 도시의 친환경 교통",
        aspectRatio: "landscape",
        driver: "bullmq",
      }),
    );
    expect(JSON.stringify(enqueue.mock.calls[0])).not.toContain("발표자 스크립트");
  });

  it("rejects a stale baseVersion before creating a job", async () => {
    const deck = createDemoDeck();
    const jobs = { create: vi.fn() };
    const service = new DesignImageGenerationService(
      { getDeck: vi.fn(async () => ({ projectId: deck.projectId, deck, updatedAt: "2026-07-18T00:00:00.000Z" })) } as unknown as DecksService,
      jobs as unknown as JobsService,
      vi.fn(),
      { info: vi.fn(), error: vi.fn() } as never,
    );

    await expect(
      service.create(deck.projectId, "user_1", {
        prompt: "image",
        deckId: deck.deckId,
        slideId: deck.slides[0]!.slideId,
        baseVersion: deck.version + 1,
      }),
    ).rejects.toThrow("baseVersion is stale");
    expect(jobs.create).not.toHaveBeenCalled();
  });
});
