import type { AssetUploadUrlResponse, Job } from "@orbit/shared";
import { BadRequestException } from "@nestjs/common";
import type { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";
import type { DecksService } from "../decks/decks.service";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import { RehearsalRunEntity } from "./rehearsal-run.entity";
import {
  RehearsalsService,
  type RehearsalSttEnqueueJob
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
  LIVE_STT_PROVIDER: "sherpa",
  REPORT_STT_PROVIDER: "openai",
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
  DEMO_SESSION_ID: "session_demo_1"
};

const createdAt = new Date("2026-06-27T00:00:00.000Z");

const job: Job = {
  jobId: "job-1",
  projectId: "project-a",
  type: "rehearsal-stt",
  status: "queued",
  progress: 0,
  message: "Job queued",
  result: null,
  error: null,
  createdAt: createdAt.toISOString(),
  updatedAt: createdAt.toISOString()
};

const upload: AssetUploadUrlResponse = {
  fileId: "file-audio",
  projectId: "project-a",
  uploadUrl: "http://localhost:5173/api/v1/projects/project-a/assets/file-audio/content",
  method: "PUT",
  headers: { "content-type": "audio/webm" },
  expiresAt: "2026-06-27T00:15:00.000Z",
  purpose: "rehearsal-audio"
};

describe("RehearsalsService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  it("creates a rehearsal run for the project deck", async () => {
    const service = createService();

    const result = await service.createRun("project-a", { deckId: "deck-a" });

    expect(result.run).toMatchObject({
      projectId: "project-a",
      deckId: "deck-a",
      audioFileId: null,
      jobId: null,
      status: "created"
    });
    expect(result.run.runId).toMatch(/^run_/);
  });

  it("rejects run creation when the deckId does not match the project deck", async () => {
    const service = createService();

    await expect(
      service.createRun("project-a", { deckId: "deck-other" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates an upload URL and pins the audio file to the run", async () => {
    const service = createService();
    const run = await createRun(service);

    const result = await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    expect(result.upload).toEqual(upload);
    expect(result.run).toMatchObject({
      runId: run.runId,
      audioFileId: "file-audio",
      status: "uploading"
    });
    expect(service.testFilesService.createUploadUrl).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        purpose: "rehearsal-audio"
      })
    );
  });

  it("completes upload, enqueues STT work, and marks the run processing", async () => {
    const enqueueJob = vi.fn(async () => undefined);
    const service = createService({ enqueueJob });
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    const result = await service.completeAudioUpload(run.runId, {
      fileId: "file-audio"
    });

    expect(result.run).toMatchObject({
      runId: run.runId,
      status: "processing",
      audioFileId: "file-audio",
      jobId: "job-1"
    });
    expect(result.job).toEqual(job);
    expect(enqueueJob).toHaveBeenCalledWith({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project-a",
      runId: run.runId,
      deckId: "deck-a",
      audioFileId: "file-audio"
    });
  });

  it("marks the run and job failed when enqueue fails", async () => {
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn(async () => ({ ...job, status: "failed" }))
    } as unknown as JobsService;
    const service = createService({
      enqueueJob: vi.fn(async () => {
        throw new Error("redis down");
      }),
      jobsService
    });
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    await expect(
      service.completeAudioUpload(run.runId, { fileId: "file-audio" })
    ).rejects.toThrow("redis down");

    expect(jobsService.update).toHaveBeenCalledWith("job-1", {
      status: "failed",
      progress: 0,
      message: "Rehearsal STT enqueue failed.",
      error: {
        code: "REHEARSAL_STT_ENQUEUE_FAILED",
        message: "redis down"
      }
    });
    expect((await service.getRun(run.runId)).run).toMatchObject({
      status: "failed",
      error: {
        code: "REHEARSAL_STT_ENQUEUE_FAILED",
        message: "redis down"
      }
    });
  });
});

async function createRun(service: ReturnType<typeof createService>) {
  return (await service.createRun("project-a", { deckId: "deck-a" })).run;
}

function createService(
  options: {
    enqueueJob?: RehearsalSttEnqueueJob;
    jobsService?: JobsService;
  } = {}
) {
  const logger = createLogger();
  const repository = createRunRepository();
  const filesService = {
    createUploadUrl: vi.fn(async () => upload),
    completeUpload: vi.fn(async () => ({
      fileId: "file-audio",
      projectId: "project-a",
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024,
      url: "http://localhost:9000/rehearsal.webm",
      purpose: "rehearsal-audio",
      createdAt: createdAt.toISOString()
    })),
    getUploadedAsset: vi.fn(async () => ({
      fileId: "file-audio",
      projectId: "project-a",
      purpose: "rehearsal-audio",
      status: "uploaded"
    }))
  } as unknown as FilesService;
  const service = new RehearsalsService(
    repository,
    {
      getDeck: vi.fn(async () => ({
        projectId: "project-a",
        deck: { deckId: "deck-a" },
        updatedAt: createdAt.toISOString()
      }))
    } as unknown as DecksService,
    filesService,
    options.jobsService ??
      ({
        create: vi.fn(async () => job),
        update: vi.fn()
      } as unknown as JobsService),
    options.enqueueJob ?? vi.fn(async () => undefined),
    logger
  );
  return Object.assign(service, {
    testFilesService: filesService as FilesService & {
      createUploadUrl: ReturnType<typeof vi.fn>;
    },
    testLogger: logger
  });
}

function createRunRepository() {
  const runs = new Map<string, RehearsalRunEntity>();

  return {
    create(input: Partial<RehearsalRunEntity>) {
      return input as RehearsalRunEntity;
    },
    async save(run: RehearsalRunEntity) {
      runs.set(run.runId, { ...run });
      return runs.get(run.runId) as RehearsalRunEntity;
    },
    async findOne(options: { where: { runId: string } }) {
      return runs.get(options.where.runId) ?? null;
    }
  } as unknown as Repository<RehearsalRunEntity>;
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn()
  } as unknown as PinoLogger;
}
