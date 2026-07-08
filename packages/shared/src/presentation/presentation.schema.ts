import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckIdSchema } from "../deck/id.schema";

export const joinCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "joinCode must be exactly 6 digits");

export const presentationSessionStatusSchema = z.enum([
  "draft",
  "live",
  "ended",
]);
export const presentationEntryStatusSchema = z.enum(["open", "closed"]);
export const audienceSlideRenderModeSchema = z.enum(["image-first"]);

export const presentationSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  presenterUserId: z.string().min(1),
  joinCode: joinCodeSchema,
  status: presentationSessionStatusSchema,
  entryStatus: presentationEntryStatusSchema,
  audienceSlideRenderMode: audienceSlideRenderModeSchema,
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  endedAt: isoDateTimeSchema.nullable(),
  surveyClosesAt: isoDateTimeSchema.nullable(),
  rawDataDeleteAfter: isoDateTimeSchema,
});

export const rehearsalMetricsSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  durationSeconds: z.number().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  fillerWordCount: z.number().int().nonnegative(),
  pauseCount: z.number().int().nonnegative(),
  keywordCoverage: z.number().min(0).max(1),
});

export const reportSchema = z.object({
  reportId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  summary: z.string().default(""),
  questionCount: z.number().int().nonnegative(),
  pollCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});

export const createPresentationSessionRequestSchema = z
  .object({
    deckId: deckIdSchema,
  })
  .strict();

export const createPresentationSessionResponseSchema = z.object({
  session: presentationSessionSchema,
  audienceUrl: z.string().min(1),
});

export const getCurrentPresentationSessionResponseSchema = z.object({
  session: presentationSessionSchema.nullable(),
  audienceUrl: z.string().min(1).nullable(),
});

export const updatePresentationSessionEntryRequestSchema = z
  .object({
    entryStatus: presentationEntryStatusSchema,
  })
  .strict();

export const updatePresentationSessionEntryResponseSchema = z.object({
  session: presentationSessionSchema,
});

export type PresentationSession = z.infer<typeof presentationSessionSchema>;
export type PresentationSessionStatus = z.infer<
  typeof presentationSessionStatusSchema
>;
export type PresentationEntryStatus = z.infer<
  typeof presentationEntryStatusSchema
>;
export type AudienceSlideRenderMode = z.infer<
  typeof audienceSlideRenderModeSchema
>;
export type RehearsalMetrics = z.infer<typeof rehearsalMetricsSchema>;
export type PresentationReport = z.infer<typeof reportSchema>;
export type CreatePresentationSessionRequest = z.infer<
  typeof createPresentationSessionRequestSchema
>;
export type CreatePresentationSessionResponse = z.infer<
  typeof createPresentationSessionResponseSchema
>;
export type GetCurrentPresentationSessionResponse = z.infer<
  typeof getCurrentPresentationSessionResponseSchema
>;
export type UpdatePresentationSessionEntryRequest = z.infer<
  typeof updatePresentationSessionEntryRequestSchema
>;
export type UpdatePresentationSessionEntryResponse = z.infer<
  typeof updatePresentationSessionEntryResponseSchema
>;
