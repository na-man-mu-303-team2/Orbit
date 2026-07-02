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

export const audienceAccessSessionStatusSchema = z.enum(["open", "closed"]);

export const audienceAccessSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  status: audienceAccessSessionStatusSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema
});

export const createAudienceAccessSessionRequestSchema = z.object({
  passcode: z.string().regex(/^\d{4}$/, "passcode must be exactly 4 digits"),
  expiresInHours: z.number().int().min(1).max(24)
});

export const createAudienceAccessSessionResponseSchema = z.object({
  session: audienceAccessSessionSchema,
  audienceUrl: z.string().min(1)
});

export const getCurrentAudienceAccessSessionResponseSchema = z.object({
  session: audienceAccessSessionSchema.nullable(),
  audienceUrl: z.string().min(1).nullable()
});

export const updateAudienceAccessSessionStatusRequestSchema = z.object({
  status: audienceAccessSessionStatusSchema
});

export const updateAudienceAccessSessionStatusResponseSchema = z.object({
  session: audienceAccessSessionSchema
});

export type PresentationSession = z.infer<typeof presentationSessionSchema>;
export type RehearsalMetrics = z.infer<typeof rehearsalMetricsSchema>;
export type PresentationReport = z.infer<typeof reportSchema>;
export type AudienceAccessSession = z.infer<typeof audienceAccessSessionSchema>;
export type AudienceAccessSessionStatus = z.infer<
  typeof audienceAccessSessionStatusSchema
>;
export type CreateAudienceAccessSessionRequest = z.infer<
  typeof createAudienceAccessSessionRequestSchema
>;
export type CreateAudienceAccessSessionResponse = z.infer<
  typeof createAudienceAccessSessionResponseSchema
>;
export type GetCurrentAudienceAccessSessionResponse = z.infer<
  typeof getCurrentAudienceAccessSessionResponseSchema
>;
export type UpdateAudienceAccessSessionStatusRequest = z.infer<
  typeof updateAudienceAccessSessionStatusRequestSchema
>;
export type UpdateAudienceAccessSessionStatusResponse = z.infer<
  typeof updateAudienceAccessSessionStatusResponseSchema
>;
