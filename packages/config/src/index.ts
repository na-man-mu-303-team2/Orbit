import {
  appEnvSchema,
  jobQueueDriverSchema,
  llmProviderSchema,
  nodeEnvSchema,
  ocrProviderSchema,
  storageDriverSchema,
  sttProviderSchema
} from "@orbit/shared";
import { ZodError, z } from "zod";

const booleanStringSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return value;
}, z.boolean());

const requiredString = (name: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z
      .string({ required_error: `${name} is required` })
      .min(1, `${name} is required`)
  );

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(1).optional());

const requiredUrl = (name: string) =>
  requiredString(name).pipe(z.string().url(`${name} must be a valid URL`));

const requiredPort = (name: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") {
        return undefined;
      }

      return Number(value);
    },
    z.number({ required_error: `${name} is required` }).int().min(1).max(65535)
  );

const remoteEnvValues = ["staging", "production"] as const;
const remoteEnvSet = new Set<string>(remoteEnvValues);

const localDefaults = {
  WEB_ORIGIN: "http://localhost:5173",
  API_BASE_URL: "http://localhost:3000",
  PYTHON_WORKER_URL: "http://localhost:8000",
  DATABASE_URL: "postgres://orbit:orbit@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "local-session-secret-change-me",
  COOKIE_SECRET: "local-cookie-secret-change-me",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "orbit-local"
} as const;

export const orbitEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_ENV: appEnvSchema,
  WEB_PORT: requiredPort("WEB_PORT"),
  API_PORT: requiredPort("API_PORT"),
  WORKER_PORT: requiredPort("WORKER_PORT"),
  PYTHON_WORKER_PORT: requiredPort("PYTHON_WORKER_PORT"),
  WEB_ORIGIN: requiredUrl("WEB_ORIGIN"),
  API_BASE_URL: requiredUrl("API_BASE_URL"),
  PYTHON_WORKER_URL: requiredUrl("PYTHON_WORKER_URL"),
  DATABASE_URL: requiredString("DATABASE_URL"),
  REDIS_URL: requiredString("REDIS_URL"),
  SESSION_SECRET: requiredString("SESSION_SECRET").pipe(
    z.string().min(16, "SESSION_SECRET must be at least 16 characters")
  ),
  COOKIE_SECRET: requiredString("COOKIE_SECRET").pipe(
    z.string().min(16, "COOKIE_SECRET must be at least 16 characters")
  ),
  STORAGE_DRIVER: storageDriverSchema,
  S3_ENDPOINT: optionalString,
  S3_PUBLIC_ENDPOINT: optionalString,
  S3_BUCKET: requiredString("S3_BUCKET"),
  S3_REGION: requiredString("S3_REGION"),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: booleanStringSchema.default(true),
  JOB_QUEUE_DRIVER: jobQueueDriverSchema,
  STT_PROVIDER: sttProviderSchema,
  OCR_PROVIDER: ocrProviderSchema,
  LLM_PROVIDER: llmProviderSchema,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: requiredString("OPENAI_MODEL"),
  OPENAI_EMBEDDING_MODEL: requiredString("OPENAI_EMBEDDING_MODEL"),
  AWS_REGION: requiredString("AWS_REGION"),
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  TRANSCRIBE_LANGUAGE_CODE: requiredString("TRANSCRIBE_LANGUAGE_CODE"),
  TEXTRACT_ENABLED: booleanStringSchema.default(false),
  DEMO_USER_ID: requiredString("DEMO_USER_ID"),
  DEMO_WORKSPACE_ID: requiredString("DEMO_WORKSPACE_ID"),
  DEMO_PROJECT_ID: requiredString("DEMO_PROJECT_ID"),
  DEMO_DECK_ID: requiredString("DEMO_DECK_ID"),
  DEMO_SESSION_ID: requiredString("DEMO_SESSION_ID")
}).superRefine((value, context) => {
  if (value.STORAGE_DRIVER === "minio") {
    for (const key of [
      "S3_ENDPOINT",
      "S3_PUBLIC_ENDPOINT",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY"
    ] as const) {
      if (!value[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=minio`
        });
      }
    }
  }

  if (remoteEnvSet.has(value.APP_ENV)) {
    for (const [key, localValue] of Object.entries(localDefaults)) {
      const configKey = key as keyof typeof localDefaults;
      if (value[configKey] === localValue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must not use the local default in ${value.APP_ENV}`
        });
      }
    }

    if (!value.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: `OPENAI_API_KEY is required in ${value.APP_ENV}`
      });
    }
  }
});

export type OrbitConfig = z.infer<typeof orbitEnvSchema>;

export interface LoadOrbitConfigOptions {
  service?: "api" | "worker" | "web" | "shared";
}

export class OrbitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrbitConfigError";
  }
}

export function loadOrbitConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadOrbitConfigOptions = {}
): OrbitConfig {
  const result = orbitEnvSchema.safeParse(env);

  if (!result.success) {
    throw new OrbitConfigError(formatOrbitConfigError(result.error, options));
  }

  return result.data;
}

export function formatOrbitConfigError(
  error: ZodError,
  options: LoadOrbitConfigOptions = {}
): string {
  const service = options.service ?? "shared";
  const lines = error.issues.map((issue) => {
    const path = issue.path.join(".") || "env";
    return `- ${path}: ${issue.message}`;
  });

  return [
    `Invalid ORBIT environment for ${service}.`,
    "Fix the variables below or copy .env.example to .env.local for local development.",
    ...lines
  ].join("\n");
}
