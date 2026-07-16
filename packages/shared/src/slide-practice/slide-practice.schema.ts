import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

const identifierSchema = z.string().trim().min(1).max(128);
const nullableFiniteMetricSchema = z.number().finite().nullable();

export const slidePracticeQualityStateSchema = z.enum([
  "measured",
  "partial",
  "unmeasured",
]);

export const slidePracticeQualityReasonSchema = z.enum([
  "insufficient-speech",
  "stt-unavailable",
  "audio-analysis-unavailable",
  "low-audio-quality",
  "pitch-unavailable",
  "baseline-unavailable",
]);

export const slidePracticeVoiceStyleModeSchema = z.enum([
  "lullaby",
  "turbo",
  "announcer",
  "cloud",
  "neutral",
]);

export const slidePracticeSttEngineSchema = z.enum([
  "web-speech",
  "openai-realtime",
  "none",
]);

export const slidePracticeFillerDetailSchema = z.object({
  word: z.string().trim().min(1).max(50),
  count: z.number().int().min(1).max(1_000),
}).strict();

export const slidePracticeVoiceMetricsSchema = z.object({
  activeSpeechMs: z.number().int().min(0).max(300_000),
  pauseRatio: z.number().finite().min(0).max(1),
  pitchMedianHz: nullableFiniteMetricSchema,
  pitchSpanHz: nullableFiniteMetricSchema,
  pitchValidRatio: z.number().finite().min(0).max(1),
  loudnessDb: nullableFiniteMetricSchema,
  loudnessMadDb: nullableFiniteMetricSchema,
  syllablesPerSecond: nullableFiniteMetricSchema,
  signalToNoiseDb: nullableFiniteMetricSchema,
  breathinessRatio: nullableFiniteMetricSchema,
  clarityRatio: nullableFiniteMetricSchema,
  rhythmRegularity: nullableFiniteMetricSchema,
  clippingRatio: z.number().finite().min(0).max(1),
}).strict();

export const slidePracticeStyleResultSchema = z.object({
  mode: slidePracticeVoiceStyleModeSchema,
  confidence: z.number().finite().min(0).max(1),
  evidenceLabels: z.array(z.string().trim().min(1).max(80)).max(6),
  message: z.string().trim().min(1).max(300),
}).strict();

export const slidePracticeQualitySchema = z.object({
  state: slidePracticeQualityStateSchema,
  reasons: z.array(slidePracticeQualityReasonSchema).max(6),
}).strict().superRefine((quality, context) => {
  if (quality.state === "measured" && quality.reasons.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasons"],
      message: "Measured practice reports cannot include quality failure reasons",
    });
  }
});

const slidePracticeReportCoreSchema = z.object({
  reportVersion: z.literal(1),
  metricDefinitionVersion: z.literal(1),
  classifierVersion: z.literal(1),
  practiceSessionId: identifierSchema,
  projectId: identifierSchema,
  deckId: identifierSchema,
  deckVersion: z.number().int().positive(),
  slideId: identifierSchema,
  slideOrder: z.number().int().min(0).max(10_000),
  startedAt: isoDateTimeSchema,
  durationMs: z.number().int().min(1).max(300_000),
  syllableCount: z.number().int().min(0).max(100_000),
  meanRecognitionConfidence: z.number().finite().min(0).max(1).nullable(),
  fillers: z.object({
    policyVersion: z.literal(1),
    totalCount: z.number().int().min(0).max(10_000),
    details: z.array(slidePracticeFillerDetailSchema).max(100),
  }).strict(),
  voice: slidePracticeVoiceMetricsSchema,
  style: slidePracticeStyleResultSchema,
  quality: slidePracticeQualitySchema,
  source: z.object({
    kind: z.literal("browser"),
    sttEngine: slidePracticeSttEngineSchema,
    deviceIdHash: z.string().trim().min(1).max(128).nullable(),
    baselineVersion: z.number().int().positive().nullable(),
  }).strict(),
}).strict();

function validateFillerTotals(
  report: z.infer<typeof slidePracticeReportCoreSchema>,
  context: z.RefinementCtx,
) {
  const detailTotal = report.fillers.details.reduce(
    (total, detail) => total + detail.count,
    0,
  );
  if (detailTotal !== report.fillers.totalCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fillers", "totalCount"],
      message: "Filler detail counts must equal totalCount",
    });
  }
}

export const slidePracticeReportSchema = slidePracticeReportCoreSchema.superRefine(
  validateFillerTotals,
);

export const createSlidePracticeReportRequestSchema = z.object({
  clientRequestId: identifierSchema,
  report: slidePracticeReportSchema,
}).strict();

export const slidePracticeReportRecordSchema = slidePracticeReportCoreSchema.extend({
    reportId: identifierSchema,
    createdBy: identifierSchema,
    createdAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
  }).strict().superRefine(validateFillerTotals);

export const slidePracticeReportListResponseSchema = z.object({
  reports: z.array(slidePracticeReportRecordSchema).max(100),
  nextCursor: z.string().trim().min(1).max(256).nullable(),
}).strict();

export const voiceBaselineMetricsSchema = z.object({
  pitchMedianHz: nullableFiniteMetricSchema,
  pitchSpanHz: nullableFiniteMetricSchema,
  loudnessDb: nullableFiniteMetricSchema,
  loudnessMadDb: nullableFiniteMetricSchema,
  syllablesPerSecond: nullableFiniteMetricSchema,
  rhythmRegularity: nullableFiniteMetricSchema,
}).strict();

export const upsertVoiceBaselineRequestSchema = z.object({
  clientRequestId: identifierSchema.optional(),
  deviceIdHash: z.string().trim().min(1).max(128),
  sampleCount: z.number().int().min(1).max(10_000),
  metrics: voiceBaselineMetricsSchema,
}).strict();

export const voiceBaselineRecordSchema = z.object({
  baselineVersion: z.literal(1),
  userId: identifierSchema,
  deviceIdHash: z.string().trim().min(1).max(128),
  sampleCount: z.number().int().min(1).max(10_000),
  metrics: voiceBaselineMetricsSchema,
  updatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

export type SlidePracticeReport = z.infer<typeof slidePracticeReportSchema>;
export type SlidePracticeFillerDetail = z.infer<typeof slidePracticeFillerDetailSchema>;
export type CreateSlidePracticeReportRequest = z.infer<typeof createSlidePracticeReportRequestSchema>;
export type SlidePracticeReportRecord = z.infer<typeof slidePracticeReportRecordSchema>;
export type SlidePracticeReportListResponse = z.infer<typeof slidePracticeReportListResponseSchema>;
export type SlidePracticeVoiceMetrics = z.infer<typeof slidePracticeVoiceMetricsSchema>;
export type SlidePracticeStyleResult = z.infer<typeof slidePracticeStyleResultSchema>;
export type VoiceBaselineMetrics = z.infer<typeof voiceBaselineMetricsSchema>;
export type VoiceBaselineRecord = z.infer<typeof voiceBaselineRecordSchema>;
export type UpsertVoiceBaselineRequest = z.infer<typeof upsertVoiceBaselineRequestSchema>;
