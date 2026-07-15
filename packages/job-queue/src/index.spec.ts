import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryJobQueue,
  aiDeckGenerationStageJobId,
  aiDeckResearchContentQueueName,
  enqueueAiDeckGenerationStageJob,
  enqueueGenerateDeckJob,
  enqueueSemanticCueExtractionJob,
  enqueuePptxOoxmlGenerationJob,
  enqueueRehearsalSttJob,
  enqueueRehearsalSemanticEvaluationJob,
  enqueueWorkerHealthCheckJob,
  pptxOoxmlGenerationJobName,
  pptxOoxmlGenerationQueueName,
  referenceExtractQueueName,
  rehearsalSemanticEvaluationJobName,
  rehearsalSemanticEvaluationQueueName,
  semanticCueExtractionJobName,
  semanticCueExtractionQueueName,
  workerHealthCheckJobName,
  workerHealthCheckQueueName
} from "./index";

describe("aiDeckGenerationStageJobId", () => {
  it("builds a stable three-part BullMQ transport ID", () => {
    const singleton = {
      pipelineJobId: "job-ai-deck-1",
      projectId: "project-a",
      stage: "content-planning" as const,
      shardKey: "",
    };

    expect(aiDeckGenerationStageJobId(singleton)).toBe(
      "job-ai-deck-1:content-planning:",
    );
    expect(aiDeckGenerationStageJobId(singleton).split(":")).toHaveLength(3);
    expect(aiDeckGenerationStageJobId(singleton)).toBe(
      aiDeckGenerationStageJobId({ ...singleton }),
    );
    expect(
      aiDeckGenerationStageJobId({
        ...singleton,
        stage: "image-slide",
        shardKey: "slide-2",
      }),
    ).toBe("job-ai-deck-1:image-slide:slide-2");
  });

  it("rejects IDs that could add BullMQ transport segments", () => {
    expect(() =>
      aiDeckGenerationStageJobId({
        pipelineJobId: "job:ai-deck-1",
        projectId: "project-a",
        stage: "publication",
        shardKey: "",
      }),
    ).toThrow();
  });
});

describe("AI Deck staged BullMQ transport", () => {
  it("enqueues an exact four-field stage message without file bytes", async () => {
    await enqueueAiDeckGenerationStageJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      message: {
        pipelineJobId: "job-ai-deck-1",
        projectId: "project-a",
        stage: "reference-extract-file",
        shardKey: "file-1",
      },
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(referenceExtractQueueName, {
      connection: expect.objectContaining({ host: "localhost", port: 6379 }),
    });
    expect(queueMock.add).toHaveBeenCalledWith(
      "reference-extract-file",
      {
        pipelineJobId: "job-ai-deck-1",
        projectId: "project-a",
        stage: "reference-extract-file",
        shardKey: "file-1",
      },
      expect.objectContaining({
        jobId: "job-ai-deck-1:reference-extract-file:file-1",
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );
    expect(JSON.stringify(queueMock.add.mock.calls)).not.toMatch(
      /base64|content|storageKey|mimeType/i,
    );
  });

  it("maps source grounding to the research-content queue", async () => {
    await enqueueAiDeckGenerationStageJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      message: {
        pipelineJobId: "job-ai-deck-1",
        projectId: "project-a",
        stage: "source-grounding",
        shardKey: "",
      },
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(aiDeckResearchContentQueueName, {
      connection: expect.any(Object),
    });
  });

  it("uses an ID-only coordinator seed in BullMQ mode", async () => {
    await enqueueGenerateDeckJob({
      driver: "bullmq",
      executionMode: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-ai-deck-1",
      projectId: "project-a",
      request: { topic: "분산 파이프라인" },
    });

    expect(queueMock.add).toHaveBeenCalledWith(
      "generate-deck-staged-coordinator",
      { jobId: "job-ai-deck-1", projectId: "project-a" },
      expect.objectContaining({ jobId: "job-ai-deck-1", attempts: 5 }),
    );
    expect(JSON.stringify(queueMock.add.mock.calls)).not.toContain(
      "분산 파이프라인",
    );
  });
});

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

describe("enqueueRehearsalSemanticEvaluationJob", () => {
  it("adds an ID-only semantic evaluation retry job to BullMQ", async () => {
    await enqueueRehearsalSemanticEvaluationJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-semantic-retry",
      projectId: "project-a",
      runId: "run-1"
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(
      rehearsalSemanticEvaluationQueueName,
      { connection: expect.objectContaining({ host: "localhost", port: 6379 }) }
    );
    expect(queueMock.add).toHaveBeenCalledWith(
      rehearsalSemanticEvaluationJobName,
      { jobId: "job-semantic-retry", projectId: "project-a", runId: "run-1" },
      expect.objectContaining({ jobId: "job-semantic-retry", attempts: 5 })
    );
    expect(JSON.stringify(queueMock.add.mock.calls)).not.toContain("transcript");
  });
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
    expect(queueMock.add).toHaveBeenCalledWith(
      workerHealthCheckJobName,
      { jobId: "job-1", projectId: "project-a" },
      expect.objectContaining({ jobId: "job-1", attempts: 5 })
    );
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
      request: { fileId: "file_1" }
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(pptxOoxmlGenerationQueueName, {
      connection: expect.objectContaining({
        host: "localhost",
        port: 6379
      })
    });
    expect(queueMock.add).toHaveBeenCalledWith(
      pptxOoxmlGenerationJobName,
      { jobId: "job-1", projectId: "project-a", request: { fileId: "file_1" } },
      expect.objectContaining({ jobId: "job-1", attempts: 5 })
    );
    expect(queueMock.close).toHaveBeenCalled();
  });
});

describe("legacy queue contracts", () => {
  it("does not expose legacy queue constants or enqueue helpers", async () => {
    const queueModule = await import("./index");
    expect(queueModule).not.toHaveProperty("aiTemplateDeckGenerationQueueName");
    expect(queueModule).not.toHaveProperty("aiTemplateDeckGenerationJobName");
    expect(queueModule).not.toHaveProperty("enqueueAiTemplateDeckGenerationJob");
    expect(queueModule).not.toHaveProperty("pptxImportQueueName");
    expect(queueModule).not.toHaveProperty("pptxImportJobName");
    expect(queueModule).not.toHaveProperty("enqueuePptxImportJob");
  });
});

describe("enqueueSemanticCueExtractionJob", () => {
  it("adds a semantic cue extraction job to BullMQ", async () => {
    await enqueueSemanticCueExtractionJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-semantic-cues",
      projectId: "project-a",
      request: {
        deckId: "deck_demo_1",
        force: false,
        baseVersion: 3
      }
    });

    expect(queueMock.Queue).toHaveBeenCalledWith(
      semanticCueExtractionQueueName,
      {
        connection: expect.objectContaining({
          host: "localhost",
          port: 6379
        })
      }
    );
    expect(queueMock.add).toHaveBeenCalledWith(
      semanticCueExtractionJobName,
      {
        jobId: "job-semantic-cues",
        projectId: "project-a",
        request: { deckId: "deck_demo_1", force: false, baseVersion: 3 }
      },
      expect.objectContaining({ jobId: "job-semantic-cues", attempts: 5 })
    );
    expect(queueMock.close).toHaveBeenCalled();
  });
});
