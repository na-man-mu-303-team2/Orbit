import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckIdSchema } from "../deck/id.schema";

export const presentationSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  presenterUserId: z.string().min(1),
  status: z.enum(["draft", "live", "ended"]),
  startedAt: isoDateTimeSchema.nullable(),
  endedAt: isoDateTimeSchema.nullable()
});

export const rehearsalMetricsSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  durationSeconds: z.number().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  fillerWordCount: z.number().int().nonnegative(),
  pauseCount: z.number().int().nonnegative(),
  keywordCoverage: z.number().min(0).max(1)
});

export const reportSchema = z.object({
  reportId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  summary: z.string().default(""),
  questionCount: z.number().int().nonnegative(),
  pollCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema
});

export type PresentationSession = z.infer<typeof presentationSessionSchema>;
export type RehearsalMetrics = z.infer<typeof rehearsalMetricsSchema>;
export type PresentationReport = z.infer<typeof reportSchema>;
