import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  allowedRehearsalAudioMimeTypes,
  assetUploadUrlResponseSchema,
  maxRehearsalAudioUploadSizeBytes,
} from "../files/file.schema";

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

export const slidePracticeAnalysisStatusSchema = z.enum([
  "uploading",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);

export const slidePracticeAnalysisErrorCodeSchema = z.enum([
  "TRANSCRIPTION_FAILED",
  "AUDIO_ANALYSIS_FAILED",
  "REPORT_PERSIST_FAILED",
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
  metricDefinitionVersion: z.union([z.literal(1), z.literal(2)]),
  classifierVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
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
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("browser"),
      sttEngine: slidePracticeSttEngineSchema,
      deviceIdHash: z.string().trim().min(1).max(128).nullable(),
      baselineVersion: z.number().int().positive().nullable(),
    }).strict(),
    z.object({
      kind: z.literal("server"),
      sttEngine: z.literal("report-stt"),
      deviceIdHash: z.string().trim().min(1).max(128).nullable(),
      baselineVersion: z.number().int().positive().nullable(),
    }).strict(),
  ]),
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

export const createSlidePracticeAnalysisRequestSchema = z.object({
  clientRequestId: identifierSchema,
  practiceSessionId: identifierSchema,
  deckId: identifierSchema,
  deckVersion: z.number().int().positive(),
  slideId: identifierSchema,
  slideOrder: z.number().int().min(0).max(10_000),
  startedAt: isoDateTimeSchema,
  mimeType: z.enum(allowedRehearsalAudioMimeTypes),
  size: z.number().int().positive().max(maxRehearsalAudioUploadSizeBytes),
  deviceIdHash: z.string().trim().min(1).max(128).nullable(),
}).strict();

export const completeSlidePracticeAnalysisRequestSchema = z.object({
  fileId: identifierSchema,
  durationMs: z.number().int().min(1).max(300_000),
}).strict();

export const slidePracticeAnalysisSchema = z.object({
  analysisId: identifierSchema,
  projectId: identifierSchema,
  practiceSessionId: identifierSchema,
  status: slidePracticeAnalysisStatusSchema,
  analysisJobId: identifierSchema.nullable(),
  reportId: identifierSchema.nullable(),
  errorCode: slidePracticeAnalysisErrorCodeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
}).strict();

export const createSlidePracticeAnalysisResponseSchema = z.object({
  analysis: slidePracticeAnalysisSchema,
  upload: assetUploadUrlResponseSchema.nullable(),
}).strict();

export const slidePracticeAnalysisResultResponseSchema = z.object({
  analysis: slidePracticeAnalysisSchema,
  report: slidePracticeReportRecordSchema.nullable(),
}).strict();

export const slidePracticeServerAudioResponseSchema = z.object({
  transcript: z.string(),
  provider: z.string().trim().min(1).max(80),
  meanRecognitionConfidence: z.number().finite().min(0).max(1).nullable(),
  voice: slidePracticeVoiceMetricsSchema,
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
export type SlidePracticeAnalysis = z.infer<typeof slidePracticeAnalysisSchema>;
export type CreateSlidePracticeAnalysisRequest = z.infer<typeof createSlidePracticeAnalysisRequestSchema>;
export type CompleteSlidePracticeAnalysisRequest = z.infer<typeof completeSlidePracticeAnalysisRequestSchema>;
export type SlidePracticeServerAudioResponse = z.infer<typeof slidePracticeServerAudioResponseSchema>;
