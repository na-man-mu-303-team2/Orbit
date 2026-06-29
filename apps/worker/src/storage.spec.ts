import { afterEach, describe, expect, it, vi } from "vitest";
import { workerStorage } from "./storage";

describe("workerStorage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs read URLs with the worker-internal MinIO endpoint", async () => {
    stubWorkerEnv({
      S3_ENDPOINT: "http://minio:9000",
      S3_PUBLIC_ENDPOINT: "http://localhost:9000"
    });

    const storage = workerStorage();
    const readUrl = new URL(
      await storage.getSignedReadUrl("projects/project-a/assets/file-audio/rehearsal.webm")
    );

    expect(readUrl.origin).toBe("http://minio:9000");
    expect(readUrl.pathname).toBe(
      "/orbit-local/projects/project-a/assets/file-audio/rehearsal.webm"
    );
    expect(readUrl.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

function stubWorkerEnv(overrides: Record<string, string> = {}) {
  const env = {
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
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    AWS_REGION: "ap-northeast-2",
    TRANSCRIBE_LANGUAGE_CODE: "ko-KR",
    TEXTRACT_ENABLED: "false",
    LOG_LEVEL: "info",
    LOG_PRETTY: "false",
    DEMO_USER_ID: "user_demo_1",
    DEMO_WORKSPACE_ID: "workspace_demo_1",
    DEMO_PROJECT_ID: "project_demo_1",
    DEMO_DECK_ID: "deck_demo_1",
    DEMO_SESSION_ID: "session_demo_1",
    ...overrides
  };

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
}
