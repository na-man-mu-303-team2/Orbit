import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  allowedRehearsalAudioMimeTypes,
  assetUploadUrlResponseSchema
} from "../files/file.schema";
import { jobSchema } from "../jobs/job.schema";
import {
  deckKeywordIdSchema,
  deckSemanticCueIdSchema,
  deckSlideIdSchema
} from "../deck/id.schema";

export const rehearsalRunStatusSchema = z.enum([
  "created",
  "uploading",
  "processing",
  "succeeded",
  "failed"
]);

export const rehearsalRunErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export const rehearsalRunSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: z.string().min(1),
  audioFileId: z.string().min(1).nullable(),
  jobId: z.string().min(1).nullable(),
  status: rehearsalRunStatusSchema,
  error: rehearsalRunErrorSchema.nullable(),
  rawAudioDeletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const rehearsalReportMetricsSchema = z.object({
  durationSeconds: z.number().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  fillerWordCount: z.number().int().nonnegative(),
  pauseCount: z.number().int().nonnegative(),
  keywordCoverage: z.number().min(0).max(1)
}).strict();

export const rehearsalReportSpeedSampleSchema = z
  .object({
    startSecond: z.number().nonnegative(),
    endSecond: z.number().nonnegative(),
    wordsPerMinute: z.number().nonnegative()
  })
  .strict();

export const rehearsalReportFillerWordDetailSchema = z
  .object({
    word: z.string().trim().min(1),
    count: z.number().int().nonnegative()
  })
  .strict();

export const rehearsalReportPauseDetailSchema = z
  .object({
    startSecond: z.number().nonnegative(),
    endSecond: z.number().nonnegative(),
    durationSeconds: z.number().nonnegative()
  })
  .strict();

export const rehearsalReportMissedKeywordSchema = z
  .object({
    slideId: deckSlideIdSchema,
    keywordId: deckKeywordIdSchema,
    text: z.string().trim().min(1)
  })
  .strict();

export const rehearsalReportSlideTimingSchema = z
  .object({
    slideId: deckSlideIdSchema,
    targetSeconds: z.number().nonnegative(),
    actualSeconds: z.number().nonnegative()
  })
  .strict();

export const rehearsalReportSlideInsightSchema = z
  .object({
    slideId: deckSlideIdSchema,
    fillerWordCount: z.number().int().nonnegative(),
    pauseCount: z.number().int().nonnegative()
  })
  .strict();

export const rehearsalReportQnaTopicSchema = z
  .object({
    topic: z.string().trim().min(1),
    slideId: deckSlideIdSchema.optional()
  })
  .strict();

export const rehearsalReportQnaSummarySchema = z
  .object({
    questionCount: z.number().int().nonnegative(),
    questionSummary: z.string().default(""),
    unclearTopics: z.array(rehearsalReportQnaTopicSchema).default([])
  })
  .strict();

export const rehearsalReportAiSummarySchema = z
  .object({
    headline: z.string().trim().min(1),
    paragraphs: z.array(z.string().trim().min(1)).min(1).max(3)
  })
  .strict();

export const rehearsalReportCoachingSchema = z.object({
  status: z.literal("succeeded"),
  summary: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  nextPracticeFocus: z.string().default(""),
  message: z.string().default("")
});

export const rehearsalUtteranceOutcomeKindSchema = z.enum([
  "covered",
  "paraphrased",
  "ad-lib",
  "missed"
]);

export const rehearsalUtteranceOutcomeSchema = z
  .object({
    slideId: deckSlideIdSchema,
    kind: rehearsalUtteranceOutcomeKindSchema,
    sentenceId: z.string().trim().min(1).optional(),
    text: z.string().trim().min(1).max(600).optional(),
    similarity: z.number().min(-1).max(1).optional(),
    lexicalOverlap: z.number().min(0).max(1).optional(),
    at: isoDateTimeSchema.optional()
  })
  .strict();

export const semanticCueDecisionLabelSchema = z.enum([
  "covered",
  "partial",
  "not_covered",
  "contradicted"
]);

export const semanticCueNliProviderSchema = z.enum([
  "browser-transformersjs",
  "browser-onnx",
  "mock"
]);

export const rehearsalSemanticCueDecisionSchema = z
  .object({
    slideId: deckSlideIdSchema,
    cueId: deckSemanticCueIdSchema,
    label: semanticCueDecisionLabelSchema,
    finalScore: z.number().finite().min(0).max(1),
    embeddingScore: z.number().finite().min(-1).max(1).optional(),
    lexicalScore: z.number().finite().min(0).max(1).optional(),
    conceptCoverage: z.number().finite().min(0).max(1).optional(),
    entailmentScore: z.number().finite().min(0).max(1).optional(),
    neutralScore: z.number().finite().min(0).max(1).optional(),
    contradictionScore: z.number().finite().min(0).max(1).optional(),
    premise: z.string().trim().min(1).max(600).optional(),
    hypothesis: z.string().trim().min(1).max(300).optional(),
    provider: semanticCueNliProviderSchema,
    modelId: z.string().trim().min(1).max(160).optional(),
    reasonCodes: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
    at: isoDateTimeSchema.optional()
  })
  .strict();

