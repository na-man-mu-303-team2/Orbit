import { loadOrbitConfig, OrbitConfigError } from "@orbit/config";
import { describe, expect, it } from "vitest";

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

describe("ORBIT env validation", () => {
  it("reads OpenAI model defaults from env", () => {
    const config = loadOrbitConfig(
      {
        ...validEnv,
        OPENAI_MODEL: "gpt-4.1",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-large"
      },
      { service: "api" }
    );

    expect(config.OPENAI_MODEL).toBe("gpt-4.1");
    expect(config.OPENAI_EMBEDDING_MODEL).toBe("text-embedding-3-large");
  });

  it("fails with a readable error when a required value is missing", () => {
    const env = { ...validEnv } as Partial<typeof validEnv>;
    delete env.DATABASE_URL;

    expect(() => loadOrbitConfig(env as NodeJS.ProcessEnv, { service: "api" })).toThrow(
      OrbitConfigError
    );
    expect(() =>
      loadOrbitConfig(env as NodeJS.ProcessEnv, { service: "api" })
    ).toThrow(/Invalid ORBIT environment for api[\s\S]*DATABASE_URL/);
  });

  it("treats empty strings as missing required values", () => {
    expect(() =>
      loadOrbitConfig({ ...validEnv, OPENAI_MODEL: " " }, { service: "api" })
    ).toThrow(/OPENAI_MODEL/);
  });

  it("rejects local defaults in staging and production", () => {
    expect(() =>
      loadOrbitConfig(
        {
          ...validEnv,
          APP_ENV: "staging",
          OPENAI_API_KEY: "sk-staging-placeholder"
        },
        { service: "api" }
      )
    ).toThrow(/DATABASE_URL must not use the local default in staging/);
  });
});
