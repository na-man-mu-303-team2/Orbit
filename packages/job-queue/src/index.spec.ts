import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateDeckRequestSchema } from "@orbit/shared";
import {
  InMemoryJobQueue,
  aiDeckDesignLayoutQueueName,
  aiDeckGenerationStageJobId,
  aiDeckGenerationStageQueueName,
  aiDeckImageQueueName,
  aiDeckQaFinalizeQueueName,
  aiDeckResearchContentQueueName,
  enqueueAiDeckGenerationStageJob,
  enqueueGenerateDeckJob,
  retryAiDeckStagedCoordinatorJob,
  enqueueSemanticCueExtractionJob,
  enqueuePptxOoxmlGenerationJob,
  enqueueRehearsalSttJob,
  enqueueRehearsalSemanticEvaluationJob,
  enqueueWorkerHealthCheckJob,
  pptxOoxmlGenerationJobName,
  pptxOoxmlGenerationQueueName,
  referenceExtractQueueName,
  rehearsalSttJobName,
  rehearsalSttQueueName,
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
    const result = await enqueueAiDeckGenerationStageJob({
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
    expect(result).toEqual({
      jobId: "job-ai-deck-1:reference-extract-file:file-1",
      state: "waiting",
    });
  });

  it.each([
    ["reference-extract-file", referenceExtractQueueName],
    ["source-grounding", aiDeckResearchContentQueueName],
    ["content-planning", aiDeckResearchContentQueueName],
    ["design-planning", aiDeckDesignLayoutQueueName],
    ["layout-compile", aiDeckDesignLayoutQueueName],
    ["image-slide", aiDeckImageQueueName],
    ["semantic-quality", aiDeckQaFinalizeQueueName],
    ["rendered-visual-quality", aiDeckQaFinalizeQueueName],
    ["publication", aiDeckQaFinalizeQueueName],
  ] as const)("maps %s to %s", (stage, queueName) => {
    expect(aiDeckGenerationStageQueueName(stage)).toBe(queueName);
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
      request: generateDeckRequestSchema.parse({ topic: "분산 파이프라인" }),
    });

    expect(queueMock.add).toHaveBeenCalledWith(
      "generate-deck-staged-coordinator",
      { jobId: "job-ai-deck-1", projectId: "project-a" },
      expect.objectContaining({
        jobId: "job-ai-deck-1",
        attempts: 5,
        removeOnFail: false,
      }),
    );
    expect(JSON.stringify(queueMock.add.mock.calls)).not.toContain(
      "분산 파이프라인",
    );
  });

  it("removes a failed coordinator entry before explicit retry", async () => {
    const remove = vi.fn(async () => undefined);
    queueMock.getJob.mockResolvedValueOnce({
      getState: vi.fn(async () => "failed"),
      remove
    });

    await retryAiDeckStagedCoordinatorJob({
      redisUrl: "redis://localhost:6379",
      jobId: "job-ai-deck-1",
      projectId: "project-a"
    });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(queueMock.add).toHaveBeenCalledWith(
      "generate-deck-staged-coordinator",
      { jobId: "job-ai-deck-1", projectId: "project-a" },
      expect.objectContaining({ jobId: "job-ai-deck-1", removeOnFail: false })
    );
  });

  it("preserves the full monolith payload when executionMode is omitted", async () => {
    const request = generateDeckRequestSchema.parse({ topic: "monolith" });

    await enqueueGenerateDeckJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-monolith-1",
      projectId: "project-a",
      request,
    });

    expect(queueMock.add).toHaveBeenCalledWith(
      "generate-deck",
      { jobId: "job-monolith-1", projectId: "project-a", request },
      expect.objectContaining({ jobId: "job-monolith-1" }),
    );
  });

  it.each([
    { driver: "sqs" as const, executionMode: "monolith" as const },
    { driver: "bullmq" as const, executionMode: "sqs" as const },
  ])("fails fast for an unavailable SQS path: $driver/$executionMode", async (mode) => {
    await expect(
      enqueueGenerateDeckJob({
        ...mode,
        redisUrl: "redis://localhost:6379",
        jobId: "job-sqs-1",
        projectId: "project-a",
        request: generateDeckRequestSchema.parse({ topic: "SQS" }),
      }),
    ).rejects.toThrow(/not implemented yet/);
    expect(queueMock.Queue).not.toHaveBeenCalled();
  });
});

const queueMock = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  getJob: vi.fn(),
  getState: vi.fn(),
  Queue: vi.fn()
}));

vi.mock("bullmq", () => ({
  Queue: queueMock.Queue
}));

beforeEach(() => {
  queueMock.add.mockReset();
  queueMock.close.mockReset();
  queueMock.getJob.mockReset();
  queueMock.getState.mockReset();
  queueMock.Queue.mockReset();
  queueMock.getState.mockResolvedValue("waiting");
  queueMock.add.mockImplementation(async (_name, _payload, options) => ({
    id: options?.jobId,
    getState: queueMock.getState,
  }));
  queueMock.close.mockResolvedValue(undefined);
  queueMock.Queue.mockImplementation(() => ({
    add: queueMock.add,
    close: queueMock.close,
    getJob: queueMock.getJob
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
  it("adds an ID-only rehearsal STT job without private rehearsal content", async () => {
    await enqueueRehearsalSttJob({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-rehearsal-stt",
      projectId: "project-a",
      runId: "run-1",
      deckId: "deck-1",
      audioFileId: "file-1",
      storageUrl: "internal://private-audio",
      storageKey: "projects/project-a/private/rehearsal.webm",
      audioBytes: "private-audio-bytes",
      transcript: "private-transcript",
      script: "private-speaker-script",
    } as Parameters<typeof enqueueRehearsalSttJob>[0] &
      Record<string, unknown>);

    expect(queueMock.Queue).toHaveBeenCalledWith(rehearsalSttQueueName, {
      connection: expect.objectContaining({ host: "localhost", port: 6379 }),
    });
    expect(queueMock.add).toHaveBeenCalledWith(
      rehearsalSttJobName,
      {
        jobId: "job-rehearsal-stt",
        projectId: "project-a",
        runId: "run-1",
        deckId: "deck-1",
        audioFileId: "file-1",
      },
      expect.objectContaining({ jobId: "job-rehearsal-stt", attempts: 5 }),
    );
    expect(JSON.stringify(queueMock.add.mock.calls)).not.toMatch(
      /storageUrl|storageKey|audioBytes|transcript|script|private-audio|private-transcript|private-speaker-script/,
    );
    expect(queueMock.close).toHaveBeenCalled();
  });

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