export const rehearsalReportSchema = z
  .object({
    reportId: z.string().min(1),
    runId: z.string().min(1),
    projectId: z.string().min(1),
    deckId: z.string().min(1),
    transcriptRetained: z.boolean(),
    transcript: z.string().nullable(),
    metrics: rehearsalReportMetricsSchema,
    speedSamples: z.array(rehearsalReportSpeedSampleSchema).default([]),
    fillerWordDetails: z.array(rehearsalReportFillerWordDetailSchema).default([]),
    pauseDetails: z.array(rehearsalReportPauseDetailSchema).default([]),
    missedKeywords: z.array(rehearsalReportMissedKeywordSchema).default([]),
    utteranceOutcomes: z.array(rehearsalUtteranceOutcomeSchema).default([]),
    semanticCueDecisions: z
      .array(rehearsalSemanticCueDecisionSchema)
      .default([]),
    slideTimings: z.array(rehearsalReportSlideTimingSchema).default([]),
    slideInsights: z.array(rehearsalReportSlideInsightSchema).default([]),
    qnaSummary: rehearsalReportQnaSummarySchema.default({
      questionCount: 0,
      questionSummary: "",
      unclearTopics: []
    }),
    aiSummary: rehearsalReportAiSummarySchema.nullable().optional(),
    coaching: rehearsalReportCoachingSchema.nullable(),
    generatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((report, context) => {
    if (!report.transcriptRetained && report.transcript !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "transcript must be null when transcriptRetained is false.",
        path: ["transcript"]
      });
    }
  });

export const createRehearsalRunRequestSchema = z.object({
  deckId: z.string().min(1)
});

export const createRehearsalRunResponseSchema = z.object({
  run: rehearsalRunSchema
});

export const createRehearsalAudioUploadUrlRequestSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(allowedRehearsalAudioMimeTypes),
  size: z.number().int().positive()
});

export const createRehearsalAudioUploadUrlResponseSchema = z.object({
  run: rehearsalRunSchema,
  upload: assetUploadUrlResponseSchema
});

export const completeRehearsalAudioUploadUrlRequestSchema = z.object({
  fileId: z.string().min(1)
});

export const rehearsalAudioSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "sha256은 64자리 16진수 문자열이어야 합니다.");

export const beginRehearsalAudioUploadRequestSchema = z
  .object({
    codec: z.literal("flac"),
    sampleRate: z.literal(16000),
    channels: z.literal(1),
    chunkDurationMs: z.literal(30000)
  })
  .strict();

export const uploadRehearsalAudioChunkParamsSchema = z
  .object({
    runId: z.string().min(1),
    index: z.coerce.number().int().nonnegative()
  })
  .strict();

export const completeRehearsalAudioUploadRequestSchema =
  completeRehearsalAudioUploadUrlRequestSchema;

export const completeRehearsalAudioChunkUploadRequestSchema = z
  .object({
    chunkCount: z.number().int().positive(),
    totalDurationMs: z.number().int().positive(),
    totalSizeBytes: z.number().int().positive(),
    sha256: rehearsalAudioSha256Schema
  })
  .strict();

export const completeRehearsalAudioUploadResponseSchema = z.object({
  run: rehearsalRunSchema,
  job: jobSchema
});

export const rehearsalUtteranceOutcomeKindSchema = z.enum([
  "covered",
  "paraphrased",
  "ad-lib",
  "missed"
]);

export const rehearsalUtteranceOutcomeSchema = z
  .object({
    slideId: deckSlideIdSchema,
    kind: rehearsalUtteranceOutcomeKindSchema,
    sentenceId: z.string().trim().min(1).optional(),
    text: z.string().trim().min(1).max(600).optional(),
    similarity: z.number().min(-1).max(1).optional(),
    lexicalOverlap: z.number().min(0).max(1).optional(),
    at: isoDateTimeSchema.optional()
  })
  .strict();

export const rehearsalRunMetaSchema = z
  .object({
    slideTimeline: z
      .array(
        z
          .object({
            slideId: deckSlideIdSchema,
            enteredAt: isoDateTimeSchema
          })
          .strict()
      )
      .default([]),
    missedKeywords: z
      .array(
        z
          .object({
            slideId: deckSlideIdSchema,
            keywordId: deckKeywordIdSchema
          })
          .strict()
      )
      .default([]),
    adviceEvents: z
      .array(
        z
          .object({
            type: z.string().trim().min(1),
            at: isoDateTimeSchema
          })
          .strict()
      )
      .default([]),
    utteranceOutcomes: z
      .array(rehearsalUtteranceOutcomeSchema)
      .default([]),
    semanticCueDecisions: z
      .array(rehearsalSemanticCueDecisionSchema)
      .default([])
  })
  // Run meta stores bounded report facts only. It may include approved ad-lib
  // snippets, but must not accept full transcript, speaker notes, or raw audio.
  .strict();

