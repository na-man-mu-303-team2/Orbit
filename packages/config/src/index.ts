import { demoIds } from "@orbit/shared";
import { z } from "zod";

const booleanStringSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).toLowerCase() === "true";
}, z.boolean());

export const orbitEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_BASE_URL: z.string().url().default("http://localhost:3000"),
  PYTHON_WORKER_URL: z.string().url().default("http://localhost:8000"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://orbit:orbit@localhost:5432/orbit"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_SECRET: z.string().min(16).default("local-session-secret-change-me"),
  COOKIE_SECRET: z.string().min(16).default("local-cookie-secret-change-me"),
  STORAGE_DRIVER: z.enum(["minio", "s3"]).default("minio"),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().min(1).default("orbit-local"),
  S3_REGION: z.string().min(1).default("ap-northeast-2"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanStringSchema.default(true),
  JOB_QUEUE_DRIVER: z.enum(["bullmq", "sqs"]).default("bullmq"),
  STT_PROVIDER: z.enum(["sherpa", "transcribe", "openai"]).default("sherpa"),
  OCR_PROVIDER: z.enum(["python", "textract"]).default("python"),
  LLM_PROVIDER: z.literal("openai").default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z
    .string()
    .min(1)
    .default("text-embedding-3-small"),
  AWS_REGION: z.string().min(1).default("ap-northeast-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  TRANSCRIBE_LANGUAGE_CODE: z.string().min(1).default("ko-KR"),
  TEXTRACT_ENABLED: booleanStringSchema.default(false),
  DEMO_USER_ID: z.string().min(1).default(demoIds.userId),
  DEMO_WORKSPACE_ID: z.string().min(1).default(demoIds.workspaceId),
  DEMO_PROJECT_ID: z.string().min(1).default(demoIds.projectId),
  DEMO_DECK_ID: z.string().min(1).default(demoIds.deckId),
  DEMO_SESSION_ID: z.string().min(1).default(demoIds.sessionId)
});

export type OrbitConfig = z.infer<typeof orbitEnvSchema>;

export function loadOrbitConfig(
  env: NodeJS.ProcessEnv = process.env
): OrbitConfig {
  return orbitEnvSchema.parse(env);
}
