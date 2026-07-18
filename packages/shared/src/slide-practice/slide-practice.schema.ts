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

export const slidePracticeLoudnessSampleSchema = z.object({
  startMs: z.number().int().min(0).max(300_000),
  endMs: z.number().int().positive().max(300_000),
  loudnessDb: z.number().finite().min(-100).max(0),
}).strict().superRefine((sample, context) => {
  if (sample.endMs <= sample.startMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endMs"],
      message: "Loudness sample endMs must be greater than startMs",
    });
  }
});

export const slidePracticeSpeedSampleSchema = z.object({
  startMs: z.number().int().min(0).max(300_000),
  endMs: z.number().int().positive().max(300_000),
  syllablesPerSecond: z.number().finite().min(0).max(100),
}).strict().superRefine((sample, context) => {
  if (sample.endMs <= sample.startMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endMs"],
      message: "Speed sample endMs must be greater than startMs",
    });
  }
});

export const slidePracticeTranscriptSegmentSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  startMs: z.number().int().min(0).max(300_000),
  endMs: z.number().int().positive().max(300_000),
}).strict().superRefine((segment, context) => {
  if (segment.endMs <= segment.startMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endMs"],
      message: "Transcript segment endMs must be greater than startMs",
    });
  }
});

export const slidePracticePauseSegmentSchema = z.object({
  startMs: z.number().int().min(0).max(300_000),
  endMs: z.number().int().positive().max(300_000),
  durationMs: z.number().int().positive().max(300_000),
}).strict().superRefine((segment, context) => {
  if (segment.endMs <= segment.startMs || segment.durationMs !== segment.endMs - segment.startMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationMs"],
      message: "Pause segment duration must match its time range",
    });
  }
});

export const slidePracticeCoachingIssueCodeSchema = z.enum([
  "filler-use",
  "pace-slow",
  "pace-fast",
  "pause-low",
  "pause-high",
  "pitch-flat",
  "pitch-wide",
  "loudness-low",
  "loudness-high",
]);

export const slidePracticeCoachingCategorySchema = z.enum([
  "filler",
  "pace",
  "pause",
  "pitch",
  "loudness",
]);

export const slidePracticeScriptEditSchema = z.object({
  originalText: z.string().trim().min(1).max(1_000),
  suggestedText: z.string().trim().min(1).max(1_000),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const slidePracticeScriptMetricEvidenceSchema = z.object({
  originalText: z.string().trim().min(1).max(1_000),
  alignment: z.enum(["matched", "practice-target"]),
  startMs: z.number().int().min(0).max(300_000).nullable(),
  endMs: z.number().int().positive().max(300_000).nullable(),
  issueCodes: z.array(slidePracticeCoachingIssueCodeSchema).min(1).max(9),
  metrics: z.object({
    syllablesPerSecond: nullableFiniteMetricSchema,
    loudnessDb: nullableFiniteMetricSchema,
    pauseBeforeMs: z.number().int().min(0).max(300_000).nullable(),
    pauseAfterMs: z.number().int().min(0).max(300_000).nullable(),
    pitchSpanHz: nullableFiniteMetricSchema,
    fillerTotalCount: z.number().int().min(0).max(10_000),
    fillerWords: z.array(z.string().trim().min(1).max(50)).max(5),
    loudnessVariationDb: nullableFiniteMetricSchema,
    rhythmRegularity: nullableFiniteMetricSchema,
  }).strict(),
}).strict().superRefine((evidence, context) => {
  if ((evidence.startMs === null) !== (evidence.endMs === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startMs"],
      message: "Script evidence time range must be fully present or absent",
    });
  }
  if (evidence.startMs !== null && evidence.endMs !== null && evidence.endMs <= evidence.startMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endMs"],
      message: "Script evidence endMs must be greater than startMs",
    });
  }
});

export const slidePracticeCoachingItemSchema = z.object({
  category: slidePracticeCoachingCategorySchema,
  title: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
  action: z.string().trim().min(1).max(500),
  practiceTip: z.string().trim().min(1).max(500),
  scriptEdit: slidePracticeScriptEditSchema.nullable(),
  scriptEvidence: slidePracticeScriptMetricEvidenceSchema.nullable().optional(),
}).strict();

export const slidePracticeCoachingPracticePlanSchema = z.object({
  title: z.string().trim().min(1).max(100),
  steps: z.array(z.string().trim().min(1).max(300)).min(1).max(3),
}).strict();

export const slidePracticeCoachingContentSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  items: z.array(slidePracticeCoachingItemSchema).min(1).max(2),
  practicePlan: slidePracticeCoachingPracticePlanSchema,
  model: z.string().trim().min(1).max(100),
}).strict();

export const slidePracticeCoachingSelectionContentSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  item: z.object({
    evidenceId: identifierSchema,
    category: slidePracticeCoachingCategorySchema,
    title: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(500),
    action: z.string().trim().min(1).max(500),
    practiceTip: z.string().trim().min(1).max(500),
  }).strict(),
  model: z.string().trim().min(1).max(100),
}).strict();

export const slidePracticeCoachingSchema = z.object({
  status: z.enum(["succeeded", "not-needed", "unavailable"]),
  summary: z.string().trim().min(1).max(500),
  issueCodes: z.array(slidePracticeCoachingIssueCodeSchema).max(9),
  items: z.array(slidePracticeCoachingItemSchema).max(2),
  practicePlan: slidePracticeCoachingPracticePlanSchema.nullable(),
  model: z.string().trim().min(1).max(100).nullable(),
  policyVersion: z.literal(1),
  promptVersion: z.union([z.literal(1), z.literal(2)]),
  generatedAt: isoDateTimeSchema.nullable(),
}).strict().superRefine((coaching, context) => {
  if (coaching.status === "succeeded") {
    const validLegacyContent = coaching.promptVersion === 1
      && coaching.items.length > 0
      && coaching.practicePlan !== null;
    const validScriptMetricContent = coaching.promptVersion === 2
      && coaching.items.length === 1
      && coaching.practicePlan === null
      && coaching.items[0]?.scriptEvidence != null;
    if (!validLegacyContent && !validScriptMetricContent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Succeeded coaching content must match its prompt version",
      });
    }
    if (coaching.model === null || coaching.generatedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: "Succeeded coaching requires model metadata",
      });
    }
  }
  if (coaching.status === "not-needed" && coaching.summary !== "정말 잘했어요 개선점이 없어요!!") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["summary"],
      message: "Not-needed coaching must use the approved success message",
    });
  }
  if (coaching.status !== "succeeded" && (
    coaching.items.length > 0 || coaching.practicePlan !== null || coaching.model !== null
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Non-succeeded coaching cannot include generated content",
    });
  }
});

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
  reportVersion: z.union([z.literal(1), z.literal(2)]),
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
  loudnessSamples: z.array(slidePracticeLoudnessSampleSchema).max(300).optional(),
  speedSamples: z.array(slidePracticeSpeedSampleSchema).max(60).optional(),
  coaching: slidePracticeCoachingSchema.optional(),
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
  loudnessSamples: z.array(slidePracticeLoudnessSampleSchema).max(300),
  speedSamples: z.array(slidePracticeSpeedSampleSchema).max(60),
  transcriptSegments: z.array(slidePracticeTranscriptSegmentSchema).max(100),
  pauseSegments: z.array(slidePracticePauseSegmentSchema).max(100),
}).strict();

export type SlidePracticeReport = z.infer<typeof slidePracticeReportSchema>;
export type SlidePracticeFillerDetail = z.infer<typeof slidePracticeFillerDetailSchema>;
export type SlidePracticeLoudnessSample = z.infer<typeof slidePracticeLoudnessSampleSchema>;
export type SlidePracticeSpeedSample = z.infer<typeof slidePracticeSpeedSampleSchema>;
export type SlidePracticeTranscriptSegment = z.infer<typeof slidePracticeTranscriptSegmentSchema>;
export type SlidePracticePauseSegment = z.infer<typeof slidePracticePauseSegmentSchema>;
export type SlidePracticeCoachingIssueCode = z.infer<typeof slidePracticeCoachingIssueCodeSchema>;
export type SlidePracticeCoaching = z.infer<typeof slidePracticeCoachingSchema>;
export type SlidePracticeCoachingContent = z.infer<typeof slidePracticeCoachingContentSchema>;
export type SlidePracticeCoachingSelectionContent = z.infer<typeof slidePracticeCoachingSelectionContentSchema>;
export type SlidePracticeScriptMetricEvidence = z.infer<typeof slidePracticeScriptMetricEvidenceSchema>;
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
