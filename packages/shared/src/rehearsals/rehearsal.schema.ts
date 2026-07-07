import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  allowedRehearsalAudioMimeTypes,
  assetUploadUrlResponseSchema
} from "../files/file.schema";
import { jobSchema } from "../jobs/job.schema";
import { deckKeywordIdSchema, deckSlideIdSchema } from "../deck/id.schema";
import { keywordRoleSchema } from "../deck/deck.schema";

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
    text: z.string().trim().min(1),
    keywordRole: keywordRoleSchema.default("required-message")
  })
  .strict();

export const rehearsalReportSlideTimingSchema = z
  .object({
    slideId: deckSlideIdSchema,
    targetSeconds: z.number().nonnegative(),
    actualSeconds: z.number().nonnegative()
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

export const rehearsalReportCoachingSchema = z.object({
  status: z.literal("succeeded"),
  summary: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  nextPracticeFocus: z.string().default(""),
  message: z.string().default("")
});

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
    slideTimings: z.array(rehearsalReportSlideTimingSchema).default([]),
    qnaSummary: rehearsalReportQnaSummarySchema.default({
      questionCount: 0,
      questionSummary: "",
      unclearTopics: []
    }),
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

export const rehearsalRunMetaSchema = z
  .object({
    endedAt: isoDateTimeSchema.optional(),
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
      .default([])
  })
  // run 메타는 리포트 집계를 위한 사건 정보만 받고 전사/대본/원본 오디오는 받지 않는다.
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

export const getRehearsalSummaryQuerySchema = z.object({
  deckId: z.string().min(1),
  currentRunId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).default(10)
});

export const rehearsalSummaryRunSchema = z
  .object({
    runId: z.string().min(1),
    generatedAt: isoDateTimeSchema,
    durationSeconds: z.number().nonnegative(),
    missedKeywordCount: z.number().int().nonnegative(),
    slideTimingCount: z.number().int().nonnegative()
  })
  .strict();

export const rehearsalSummaryRepeatedKeywordSchema = z
  .object({
    slideId: deckSlideIdSchema,
    keywordId: deckKeywordIdSchema,
    text: z.string().trim().min(1),
    keywordRole: keywordRoleSchema.default("required-message"),
    missCount: z.number().int().nonnegative()
  })
  .strict();

export const rehearsalSummarySlideSchema = z
  .object({
    slideId: deckSlideIdSchema,
    sampleCount: z.number().int().nonnegative(),
    averageActualSeconds: z.number().nonnegative().nullable(),
    currentActualSeconds: z.number().nonnegative().nullable(),
    deltaFromAverageSeconds: z.number().nullable(),
    repeatedMissedKeywords: z.array(rehearsalSummaryRepeatedKeywordSchema).default([])
  })
  .strict();

export const rehearsalSummarySchema = z
  .object({
    projectId: z.string().min(1),
    deckId: z.string().min(1),
    currentRunId: z.string().min(1).nullable(),
    runCount: z.number().int().nonnegative(),
    runs: z.array(rehearsalSummaryRunSchema).default([]),
    slides: z.array(rehearsalSummarySlideSchema).default([])
  })
  .strict();

export const getRehearsalSummaryResponseSchema = z.object({
  summary: rehearsalSummarySchema
});

export type RehearsalRunStatus = z.infer<typeof rehearsalRunStatusSchema>;
export type RehearsalRunError = z.infer<typeof rehearsalRunErrorSchema>;
export type RehearsalRun = z.infer<typeof rehearsalRunSchema>;
export type RehearsalReportMetrics = z.infer<typeof rehearsalReportMetricsSchema>;
export type RehearsalReportCoaching = z.infer<typeof rehearsalReportCoachingSchema>;
export type RehearsalReportSlideTiming = z.infer<
  typeof rehearsalReportSlideTimingSchema
>;
export type RehearsalReportQnaSummary = z.infer<typeof rehearsalReportQnaSummarySchema>;
export type RehearsalReport = z.infer<typeof rehearsalReportSchema>;
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
export type UpdateRehearsalRunMetaRequest = z.infer<
  typeof updateRehearsalRunMetaRequestSchema
>;
export type UpdateRehearsalRunMetaResponse = z.infer<
  typeof updateRehearsalRunMetaResponseSchema
>;
export type GetRehearsalReportResponse = z.infer<typeof getRehearsalReportResponseSchema>;
export type GetRehearsalSummaryQuery = z.infer<typeof getRehearsalSummaryQuerySchema>;
export type RehearsalSummary = z.infer<typeof rehearsalSummarySchema>;
export type GetRehearsalSummaryResponse = z.infer<typeof getRehearsalSummaryResponseSchema>;
