import type { UploadedFile, Job } from "@orbit/shared";
import type { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import { ImportPptxService } from "./import-pptx.service";

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
  DEMO_USER_ID: "user_demo_1",
  DEMO_WORKSPACE_ID: "workspace_demo_1",
  DEMO_PROJECT_ID: "project_demo_1",
  DEMO_DECK_ID: "deck_demo_1",
  DEMO_SESSION_ID: "session_demo_1"
};

describe("ImportPptxService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  it("creates a PPTX import job and enqueues the worker payload", async () => {
    const asset: UploadedFile = {
      fileId: "file_pptx_1",
      projectId: "project_demo_1",
      originalName: "team-update.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 1024,
      url: "http://localhost:9000/orbit-local/team-update.pptx",
      purpose: "pptx-import",
      createdAt: "2026-06-29T00:00:00.000Z"
    };
    const job: Job = {
      jobId: "job-1",
      projectId: "project_demo_1",
      type: "pptx-import",
      status: "queued",
      progress: 0,
      message: "Job queued",
      result: null,
      error: null,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z"
    };
    const filesService = {
      getUploadedAsset: vi.fn(async () => asset)
    } as unknown as FilesService;
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn()
    } as unknown as JobsService;
    const enqueueJob = vi.fn(async () => undefined);
    const logger = {
      info: vi.fn(),
      error: vi.fn()
    } as unknown as PinoLogger;

    const result = await new ImportPptxService(
      filesService,
      jobsService,
      enqueueJob,
      logger
    ).createJob("project_demo_1", {
      fileId: "file_pptx_1"
    });

    expect(result).toEqual({ job });
    expect(filesService.getUploadedAsset).toHaveBeenCalledWith(
      "project_demo_1",
      "file_pptx_1",
      "pptx-import"
    );
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: "project_demo_1",
      type: "pptx-import",
      payload: {
        fileId: "file_pptx_1"
      }
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project_demo_1",
      fileId: "file_pptx_1"
    });
  });
});