export const updateRehearsalRunMetaRequestSchema = rehearsalRunMetaSchema;

export const updateRehearsalRunMetaResponseSchema = z.object({
  run: rehearsalRunSchema
});

export const getRehearsalRunResponseSchema = z.object({
  run: rehearsalRunSchema
});

export const getRehearsalReportResponseSchema = z.object({
  run: rehearsalRunSchema,
  report: rehearsalReportSchema.nullable()
});

export type RehearsalRunStatus = z.infer<typeof rehearsalRunStatusSchema>;
export type RehearsalRunError = z.infer<typeof rehearsalRunErrorSchema>;
export type RehearsalRun = z.infer<typeof rehearsalRunSchema>;
export type RehearsalReportMetrics = z.infer<typeof rehearsalReportMetricsSchema>;
export type RehearsalReportAiSummary = z.infer<typeof rehearsalReportAiSummarySchema>;
export type RehearsalReportCoaching = z.infer<typeof rehearsalReportCoachingSchema>;
export type RehearsalReportSlideTiming = z.infer<
  typeof rehearsalReportSlideTimingSchema
>;
export type RehearsalReportQnaSummary = z.infer<typeof rehearsalReportQnaSummarySchema>;
export type RehearsalReport = z.infer<typeof rehearsalReportSchema>;
export type RehearsalSemanticCueDecision = z.infer<
  typeof rehearsalSemanticCueDecisionSchema
>;
export type CreateRehearsalRunRequest = z.infer<typeof createRehearsalRunRequestSchema>;
export type CreateRehearsalRunResponse = z.infer<typeof createRehearsalRunResponseSchema>;
export type CreateRehearsalAudioUploadUrlRequest = z.infer<
  typeof createRehearsalAudioUploadUrlRequestSchema
>;
export type CreateRehearsalAudioUploadUrlResponse = z.infer<
  typeof createRehearsalAudioUploadUrlResponseSchema
>;
export type CompleteRehearsalAudioUploadUrlRequest = z.infer<
  typeof completeRehearsalAudioUploadUrlRequestSchema
>;
export type CompleteRehearsalAudioUploadRequest = z.infer<
  typeof completeRehearsalAudioUploadRequestSchema
>;
export type CompleteRehearsalAudioChunkUploadRequest = z.infer<
  typeof completeRehearsalAudioChunkUploadRequestSchema
>;
export type CompleteRehearsalAudioUploadResponse = z.infer<
  typeof completeRehearsalAudioUploadResponseSchema
>;
export type BeginRehearsalAudioUploadRequest = z.infer<
  typeof beginRehearsalAudioUploadRequestSchema
>;
export type UploadRehearsalAudioChunkParams = z.infer<
  typeof uploadRehearsalAudioChunkParamsSchema
>;
export type RehearsalRunMeta = z.infer<typeof rehearsalRunMetaSchema>;
export type RehearsalUtteranceOutcome = z.infer<
  typeof rehearsalUtteranceOutcomeSchema
>;
export type RehearsalUtteranceOutcomeKind = z.infer<
  typeof rehearsalUtteranceOutcomeKindSchema
>;
export type UpdateRehearsalRunMetaRequest = z.infer<
  typeof updateRehearsalRunMetaRequestSchema
>;
export type UpdateRehearsalRunMetaResponse = z.infer<
  typeof updateRehearsalRunMetaResponseSchema
>;
export type GetRehearsalReportResponse = z.infer<typeof getRehearsalReportResponseSchema>;

export const runDurationPointSchema = z.object({
  runId: z.string().min(1),
  createdAt: isoDateTimeSchema,
  durationSeconds: z.number().nonnegative()
});

export const slideAvgTimingSchema = z.object({
  slideId: deckSlideIdSchema,
  avgSeconds: z.number().nonnegative(),
  sampleCount: z.number().int().nonnegative()
});

export const rehearsalProjectSummarySchema = z.object({
  projectId: z.string().min(1),
  runCount: z.number().int().nonnegative(),
  runDurationSeries: z.array(runDurationPointSchema).default([]),
  slideAvgTimings: z.array(slideAvgTimingSchema).default([]),
  progressComment: z.string().nullable()
});

export const getRehearsalProjectSummaryResponseSchema = z.object({
  summary: rehearsalProjectSummarySchema.nullable()
});

export type RunDurationPoint = z.infer<typeof runDurationPointSchema>;
export type SlideAvgTiming = z.infer<typeof slideAvgTimingSchema>;
export type RehearsalProjectSummary = z.infer<typeof rehearsalProjectSummarySchema>;
export type GetRehearsalProjectSummaryResponse = z.infer<typeof getRehearsalProjectSummaryResponseSchema>;
