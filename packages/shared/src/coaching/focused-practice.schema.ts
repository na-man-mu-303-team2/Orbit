import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { allowedRehearsalAudioMimeTypes } from "../files/file.schema";
import {
  boundedObservationSchema,
  boundedThresholdSchema,
  cleanupStateSchema,
  clientRequestIdSchema,
  coachingErrorCodeSchema,
  coachingIdSchema,
  criterionRefSchema,
  evaluatorLensRefSchema,
  focusedPracticeTargetScopeSchema,
  frozenBriefRefSchema,
} from "./coaching-common.schema";

export { focusedPracticeTargetScopeSchema };

export const focusedPracticeSessionStatusSchema = z.enum([
  "active",
  "completed",
  "cancelled",
]);
export const focusedPracticeAttemptStatusSchema = z.enum([
  "created",
  "uploading",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);

export const focusedPracticeGoalOutcomeSchema = z
  .object({
    goalId: coachingIdSchema,
    criterionRef: criterionRefSchema,
    measurementState: z.enum(["measured", "unmeasured"]),
    outcome: z.enum(["passed", "failed", "unmeasured"]),
    observation: boundedObservationSchema,
    threshold: boundedThresholdSchema,
    reasonCode: z.enum([
      "PASSED",
      "THRESHOLD_EXCEEDED",
      "CONCEPT_MISSED",
      "TRANSCRIPT_INCOMPLETE",
      "EVALUATION_UNAVAILABLE",
    ]),
  })
  .strict();

export const focusedPracticeSnapshotSchema = z
  .object({
    deckVersion: z.number().int().positive(),
    briefRef: frozenBriefRefSchema,
    evaluatorLensRef: evaluatorLensRefSchema,
    criterionRefs: z.array(criterionRefSchema).min(1).max(3),
  })
  .strict();

export const focusedPracticeSessionSchema = z
  .object({
    practiceSessionId: coachingIdSchema,
    projectId: coachingIdSchema,
    deckId: coachingIdSchema,
    sourceFullRunId: coachingIdSchema,
    sourceGoalSetId: coachingIdSchema,
    goalIds: z.array(coachingIdSchema).min(1).max(3),
    targetScope: focusedPracticeTargetScopeSchema,
    snapshot: focusedPracticeSnapshotSchema,
    compatibilityState: z.enum(["current", "stale"]),
    status: focusedPracticeSessionStatusSchema,
    dataOrigin: z.enum(["live", "fixture"]),
    createdBy: coachingIdSchema,
    createdAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((session, context) => {
    if (new Set(session.goalIds).size !== session.goalIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "focused practice goals must be unique.",
        path: ["goalIds"],
      });
    }
  });

export const focusedPracticeSlideTimelineEntrySchema = z
  .object({
    slideId: coachingIdSchema,
    enteredAtMs: z.number().int().nonnegative().max(300_000),
    exitedAtMs: z.number().int().nonnegative().max(300_000).nullable(),
  })
  .strict()
  .refine(
    (entry) => entry.exitedAtMs === null || entry.exitedAtMs >= entry.enteredAtMs,
    { message: "slide exit must not precede entry.", path: ["exitedAtMs"] },
  );

export const focusedPracticeSlideTimelineSchema = z
  .array(focusedPracticeSlideTimelineEntrySchema)
  .max(3)
  .superRefine((timeline, context) => {
    timeline.slice(0, -1).forEach((entry, index) => {
      if (entry.exitedAtMs === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "only the final slide timeline entry may have no exit.",
          path: [index, "exitedAtMs"],
        });
      }
    });
    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1];
      const current = timeline[index];
      if (
        previous?.exitedAtMs !== null &&
        previous?.exitedAtMs !== undefined &&
        current &&
        current.enteredAtMs < previous.exitedAtMs
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "slide timeline entries must be ordered without overlap.",
          path: [index, "enteredAtMs"],
        });
      }
    }
  });

export const focusedPracticeAttemptSchema = z
  .object({
    attemptId: coachingIdSchema,
    projectId: coachingIdSchema,
    practiceSessionId: coachingIdSchema,
    attemptNumber: z.number().int().positive(),
    status: focusedPracticeAttemptStatusSchema,
    result: z.enum(["passed", "needs-retry", "unmeasured"]).nullable(),
    audioFileId: coachingIdSchema.nullable(),
    analysisJobId: coachingIdSchema.nullable(),
    cleanupState: cleanupStateSchema,
    cleanupGeneration: z.number().int().positive(),
    rawAudioDeletedAt: isoDateTimeSchema.nullable(),
    rawAudioDeleteDeadlineAt: isoDateTimeSchema,
    durationMs: z.number().int().min(1).max(300_000).nullable(),
    slideTimeline: focusedPracticeSlideTimelineSchema,
    goalOutcomes: z.array(focusedPracticeGoalOutcomeSchema).max(3),
    errorCode: coachingErrorCodeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const createFocusedPracticeSessionRequestSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    sourceFullRunId: coachingIdSchema,
    sourceGoalSetId: coachingIdSchema,
    goalIds: z.array(coachingIdSchema).min(1).max(3),
    targetScope: focusedPracticeTargetScopeSchema,
  })
  .strict();

export const createFocusedPracticeAttemptRequestSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    mimeType: z.enum(allowedRehearsalAudioMimeTypes),
    size: z.number().int().positive(),
  })
  .strict();

export const completeFocusedPracticeAudioRequestSchema = z
  .object({
    fileId: coachingIdSchema,
    durationMs: z.number().int().min(1).max(300_000),
    slideTimeline: focusedPracticeSlideTimelineSchema,
  })
  .strict();

export type FocusedPracticeSessionStatus = z.infer<
  typeof focusedPracticeSessionStatusSchema
>;
export type FocusedPracticeAttemptStatus = z.infer<
  typeof focusedPracticeAttemptStatusSchema
>;
export type FocusedPracticeGoalOutcome = z.infer<
  typeof focusedPracticeGoalOutcomeSchema
>;
export type FocusedPracticeSession = z.infer<typeof focusedPracticeSessionSchema>;
export type FocusedPracticeAttempt = z.infer<typeof focusedPracticeAttemptSchema>;
export type CreateFocusedPracticeSessionRequest = z.infer<
  typeof createFocusedPracticeSessionRequestSchema
>;

