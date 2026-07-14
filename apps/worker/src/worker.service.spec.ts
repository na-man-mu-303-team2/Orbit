import type { PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateDeckQueueName,
  pptxOoxmlGenerationQueueName,
} from "@orbit/job-queue";
import { WorkerService } from "./worker.service";

const bullMq = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  queues: [] as string[],
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(queueName: string) {
      bullMq.queues.push(queueName);
    }

    close = bullMq.close;
    on = vi.fn();
  },
}));

vi.mock("@orbit/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@orbit/config")>();

  return {
    ...actual,
    loadOrbitConfig: vi.fn(() => ({
      JOB_QUEUE_DRIVER: "bullmq",
      PRIVATE_EVIDENCE_REDIS_URL: "redis://localhost:6380",
      PYTHON_WORKER_URL: "http://localhost:8000",
      REDIS_URL: "redis://localhost:6379",
    })),
  };
});

vi.mock("./storage", () => ({ workerStorage: vi.fn(() => ({})) }));
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

afterEach(() => {
  bullMq.close.mockClear();
  bullMq.queues.length = 0;
  vi.restoreAllMocks();
});

describe("WorkerService queue subscriptions", () => {
  it("registers active queues without legacy consumers", async () => {
    vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as never);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLogger;
    const service = new WorkerService({} as DataSource, logger);

    service.onModuleInit();

    expect(bullMq.queues).toContain(generateDeckQueueName);
    expect(bullMq.queues).toContain(pptxOoxmlGenerationQueueName);
    expect(bullMq.queues).not.toContain("pptx-import");
    expect(bullMq.queues).not.toContain("ai-template-deck-generation");

    await service.onModuleDestroy();
  });
});
