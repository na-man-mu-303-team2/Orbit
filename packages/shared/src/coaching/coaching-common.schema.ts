import { z } from "zod";

export const coachingIdSchema = z.string().trim().min(1).max(128);
export const clientRequestIdSchema = z.string().trim().min(8).max(128);

export const evaluatorLensRefSchema = z
  .object({
    lensId: z.enum(["general-novice", "decision-maker", "strict-reviewer"]),
    revision: z.literal(1),
  })
  .strict();

export const briefRefSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generic") }).strict(),
  z
    .object({
      mode: z.literal("briefed"),
      briefId: coachingIdSchema,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);

export const frozenBriefRefSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generic") }).strict(),
  z
    .object({
      mode: z.literal("briefed"),
      briefId: coachingIdSchema,
      revision: z.number().int().positive(),
    })
    .strict(),
]);

export const criterionRefSchema = z
  .object({
    criterionId: coachingIdSchema,
    revision: z.number().int().positive(),
  })
  .strict();

export const focusedPracticeTargetScopeSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("slide"),
        scopeId: coachingIdSchema,
        slideId: coachingIdSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("sentence"),
        scopeId: coachingIdSchema,
        slideId: coachingIdSchema,
        sentenceIndex: z.number().int().nonnegative(),
        textSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/i),
      })
      .strict(),
    z
      .object({
        type: z.literal("slide-range"),
        scopeId: coachingIdSchema,
        startSlideId: coachingIdSchema,
        endSlideId: coachingIdSchema,
      })
      .strict(),
    z
      .object({ type: z.literal("opening"), scopeId: coachingIdSchema })
      .strict(),
    z
      .object({ type: z.literal("closing"), scopeId: coachingIdSchema })
      .strict(),
  ])
  .superRefine((scope, context) => {
    if (
      scope.type === "slide-range" &&
      scope.startSlideId === scope.endSlideId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "slide-range must include at least two distinct slides.",
        path: ["endSlideId"],
      });
    }
  });

export const boundedObservationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("duration-seconds"),
      value: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("count"),
      metric: z.enum(["filler-word-count", "long-silence-count"]),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic"),
      value: z.enum(["covered", "partial", "missed", "contradicted"]),
    })
    .strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export const boundedThresholdSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("max-duration-seconds"),
      value: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("max-count"),
      metric: z.enum(["filler-word-count", "long-silence-count"]),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic-required"),
      minimum: z.enum(["partial", "covered"]),
    })
    .strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export const cleanupStateSchema = z.enum([
  "not-required",
  "pending",
  "deleted",
  "exhausted",
]);

export const coachingErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "PROJECT_ACCESS_DENIED",
  "SOURCE_NOT_FOUND",
  "SOURCE_NOT_READY",
  "SOURCE_INCOMPATIBLE",
  "REVISION_CONFLICT",
  "IDEMPOTENCY_KEY_REUSED",
  "INVALID_STATE_TRANSITION",
  "ATTEMPT_ALREADY_ACTIVE",
  "CANCELLED_BY_USER",
  "UPLOAD_EXPIRED",
  "AUDIO_TOO_LONG",
  "TRANSCRIPTION_FAILED",
  "ANALYSIS_FAILED",
  "QNA_GENERATION_FAILED",
  "REFERENCE_GROUNDING_FAILED",
  "REFERENCE_IN_USE",
  "RAW_AUDIO_RETENTION_EXPIRED",
  "RAW_AUDIO_DELETE_FAILED",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type EvaluatorLensRef = z.infer<typeof evaluatorLensRefSchema>;
export type BriefRef = z.infer<typeof briefRefSchema>;
export type FrozenBriefRef = z.infer<typeof frozenBriefRefSchema>;
export type CriterionRef = z.infer<typeof criterionRefSchema>;
export type FocusedPracticeTargetScope = z.infer<
  typeof focusedPracticeTargetScopeSchema
>;
export type BoundedObservation = z.infer<typeof boundedObservationSchema>;
export type BoundedThreshold = z.infer<typeof boundedThresholdSchema>;
export type CleanupState = z.infer<typeof cleanupStateSchema>;
export type CoachingErrorCode = z.infer<typeof coachingErrorCodeSchema>;
