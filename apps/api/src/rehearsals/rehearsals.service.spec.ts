import type { Job } from "@orbit/shared";
import { BadRequestException } from "@nestjs/common";
import type { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecksService } from "../decks/decks.service";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import {
  RehearsalsService,
  type RehearsalSttEnqueueJob,
} from "./rehearsals.service";

const validEnv = {
  NODE_ENV: "test",
  APP_ENV: "local",
  WEB_PORT: "5173",
  API_PORT: "3000",
  WORKER_PORT: "3001",
  PYTHON_WORKER_PORT: "8000",
  WEB_ORIGIN: "http://localhost:5173",
  API_BASE_URL: "http://localhost:3000",
  PYTHON_WORKER_URL: "http://localhost:8000",
  DATABASE_URL: "postgres://orbit:orbit@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "local-session-secret-change-me",
  COOKIE_SECRET: "local-cookie-secret-change-me",
  STORAGE_DRIVER: "minio",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "orbit-local",
  S3_REGION: "ap-northeast-2",
  S3_ACCESS_KEY_ID: "orbit",
  S3_SECRET_ACCESS_KEY: "orbit-password",
  S3_FORCE_PATH_STYLE: "true",
  JOB_QUEUE_DRIVER: "bullmq",
  STT_PROVIDER: "sherpa",
  OCR_PROVIDER: "python",
  LLM_PROVIDER: "openai",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4.1-mini",
  OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  AWS_REGION: "ap-northeast-2",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
  TRANSCRIBE_LANGUAGE_CODE: "ko-KR",
  TEXTRACT_ENABLED: "false",
  LOG_LEVEL: "debug",
  LOG_PRETTY: "false",
  DEMO_USER_ID: "user_demo_1",
  DEMO_WORKSPACE_ID: "workspace_demo_1",
  DEMO_PROJECT_ID: "project_demo_1",
  DEMO_DECK_ID: "deck_demo_1",
  DEMO_SESSION_ID: "session_demo_1",
};

const job: Job = {
  jobId: "job-1",
  projectId: "project-a",
  type: "rehearsal-stt",
  status: "queued",
  progress: 0,
  message: "Job queued",
  result: null,
  error: null,
  createdAt: "2026-06-27T00:00:00.000Z",
  updatedAt: "2026-06-27T00:00:00.000Z",
};

describe("RehearsalsService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  it("creates a rehearsal STT job and enqueues BullMQ work", async () => {
    const enqueueJob = vi.fn(async () => undefined);
    const service = createService(enqueueJob);

    const result = await service.startStt("project-a", {
      audioFileId: "file-audio",
      deckId: "deck-a",
      runId: "run-a",
    });

    expect(result).toEqual({ job });
    expect(enqueueJob).toHaveBeenCalledWith({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project-a",
      runId: "run-a",
      deckId: "deck-a",
      audioFileId: "file-audio",
    });
    expect(service.testLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "job.enqueued",
        jobId: "job-1",
        jobType: "rehearsal-stt",
        projectId: "project-a",
        runId: "run-a",
        deckId: "deck-a",
        audioFileId: "file-audio",
      }),
      "Rehearsal STT job enqueued.",
    );
  });

  it("rejects requests when the deckId does not match the project deck", async () => {
    const service = createService(vi.fn(async () => undefined));

    await expect(
      service.startStt("project-a", {
        audioFileId: "file-audio",
        deckId: "deck-other",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("marks the job failed when enqueue fails", async () => {
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn(async () => ({ ...job, status: "failed" })),
    } as unknown as JobsService;
    const service = createService(
      vi.fn(async () => {
        throw new Error("redis down");
      }),
      jobsService,
    );

    await expect(
      service.startStt("project-a", {
        audioFileId: "file-audio",
        deckId: "deck-a",
      }),
    ).rejects.toThrow("redis down");
    expect(jobsService.update).toHaveBeenCalledWith("job-1", {
      status: "failed",
      progress: 0,
      message: "Rehearsal STT enqueue failed.",
      error: {
        code: "REHEARSAL_STT_ENQUEUE_FAILED",
        message: "redis down",
      },
    });
    expect(service.testLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "job.enqueue_failed",
        jobId: "job-1",
        jobType: "rehearsal-stt",
        projectId: "project-a",
        deckId: "deck-a",
      }),
      "Rehearsal STT enqueue failed.",
    );
  });
});

function createService(
  enqueueJob: RehearsalSttEnqueueJob,
  jobsService: JobsService = {
    create: vi.fn(async () => job),
    update: vi.fn(),
  } as unknown as JobsService,
) {
  const logger = createLogger();
  const service = new RehearsalsService(
    {
      getDeck: vi.fn(async () => ({
        projectId: "project-a",
        deck: { deckId: "deck-a" },
        updatedAt: "2026-06-27T00:00:00.000Z",
      })),
    } as unknown as DecksService,
    {
      getUploadedAsset: vi.fn(async () => ({
        fileId: "file-audio",
        purpose: "rehearsal-audio",
        status: "uploaded",
      })),
    } as unknown as FilesService,
    jobsService,
    enqueueJob,
    logger,
  );
  return Object.assign(service, { testLogger: logger });
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}
