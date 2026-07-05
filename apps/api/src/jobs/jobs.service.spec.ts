import type { Job } from "@orbit/shared";
import type { PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobsService } from "./jobs.service";

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
  LIVE_STT_PROVIDER: "web-speech",
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

const queuedRow = {
  job_id: "job-1",
  project_id: "project-a",
  type: "worker-health-check",
  status: "queued",
  progress: 0,
  message: "Job queued",
  payload: null,
  result: null,
  error: null,
  created_at: "2026-06-27T00:00:00.000Z",
  updated_at: "2026-06-27T00:00:00.000Z"
};

describe("JobsService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  it("enqueues ORBIT-94 worker health check jobs after DB creation", async () => {
    const query = vi.fn().mockResolvedValueOnce([queuedRow]);
    const enqueue = vi.fn(async () => undefined);
    const service = new JobsService(
      { query } as unknown as DataSource,
      enqueue,
      createLogger()
    );

    const job = await service.create({
      projectId: "project-a",
      type: "worker-health-check"
    });

    expect(job).toEqual(jobFromRow(queuedRow));
    expect(enqueue).toHaveBeenCalledWith({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project-a"
    });
  });

  it("marks worker health check jobs failed when enqueue fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([queuedRow])
      .mockResolvedValueOnce([
        {
          ...queuedRow,
          status: "failed",
          message: "Worker health check enqueue failed.",
          error: {
            code: "WORKER_HEALTH_CHECK_ENQUEUE_FAILED",
            message: "redis down"
          }
        }
      ]);
    const enqueue = vi.fn(async () => {
      throw new Error("redis down");
    });
    const service = new JobsService(
      { query } as unknown as DataSource,
      enqueue,
      createLogger()
    );

    await expect(
      service.create({
        projectId: "project-a",
        type: "worker-health-check"
      })
    ).rejects.toThrow("redis down");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(
      expect.arrayContaining([
        "job-1",
        "failed",
        0,
        "Worker health check enqueue failed.",
        {
          code: "WORKER_HEALTH_CHECK_ENQUEUE_FAILED",
          message: "redis down"
        }
      ])
    );
  });
});

function jobFromRow(row: typeof queuedRow): Job {
  return {
    jobId: row.job_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } as Job;
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn()
  } as unknown as PinoLogger;
}
