import type { AiDeckGenerationStageMessage } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";

import { dispatchAiDeckGenerationStages } from "./stage-dispatcher";

const referenceMessage: AiDeckGenerationStageMessage = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "reference-extract-file",
  shardKey: "file-a",
};

describe("dispatchAiDeckGenerationStages", () => {
  it.each(["waiting", "delayed", "prioritized"] as const)(
    "marks the observed checkpoint generation after a %s disposition",
    async (state) => {
      const repository = {
        listUndispatched: vi.fn(async () => [
          { message: referenceMessage, attempt: 2 },
        ]),
        markDispatched: vi.fn(async () => ({})),
      };
      const enqueue = vi.fn(async () => ({
        jobId: "job-ai-deck-1:reference-extract-file:file-a",
        state,
      }));

      await expect(
        dispatchAiDeckGenerationStages(repository, {
          driver: "bullmq",
          redisUrl: "redis://localhost:6379",
          enqueue,
        }),
      ).resolves.toEqual({ scanned: 1, dispatched: 1 });
      expect(repository.markDispatched).toHaveBeenCalledWith(referenceMessage, 2);
    },
  );

  it.each(["active", "completed", "failed", "unknown"] as const)(
    "does not mark a %s duplicate as durably dispatched",
    async (state) => {
      const repository = {
        listUndispatched: vi.fn(async () => [
          { message: referenceMessage, attempt: 1 },
        ]),
        markDispatched: vi.fn(),
      };

      await expect(
        dispatchAiDeckGenerationStages(repository, {
          driver: "bullmq",
          redisUrl: "redis://localhost:6379",
          enqueue: vi.fn(async () => ({
            jobId: "job-ai-deck-1:reference-extract-file:file-a",
            state,
          })),
        }),
      ).resolves.toEqual({ scanned: 1, dispatched: 0 });
      expect(repository.markDispatched).not.toHaveBeenCalled();
    },
  );

  it("keeps the 338-2 source-grounding checkpoint undispatched", async () => {
    const sourceMessage: AiDeckGenerationStageMessage = {
      pipelineJobId: "job-ai-deck-1",
      projectId: "project-a",
      stage: "source-grounding",
      shardKey: "",
    };
    const repository = {
      listUndispatched: vi.fn(async () => [
        { message: sourceMessage, attempt: 0 },
      ]),
      markDispatched: vi.fn(),
    };
    const enqueue = vi.fn();

    await expect(
      dispatchAiDeckGenerationStages(repository, {
        driver: "bullmq",
        redisUrl: "redis://localhost:6379",
        enqueue,
      }),
    ).resolves.toEqual({ scanned: 1, dispatched: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(repository.markDispatched).not.toHaveBeenCalled();
  });

  it("leaves a failed send undispatched and continues with the next row", async () => {
    const secondMessage = { ...referenceMessage, shardKey: "file-b" };
    const repository = {
      listUndispatched: vi.fn(async () => [
        { message: referenceMessage, attempt: 0 },
        { message: secondMessage, attempt: 1 },
      ]),
      markDispatched: vi.fn(async () => ({})),
    };
    const enqueue = vi
      .fn()
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce({
        jobId: "job-ai-deck-1:reference-extract-file:file-b",
        state: "waiting",
      });

    await expect(
      dispatchAiDeckGenerationStages(repository, {
        driver: "bullmq",
        redisUrl: "redis://localhost:6379",
        enqueue,
      }),
    ).resolves.toEqual({ scanned: 2, dispatched: 1 });
    expect(repository.markDispatched).toHaveBeenCalledTimes(1);
    expect(repository.markDispatched).toHaveBeenCalledWith(secondMessage, 1);
  });
});
