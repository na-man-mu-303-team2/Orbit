import { z } from "zod";

export const rehearsalVolumeAnalysisReasonCodeSchema = z.enum([
  "AUDIO_DECODE_FAILED",
  "NO_AUDIO_STREAM",
  "EMPTY_AUDIO",
  "INSUFFICIENT_ACTIVE_AUDIO",
  "ANALYSIS_FAILED",
  "LEGACY_REPORT"
]);

export const rehearsalVolumeIssueSegmentSchema = z
  .object({
    kind: z.enum(["quiet", "loud"]),
    startSeconds: z.number().finite().nonnegative(),
    endSeconds: z.number().finite().nonnegative(),
    durationSeconds: z.number().finite().positive(),
    meanDeviationDb: z.number().finite()
  })
  .strict()
  .superRefine((segment, context) => {
    const expectedDuration = segment.endSeconds - segment.startSeconds;
    if (
      expectedDuration <= 0 ||
      Math.abs(segment.durationSeconds - expectedDuration) > 0.002
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "volume issue duration must match its time range.",
        path: ["durationSeconds"]
      });
    }
  });

export const rehearsalVolumeAnalysisSchema = z
  .object({
    metricDefinitionVersion: z.literal(1),
    measurementState: z.enum(["measured", "unmeasured"]),
    reasonCode: rehearsalVolumeAnalysisReasonCodeSchema.nullable(),
    averageDbfs: z.number().finite().nullable(),
    baselineDbfs: z.number().finite().nullable(),
    variationDb: z.number().finite().nonnegative().nullable(),
    activeRatio: z.number().finite().min(0).max(1).nullable(),
    issueSegments: z.array(rehearsalVolumeIssueSegmentSchema).max(100)
  })
  .strict()
  .superRefine((analysis, context) => {
    const metricValues = [
      analysis.averageDbfs,
      analysis.baselineDbfs,
      analysis.variationDb,
      analysis.activeRatio
    ];
    if (
      analysis.measurementState === "measured" &&
      (analysis.reasonCode !== null || metricValues.some((value) => value === null))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "measured volume analysis requires all metric values.",
        path: ["measurementState"]
      });
    }
    if (
      analysis.measurementState === "unmeasured" &&
      (analysis.reasonCode === null ||
        metricValues.some((value) => value !== null) ||
        analysis.issueSegments.length > 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unmeasured volume analysis requires a reason only.",
        path: ["measurementState"]
      });
    }
  });

export const legacyRehearsalVolumeAnalysis = {
  metricDefinitionVersion: 1 as const,
  measurementState: "unmeasured" as const,
  reasonCode: "LEGACY_REPORT" as const,
  averageDbfs: null,
  baselineDbfs: null,
  variationDb: null,
  activeRatio: null,
  issueSegments: []
};

export const audioTranscribeSegmentSchema = z
  .object({
    text: z.string(),
    startSeconds: z.number().finite().nonnegative().nullable().optional(),
    endSeconds: z.number().finite().nonnegative().nullable().optional()
  })
  .strict();

export const audioTranscribeResponseSchema = z
  .object({
    runId: z.string().min(1),
    projectId: z.string().min(1),
    fileId: z.string().min(1),
    transcript: z.string(),
    language: z.string(),
    provider: z.string(),
    model: z.string(),
    durationSeconds: z.number().finite().nonnegative().nullable().optional(),
    segments: z.array(audioTranscribeSegmentSchema)
  })
  .strict();

export const rehearsalAudioProcessingResponseSchema =
  audioTranscribeResponseSchema.extend({
    volumeAnalysis: rehearsalVolumeAnalysisSchema
  });

export type RehearsalVolumeAnalysis = z.infer<
  typeof rehearsalVolumeAnalysisSchema
>;
export type RehearsalVolumeIssueSegment = z.infer<
  typeof rehearsalVolumeIssueSegmentSchema
>;
export type AudioTranscribeResponse = z.infer<typeof audioTranscribeResponseSchema>;
export type RehearsalAudioProcessingResponse = z.infer<
  typeof rehearsalAudioProcessingResponseSchema
>;
