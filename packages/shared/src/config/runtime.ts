import { z } from "zod";

export const nodeEnvSchema = z.enum(["development", "test", "production"]);
export const appEnvSchema = z.enum(["local", "test", "staging", "production"]);
export const storageDriverSchema = z.enum(["minio", "s3"]);
export const jobQueueDriverSchema = z.enum(["bullmq", "sqs"]);
export const sttProviderSchema = z.enum(["sherpa", "transcribe", "openai"]);
export const ocrProviderSchema = z.enum(["python", "textract"]);
export const llmProviderSchema = z.literal("openai");

export const openAiModelDefaults = {
  model: "gpt-4.1-mini",
  embeddingModel: "text-embedding-3-small"
} as const;

export type NodeEnv = z.infer<typeof nodeEnvSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;
export type StorageDriver = z.infer<typeof storageDriverSchema>;
export type JobQueueDriver = z.infer<typeof jobQueueDriverSchema>;
export type SttProvider = z.infer<typeof sttProviderSchema>;
export type OcrProvider = z.infer<typeof ocrProviderSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
