import { z } from "zod";

import {
  cleanupStateSchema,
  coachingIdSchema,
} from "./coaching-common.schema";

const coachingJobIdentityShape = {
  jobId: coachingIdSchema,
  projectId: coachingIdSchema,
} as const;

export const focusedPracticeAnalysisJobPayloadSchema = z
  .object({ ...coachingJobIdentityShape, attemptId: coachingIdSchema })
  .strict();
export const focusedPracticeAnalysisJobResultSchema = z
  .object({
    attemptId: coachingIdSchema,
    result: z.enum(["passed", "needs-retry", "unmeasured"]),
  })
  .strict();

export const slidePracticeAnalysisJobPayloadSchema = z
  .object({ ...coachingJobIdentityShape, analysisId: coachingIdSchema })
  .strict();
export const slidePracticeAnalysisJobResultSchema = z
  .object({
    analysisId: coachingIdSchema,
    reportId: coachingIdSchema,
  })
  .strict();

export const challengeQnaGenerationJobPayloadSchema = z
  .object({
    ...coachingJobIdentityShape,
    qnaSessionId: coachingIdSchema,
    generationRevision: z.number().int().positive(),
  })
  .strict();
export const challengeQnaGenerationJobResultSchema = z
  .object({
    qnaSessionId: coachingIdSchema,
    generationRevision: z.number().int().positive(),
    questionCount: z.union([z.literal(1), z.literal(3)]),
  })
  .strict();

export const challengeQnaAnswerAnalysisJobPayloadSchema = z
  .object({ ...coachingJobIdentityShape, answerAttemptId: coachingIdSchema })
  .strict();
export const challengeQnaAnswerAnalysisJobResultSchema = z
  .object({
    answerAttemptId: coachingIdSchema,
    measuredConceptCount: z.number().int().nonnegative().max(8),
  })
  .strict();

export const privateAudioCleanupJobPayloadSchema = z
  .object({
    ...coachingJobIdentityShape,
    fileId: coachingIdSchema,
    subjectType: z.enum([
      "rehearsal-run",
      "focused-practice-attempt",
      "challenge-qna-answer-attempt",
    ]),
    subjectId: coachingIdSchema,
    reason: z.enum(["terminal-delete-retry", "pending-upload-expiry"]),
    cleanupGeneration: z.number().int().positive(),
  })
  .strict();
export const privateAudioCleanupJobResultSchema = z
  .object({
    fileId: coachingIdSchema,
    cleanupState: cleanupStateSchema.refine(
      (state) => state === "deleted" || state === "not-required",
      "cleanup jobs only succeed with deleted or not-required.",
    ),
  })
  .strict();

export type FocusedPracticeAnalysisJobPayload = z.infer<
  typeof focusedPracticeAnalysisJobPayloadSchema
>;
export type SlidePracticeAnalysisJobPayload = z.infer<
  typeof slidePracticeAnalysisJobPayloadSchema
>;
export type ChallengeQnaGenerationJobPayload = z.infer<
  typeof challengeQnaGenerationJobPayloadSchema
>;
export type ChallengeQnaAnswerAnalysisJobPayload = z.infer<
  typeof challengeQnaAnswerAnalysisJobPayloadSchema
>;
export type PrivateAudioCleanupJobPayload = z.infer<
  typeof privateAudioCleanupJobPayloadSchema
>;
