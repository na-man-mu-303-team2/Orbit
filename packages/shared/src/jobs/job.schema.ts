import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const jobTypeSchema = z.enum([
  "pptx-import",
  "deck-export",
  "reference-extract",
  "ai-deck-generation",
  "pptx-ooxml-generation",
  "pptx-ooxml-sync",
  "worker-health-check",
  "rehearsal-stt",
  "final-report-generation",
  "report-pdf-export",
]);

export const jobSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  type: jobTypeSchema,
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string().default(""),
  result: z.record(z.unknown()).nullable(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Job = z.infer<typeof jobSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;
