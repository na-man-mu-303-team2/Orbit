import {
  generateDeckJobName,
  generateDeckQueueName,
  generateDeckStagedCoordinatorJobName,
  pptxOoxmlGenerationQueueName,
  referenceExtractJobName,
  referenceExtractQueueName,
} from "@orbit/job-queue";
import type { Job } from "@orbit/shared";
import type { PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkerService } from "./worker.service";

const bullMq = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  queues: [] as string[],
  handlers: new Map<string, (job: FakeBullJob) => Promise<unknown>>(),
}));

const configState = vi.hoisted(() => ({
  JOB_QUEUE_DRIVER: "bullmq" as "bullmq" | "sqs",
  AI_DECK_EXECUTION_MODE: "monolith" as "monolith" | "bullmq" | "sqs",
  AI_DECK_WORKER_QUEUE: "all" as
    | "all"
    | "reference-extract"
    | "research-content"
    | "design-layout"
    | "image"
    | "qa-finalize",
  PRIVATE_EVIDENCE_REDIS_URL: "redis://localhost:6380",
  PYTHON_WORKER_URL: "http://localhost:8000",
  REDIS_URL: "redis://localhost:6379",
}));

const processors = vi.hoisted(() => ({
  generateDeck: vi.fn(async () => orbitJob("succeeded")),
  stagedCoordinator: vi.fn(async () => orbitJob("running")),
  referenceExtract: vi.fn(async () => orbitJob("succeeded", "reference-extract")),
  referenceExtractStage: vi.fn<() => Promise<Job | void>>(async () => undefined),
}));

const maintenance = vi.hoisted(() => ({
  coordinator: vi.fn(async () => ({
    scanned: 0,
    recovered: 0,
    removed: 0,
    nextStart: 0,
  })),
  dispatch: vi.fn(async () => ({ scanned: 0, dispatched: 0 })),
  reconcile: vi.fn(async () => ({ scanned: 0, requeued: 0, failed: 0 })),
}));

const transportRecovery = vi.hoisted(() => ({
  recover: vi.fn(async () => "ignored" as const),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      queueName: string,
      handler: (job: FakeBullJob) => Promise<unknown>,
    ) {
      bullMq.queues.push(queueName);
      bullMq.handlers.set(queueName, handler);
    }

    close = bullMq.close;
    on = vi.fn();
  },
}));

vi.mock("@orbit/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@orbit/config")>();
  return {
    ...actual,
    loadOrbitConfig: vi.fn(() => ({ ...configState })),
  };
});

vi.mock("./generate-deck.processor", () => ({
  processGenerateDeckJob: processors.generateDeck,
}));
vi.mock("./generate-deck/staged-coordinator", () => ({
  processAiDeckStagedCoordinatorJob: processors.stagedCoordinator,
}));
vi.mock("./reference-extract.processor", () => ({
  processReferenceExtractJob: processors.referenceExtract,
}));
vi.mock("./generate-deck/reference-extract-stage", () => ({
  processAiDeckReferenceExtractionStage: processors.referenceExtractStage,
}));
vi.mock("./generate-deck/stage-dispatcher", () => ({
  dispatchAiDeckGenerationStages: maintenance.dispatch,
}));
vi.mock("./generate-deck/coordinator-failure-reconciler", () => ({
  reconcileFailedAiDeckCoordinatorJobs: maintenance.coordinator,
}));
vi.mock("./generate-deck/stage-reconciler", () => ({
  reconcileExpiredAiDeckStageLeases: maintenance.reconcile,
}));
vi.mock("./generate-deck/transport-failure-recovery", () => ({
  recoverAiDeckBullMqFinalFailure: transportRecovery.recover,
}));
vi.mock("./image-providers", () => ({
  createImageAssetRuntime: vi.fn(() => undefined),
}));
vi.mock("./storage", () => ({
  workerStorage: vi.fn(() => ({ getSignedReadUrl: vi.fn() })),
}));
vi.mock("./storage-deletion-reconciler", () => ({
  reconcileStorageDeletionOutbox: vi.fn(async () => undefined),
}));
vi.mock("./rehearsal-transcript-cache", () => ({
  RedisRehearsalTranscriptCache: class {
    close = vi.fn(async () => undefined);
  },
}));
vi.mock("./challenge-qna-evidence-cache", () => ({
  ChallengeQnaEvidenceCache: class {
    close = vi.fn(async () => undefined);
  },
}));

