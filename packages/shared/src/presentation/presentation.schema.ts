import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckIdSchema } from "../deck/id.schema";
import { activityRunIdSchema } from "../activity/activity-id.schema";

export const presentationAccessModeSchema = z.enum(["passcode", "public"]);

export const presentationSessionSchema = z
  .object({
    sessionId: z.string().min(1),
    projectId: z.string().min(1),
    deckId: deckIdSchema,
    deckVersion: z.number().int().positive(),
    presenterUserId: z.string().min(1),
    createdBy: z.string().min(1),
    status: z.enum(["draft", "live", "ended"]),
    accessMode: presentationAccessModeSchema,
    startsAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
    activeActivityRunId: activityRunIdSchema.nullable(),
    startedAt: isoDateTimeSchema.nullable(),
    endedAt: isoDateTimeSchema.nullable(),
    closedAt: isoDateTimeSchema.nullable(),
    rawResponsesDeleteAfter: isoDateTimeSchema.nullable(),
    rawResponsesDeletedAt: isoDateTimeSchema.nullable(),
    resultsDeletedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((session, ctx) => {
    const startsAt = new Date(session.startsAt).getTime();
    const expiresAt = new Date(session.expiresAt).getTime();
    if (expiresAt <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be later than startsAt"
      });
    }
    if (expiresAt - startsAt > 30 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "presentation access cannot exceed 30 days"
      });
    }
  });

export const createPresentationSessionRequestSchema = z
  .object({
    deckId: deckIdSchema,
    startsAt: isoDateTimeSchema.optional(),
    expiresAt: isoDateTimeSchema.optional(),
    accessMode: presentationAccessModeSchema.default("passcode"),
    passcode: z.string().regex(/^\d{4}$/).optional()
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.accessMode === "passcode" && request.passcode === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passcode"],
        message: "passcode is required for passcode access"
      });
    }
    if (request.accessMode === "public" && request.passcode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passcode"],
        message: "public access must not include a passcode"
      });
    }
  });

export const updatePresentationSessionAccessRequestSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
    accessMode: presentationAccessModeSchema,
    passcode: z.string().regex(/^\d{4}$/).optional()
  })
  .strict();

export const presentationSessionResponseSchema = z
  .object({ session: presentationSessionSchema })
  .strict();

export const listPresentationSessionsResponseSchema = z
  .object({ sessions: z.array(presentationSessionSchema) })
  .strict();

export const rehearsalMetricsSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  durationSeconds: z.number().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  fillerWordCount: z.number().int().nonnegative(),
  longSilenceCount: z.number().int().nonnegative().nullable(),
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

export const audienceAccessSessionStatusSchema = z.enum(["open", "closed"]);

export const audienceAccessSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  status: audienceAccessSessionStatusSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});

export const createAudienceAccessSessionRequestSchema = z.object({
  passcode: z.string().regex(/^\d{4}$/, "passcode must be exactly 4 digits"),
  expiresInHours: z.number().int().min(1).max(24),
});

export const createAudienceAccessSessionResponseSchema = z.object({
  session: audienceAccessSessionSchema,
  audienceUrl: z.string().min(1),
});

export const getCurrentAudienceAccessSessionResponseSchema = z.object({
  session: audienceAccessSessionSchema.nullable(),
  audienceUrl: z.string().min(1).nullable(),
});

export const updateAudienceAccessSessionStatusRequestSchema = z.object({
  status: audienceAccessSessionStatusSchema,
});

export const updateAudienceAccessSessionStatusResponseSchema = z.object({
  session: audienceAccessSessionSchema,
});

export const verifyAudienceAccessSessionRequestSchema = z.object({
  passcode: z.string().regex(/^\d{4}$/, "passcode must be exactly 4 digits"),
});

export const verifyAudienceAccessSessionResponseSchema = z.object({
  verified: z.literal(true),
  session: audienceAccessSessionSchema,
});

export type PresentationSession = z.infer<typeof presentationSessionSchema>;
export type PresentationAccessMode = z.infer<
  typeof presentationAccessModeSchema
>;
export type CreatePresentationSessionRequest = z.infer<
  typeof createPresentationSessionRequestSchema
>;
export type UpdatePresentationSessionAccessRequest = z.infer<
  typeof updatePresentationSessionAccessRequestSchema
>;
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
export type VerifyAudienceAccessSessionRequest = z.infer<
  typeof verifyAudienceAccessSessionRequestSchema
>;
export type VerifyAudienceAccessSessionResponse = z.infer<
  typeof verifyAudienceAccessSessionResponseSchema
>;
