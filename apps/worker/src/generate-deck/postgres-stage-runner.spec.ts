import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { processAiDeckExecutionStage } from "./execution-stage.processor";
import { processAiDeckPlanningStage } from "./planning-stage.processor";
import {
  AiDeckPostgresStageRunner,
  type AiDeckPostgresStageRunnerOptions,
} from "./postgres-stage-runner";
import { processAiDeckReferenceExtractionStage } from "./reference-extract-stage";
import {
  AiDeckGenerationStageCheckpointRepository,
  type ClaimedAiDeckGenerationStage,
} from "./stage-checkpoint-repository";

vi.mock("./reference-extract-stage", () => ({
  processAiDeckReferenceExtractionStage: vi.fn(),
}));
vi.mock("./planning-stage.processor", () => ({
  processAiDeckPlanningStage: vi.fn(),
}));
vi.mock("./execution-stage.processor", () => ({
  processAiDeckExecutionStage: vi.fn(),
}));

const referenceProcessor = vi.mocked(processAiDeckReferenceExtractionStage);
const planningProcessor = vi.mocked(processAiDeckPlanningStage);
const executionProcessor = vi.mocked(processAiDeckExecutionStage);

beforeEach(() => {
  vi.restoreAllMocks();
  referenceProcessor.mockReset();
  planningProcessor.mockReset();
  executionProcessor.mockReset();
});

describe("AiDeckPostgresStageRunner", () => {
  it("uses one process-wide pool of five slots and leaves the sixth claim until a slot is free", async () => {
    const claims = Array.from({ length: 6 }, (_, index) =>
      claimed("image-slide", `slide-${index + 1}`),
    );
    const claimNext = vi
      .spyOn(AiDeckGenerationStageCheckpointRepository.prototype, "claimNext")
      .mockImplementation(async () => claims.shift() ?? null);
    const deferred = Array.from({ length: 6 }, () => promiseController<void>());
    let processIndex = 0;
    executionProcessor.mockImplementation(
      async () => deferred[processIndex++]!.promise,
    );
    const runner = new AiDeckPostgresStageRunner(options());

    await runner.runOnce();

    expect(runner.activeCount).toBe(5);
    expect(claimNext).toHaveBeenCalledTimes(5);
    expect(executionProcessor).toHaveBeenCalledTimes(5);

    deferred[0]!.resolve();
    await flushPromises();
    await runner.runOnce();

    expect(claimNext).toHaveBeenCalledTimes(6);
    expect(executionProcessor).toHaveBeenCalledTimes(6);
    for (const controller of deferred.slice(1)) controller.resolve();
    await flushPromises();
    await runner.stop();
  });

  it("routes preclaimed OCR, planning, and execution checkpoints without a second claim", async () => {
    const claims = [
      claimed("reference-extract-file", "file-a"),
      claimed("content-planning", ""),
      claimed("publication", ""),
    ];
    vi.spyOn(
      AiDeckGenerationStageCheckpointRepository.prototype,
      "claimNext",
    ).mockImplementation(async () => claims.shift() ?? null);
    referenceProcessor.mockResolvedValue(undefined);
    planningProcessor.mockResolvedValue(undefined);
    executionProcessor.mockResolvedValue(undefined);
    const runner = new AiDeckPostgresStageRunner(options());

    await runner.runOnce();
    await flushPromises();

    expect(referenceProcessor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "http://python.invalid",
      "worker-pg",
      expect.objectContaining({ stage: "reference-extract-file" }),
      expect.objectContaining({
        claimedCheckpoint: expect.objectContaining({ status: "running" }),
      }),
    );
    expect(planningProcessor).toHaveBeenCalledWith(
      expect.anything(),
      "http://python.invalid",
      "worker-pg",
      expect.objectContaining({ stage: "content-planning" }),
      expect.objectContaining({
        claimedCheckpoint: expect.objectContaining({ status: "running" }),
      }),
    );
    expect(executionProcessor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "http://python.invalid",
      "worker-pg",
      expect.objectContaining({ stage: "publication" }),
      undefined,
      expect.objectContaining({
        claimedCheckpoint: expect.objectContaining({ status: "running" }),
      }),
    );
    await runner.stop();
  });
});

function options(): AiDeckPostgresStageRunnerOptions {
  return {
    dataSource: {} as DataSource,
    storage: {} as Pick<StoragePort, "getSignedReadUrl" | "putObject">,
    pythonWorkerUrl: "http://python.invalid",
    workerId: "worker-pg",
    concurrency: 5,
    userConcurrency: 5,
    pollIntervalMs: 250,
  };
}

function claimed(
  stage: ClaimedAiDeckGenerationStage["message"]["stage"],
  shardKey: string,
): ClaimedAiDeckGenerationStage {
  return {
    requestedByUserId: "user-a",
    message: {
      pipelineJobId: "job-a",
      projectId: "project-a",
      stage,
      shardKey,
    },
    checkpoint: {
      pipelineJobId: "job-a",
      stage,
      shardKey,
      status: "running",
      attempt: 1,
      inputRef: {},
      resultRef: null,
      error: null,
      leaseOwner: "worker-pg:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
      leaseExpiresAt: "2026-07-16T00:10:00.000Z",
      dispatchedAt: null,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    },
  };
}

function promiseController<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