beforeEach(() => {
  configState.JOB_QUEUE_DRIVER = "bullmq";
  configState.AI_DECK_EXECUTION_MODE = "monolith";
  configState.AI_DECK_WORKER_QUEUE = "all";
  bullMq.queues.length = 0;
  bullMq.handlers.clear();
  vi.clearAllMocks();
  vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as never);
  vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkerService queue subscriptions", () => {
  it("registers every active queue in the default all role", async () => {
    const { service } = createService();

    service.onModuleInit();

    expect(bullMq.queues).toContain(generateDeckQueueName);
    expect(bullMq.queues).toContain(referenceExtractQueueName);
    expect(bullMq.queues).toContain(pptxOoxmlGenerationQueueName);
    expect(bullMq.queues).not.toContain("pptx-import");
    expect(bullMq.queues).not.toContain("ai-template-deck-generation");

    await service.onModuleDestroy();
  });

  it("routes shared queues by job.name and logs staged work as progress", async () => {
    configState.AI_DECK_EXECUTION_MODE = "bullmq";
    const { service, logger } = createService();
    processors.referenceExtractStage.mockResolvedValueOnce({
      ...orbitJob("failed"),
      error: {
        code: "SOURCE_GROUNDING_REQUIRED",
        message: "The selected reference policy requires usable grounding.",
        failedStage: "reference-extract-file",
        retryable: false,
      },
    });
    service.onModuleInit();

    const generateHandler = requiredHandler(generateDeckQueueName);
    const referenceHandler = requiredHandler(referenceExtractQueueName);
    await generateHandler(
      bullJob(generateDeckStagedCoordinatorJobName, {
        jobId: "job-ai-deck-1",
        projectId: "project-a",
      }),
    );
    await referenceHandler(
      bullJob("reference-extract-file", {
        pipelineJobId: "job-ai-deck-1",
        projectId: "project-a",
        stage: "reference-extract-file",
        shardKey: "file-a",
      }),
    );
    await generateHandler(bullJob(generateDeckJobName, { jobId: "legacy" }));
    await referenceHandler(bullJob(referenceExtractJobName, { jobId: "legacy-ref" }));

    expect(processors.stagedCoordinator).toHaveBeenCalledTimes(1);
    expect(processors.referenceExtractStage).toHaveBeenCalledTimes(1);
    expect(processors.generateDeck).toHaveBeenCalledTimes(1);
    expect(processors.referenceExtract).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "job.progressed" }),
      "Job progressed.",
    );
    expect(
      logger.info.mock.calls.filter(
        ([fields]) =>
          typeof fields === "object" &&
          fields !== null &&
          "event" in fields &&
          fields.event === "job.progressed",
      ),
    ).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "job.failed",
        error: expect.objectContaining({ code: "SOURCE_GROUNDING_REQUIRED" }),
      }),
      "Job finished.",
    );
    expect(maintenance.dispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        driver: "bullmq",
        redisUrl: configState.REDIS_URL,
      }),
    );
    expect(maintenance.coordinator).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redisUrl: configState.REDIS_URL,
        start: 0,
      }),
    );
    expect(maintenance.reconcile).toHaveBeenCalled();

    await expect(
      generateHandler(bullJob("unknown-generate-deck-job", {})),
    ).rejects.toThrow("Unsupported BullMQ job name");
    await expect(
      referenceHandler(bullJob("unknown-reference-job", {})),
    ).rejects.toThrow("Unsupported BullMQ job name");
    await service.onModuleDestroy();
  });

  it("limits a dedicated reference worker to coordinator and OCR queues", async () => {
    configState.AI_DECK_EXECUTION_MODE = "bullmq";
    configState.AI_DECK_WORKER_QUEUE = "reference-extract";
    const { service } = createService();

    service.onModuleInit();

    expect([...bullMq.queues].sort()).toEqual(
      [generateDeckQueueName, referenceExtractQueueName].sort(),
    );
    await service.onModuleDestroy();
  });

  it("awaits DB recovery for final coordinator and OCR transport attempts", async () => {
    configState.AI_DECK_EXECUTION_MODE = "bullmq";
    const { service } = createService();
    service.onModuleInit();
    const generateHandler = requiredHandler(generateDeckQueueName);
    const referenceHandler = requiredHandler(referenceExtractQueueName);
    processors.stagedCoordinator.mockRejectedValueOnce(
      new Error("coordinator transport failure"),
    );
    processors.referenceExtractStage.mockRejectedValueOnce(
      new Error("stage transport failure"),
    );

    await expect(
      generateHandler(
        bullJob(
          generateDeckStagedCoordinatorJobName,
          { jobId: "job-ai-deck-1", projectId: "project-a" },
          4,
        ),
      ),
    ).rejects.toThrow("coordinator transport failure");
    await expect(
      referenceHandler(
        bullJob(
          "reference-extract-file",
          {
            pipelineJobId: "job-ai-deck-1",
            projectId: "project-a",
            stage: "reference-extract-file",
            shardKey: "file-a",
          },
          4,
        ),
      ),
    ).rejects.toThrow("stage transport failure");

    expect(transportRecovery.recover).toHaveBeenNthCalledWith(1, expect.anything(), {
      queueName: generateDeckQueueName,
      jobName: generateDeckStagedCoordinatorJobName,
      data: { jobId: "job-ai-deck-1", projectId: "project-a" },
    });
    expect(transportRecovery.recover).toHaveBeenNthCalledWith(2, expect.anything(), {
      queueName: referenceExtractQueueName,
      jobName: "reference-extract-file",
      data: {
        pipelineJobId: "job-ai-deck-1",
        projectId: "project-a",
        stage: "reference-extract-file",
        shardKey: "file-a",
      },
    });
    await service.onModuleDestroy();
  });

  it("does not recover an intermediate BullMQ attempt", async () => {
    configState.AI_DECK_EXECUTION_MODE = "bullmq";
    const { service } = createService();
    service.onModuleInit();
    processors.stagedCoordinator.mockRejectedValueOnce(
      new Error("retryable coordinator failure"),
    );

    await expect(
      requiredHandler(generateDeckQueueName)(
        bullJob(
          generateDeckStagedCoordinatorJobName,
          { jobId: "job-ai-deck-1", projectId: "project-a" },
          3,
        ),
      ),
    ).rejects.toThrow("retryable coordinator failure");

    expect(transportRecovery.recover).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it("preserves the original failure when final DB recovery also fails", async () => {
    configState.AI_DECK_EXECUTION_MODE = "bullmq";
    const { service, logger } = createService();
    service.onModuleInit();
    const originalError = new Error("original stage failure");
    processors.referenceExtractStage.mockRejectedValueOnce(originalError);
    transportRecovery.recover.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      requiredHandler(referenceExtractQueueName)(
        bullJob(
          "reference-extract-file",
          {
            pipelineJobId: "job-ai-deck-1",
            projectId: "project-a",
            stage: "reference-extract-file",
            shardKey: "file-a",
          },
          4,
        ),
      ),
    ).rejects.toBe(originalError);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ai_deck.transport_failure.recovery_failed",
      }),
      "AI deck transport failure recovery failed.",
    );
    await service.onModuleDestroy();
  });

  it.each([
    ["sqs", "all"],
    ["bullmq", "research-content"],
    ["monolith", "reference-extract"],
  ] as const)(
    "fails startup for an unavailable 338-1 mode %s/%s",
    (executionMode, workerQueue) => {
      configState.AI_DECK_EXECUTION_MODE = executionMode;
      configState.AI_DECK_WORKER_QUEUE = workerQueue;
      const { service, logger } = createService();

      expect(() => service.onModuleInit()).toThrow(/not implemented/i);
      expect(bullMq.queues).toEqual([]);
      expect(maintenance.dispatch).not.toHaveBeenCalled();
      expect(maintenance.coordinator).not.toHaveBeenCalled();
      expect(maintenance.reconcile).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: "worker.ready" }),
        "Worker ready.",
      );
    },
  );
});

interface FakeBullJob {
  id: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  opts: { attempts: number };
}

function bullJob(
  name: string,
  data: unknown,
  attemptsMade = 0,
  attempts = 5,
): FakeBullJob {
  return { id: `bull-${name}`, name, data, attemptsMade, opts: { attempts } };
}

function requiredHandler(queueName: string) {
  const handler = bullMq.handlers.get(queueName);
  if (!handler) throw new Error(`Missing handler for ${queueName}`);
  return handler;
}

function createService() {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLogger;
  return {
    service: new WorkerService({} as DataSource, logger),
    logger: logger as unknown as {
      error: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
    },
  };
}

function orbitJob(
  status: Job["status"],
  type: Job["type"] = "ai-deck-generation",
): Job {
  return {
    jobId: "job-ai-deck-1",
    projectId: "project-a",
    type,
    status,
    progress: status === "succeeded" ? 100 : 10,
    message: status,
    result: null,
    error: null,
    createdAt: "2026-07-15T01:00:00.000Z",
    updatedAt: "2026-07-15T01:00:00.000Z",
  };
}
