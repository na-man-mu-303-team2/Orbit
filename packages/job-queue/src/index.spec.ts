import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryJobQueue,
  aiTemplateDeckGenerationJobName,
  aiTemplateDeckGenerationQueueName,
  enqueueAiTemplateDeckGenerationJob,
  enqueuePptxOoxmlGenerationJob,
  enqueueRehearsalSttJob,
  enqueueWorkerHealthCheckJob,
  pptxOoxmlGenerationJobName,
  pptxOoxmlGenerationQueueName,
  workerHealthCheckJobName,
  workerHealthCheckQueueName
} from "./index";

const queueMock = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  Queue: vi.fn()
}));

vi.mock("bullmq", () => ({
  Queue: queueMock.Queue
}));

beforeEach(() => {
  queueMock.add.mockReset();
  queueMock.close.mockReset();
  queueMock.Queue.mockReset();
  queueMock.add.mockResolvedValue(undefined);
  queueMock.close.mockResolvedValue(undefined);
  queueMock.Queue.mockImplementation(() => ({
    add: queueMock.add,
    close: queueMock.close
  }));
});

describe("InMemoryJobQueue", () => {
  it("updates queued jobs with shared job status values", async () => {
    const queue = new InMemoryJobQueue();
    const job = await queue.enqueue({
      projectId: "project-a",
      type: "reference-extract"
    });

    const updated = await queue.update(job.jobId, {
      status: "succeeded",
      progress: 100,
      message: "done",
      result: { fileCount: 1 }
    });

    expect(updated?.status).toBe("succeeded");
    expect(updated?.progress).toBe(100);
    expect(await queue.get(job.jobId)).toEqual(updated);
  });
});

describe("enqueueRehearsalSttJob", () => {
  it("keeps the SQS rehearsal STT adapter explicitly unsupported", async () => {
    await expect(
      enqueueRehearsalSttJob({
        driver: "sqs",
        redisUrl: "redis://localhost:6379",
        jobId: "job-1",
        projectId: "project-a",
        runId: "run-1",
        deckId: "deck-1",
        audioFileId: "file-1"
      })
    ).rejects.toThrow("SqsJobQueue adapter is not implemented yet.");
  });
});

describe("enqueueWorkerHealthCheckJob", () => {
  it("adds a worker health check job to BullMQ", async () => {
    await enqueueWorkerHealthCheckJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project-a"
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(workerHealthCheckQueueName, {
      connection: expect.objectContaining({
        host: "localhost",
        port: 6379
      })
    });
    expect(queueMock.add).toHaveBeenCalledWith(workerHealthCheckJobName, {
      jobId: "job-1",
      projectId: "project-a"
    });
    expect(queueMock.close).toHaveBeenCalled();
  });
});

describe("enqueuePptxOoxmlGenerationJob", () => {
  it("adds a PPTX OOXML generation job to BullMQ", async () => {
    await enqueuePptxOoxmlGenerationJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project-a",
      request: { fileId: "file_1", topic: "Topic" }
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(pptxOoxmlGenerationQueueName, {
      connection: expect.objectContaining({
        host: "localhost",
        port: 6379
      })
    });
    expect(queueMock.add).toHaveBeenCalledWith(pptxOoxmlGenerationJobName, {
      jobId: "job-1",
      projectId: "project-a",
      request: { fileId: "file_1", topic: "Topic" }
    });
    expect(queueMock.close).toHaveBeenCalled();
  });
});

describe("enqueueAiTemplateDeckGenerationJob", () => {
  it("adds an AI template deck generation job to BullMQ", async () => {
    await enqueueAiTemplateDeckGenerationJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-template",
      projectId: "project-a",
      request: {
        topic: "ORBIT",
        targetDurationMinutes: 10,
        slideCountRange: { min: 5, max: 8 },
        template: "default",
        metadata: {
          audience: "general",
          purpose: "inform",
          tone: "professional"
        },
        design: {
          visualRhythm: "auto",
          densityTarget: "medium",
          mediaPolicy: "balanced",
          layoutDiversity: "stable"
        },
        assets: [{ fileId: "file_design", role: "design" }]
      }
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(
      aiTemplateDeckGenerationQueueName,
      {
        connection: expect.objectContaining({
          host: "localhost",
          port: 6379
        })
      }
    );
    expect(queueMock.add).toHaveBeenCalledWith(aiTemplateDeckGenerationJobName, {
      jobId: "job-template",
      projectId: "project-a",
      request: expect.objectContaining({
        topic: "ORBIT",
        assets: [{ fileId: "file_design", role: "design" }]
      })
    });
    expect(queueMock.close).toHaveBeenCalled();
  });
});
