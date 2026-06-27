import { z } from "zod";

export const referenceSearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(6)
});

export const referenceSearchWorkerRequestSchema =
  referenceSearchRequestSchema.extend({
    projectId: z.string().min(1)
  });

export const referenceChunkSchema = z.object({
  chunkId: z.string().min(1),
  projectId: z.string().min(1),
  fileId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  score: z.number()
});

export const referenceSearchResponseSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(1),
  status: z.enum(["succeeded", "unavailable", "failed"]),
  message: z.string().default(""),
  chunks: z.array(referenceChunkSchema)
});

export type ReferenceSearchRequest = z.infer<
  typeof referenceSearchRequestSchema
>;
export type ReferenceSearchResponse = z.infer<
  typeof referenceSearchResponseSchema
>;
