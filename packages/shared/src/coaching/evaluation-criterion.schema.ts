import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  coachingIdSchema,
  criterionRefSchema,
} from "./coaching-common.schema";

export const criterionScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run") }).strict(),
  z
    .object({ type: z.literal("slide"), slideId: coachingIdSchema })
    .strict(),
  z
    .object({
      type: z.literal("slide-range"),
      startSlideId: coachingIdSchema,
      endSlideId: coachingIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("time-window"),
      window: z.enum(["opening", "closing"]),
    })
    .strict(),
]);

export const criterionMeasurementSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("semantic-coverage"),
      expectedConceptIds: z.array(coachingIdSchema).min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("max-duration-seconds"),
      maximum: z.number().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("max-count"),
      metric: z.enum(["filler-word-count", "pause-count"]),
      maximum: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const evaluationCriterionSchema = z
  .object({
    criterionId: coachingIdSchema,
    revision: z.number().int().positive(),
    category: z.enum(["structure", "semantic", "timing", "delivery"]),
    source: z.enum(["brief", "lens", "deck-cue", "system"]),
    scope: criterionScopeSchema,
    label: z.string().trim().min(1).max(160),
    measurement: criterionMeasurementSchema,
  })
  .strict();

export const measurementStateSchema = z.enum(["measured", "unmeasured"]);

export const criterionEvaluationStatusSchema = z.enum([
  "passed",
  "partial",
  "failed",
  "not-evaluated",
]);

export const reportObservationValueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("duration-seconds"),
      value: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("count"),
      metric: z.enum(["filler-word-count", "pause-count"]),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("words-per-minute"),
      value: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rate"),
      metric: z.enum([
        "keyword-coverage",
        "semantic-coverage",
        "timing-balance",
        "volume-consistency",
        "pronunciation-confidence",
      ]),
      value: z.number().min(0).max(1),
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

const reportObservationTimeRangeRefSchema = z
  .object({
    kind: z.literal("time-range"),
    slideId: coachingIdSchema.optional(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => value.endMs >= value.startMs, {
    message: "observation time range must not end before it starts.",
    path: ["endMs"],
  });

export const reportObservationEvidenceRefSchema = z.union([
  reportObservationTimeRangeRefSchema,
  z
    .object({
      kind: z.literal("semantic-cue"),
      slideId: coachingIdSchema,
      cueId: coachingIdSchema,
      cueRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("issue"),
      issueId: coachingIdSchema,
      slideId: coachingIdSchema.optional(),
    })
    .strict(),
]);

export const reportObservationSchema = z
  .object({
    observationId: coachingIdSchema,
    criterionRef: criterionRefSchema,
    scope: criterionScopeSchema,
    measurementState: measurementStateSchema,
    value: reportObservationValueSchema,
    evidenceRefs: z.array(reportObservationEvidenceRefSchema).max(20),
    observedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((observation, context) => {
    const hasMeasuredValue = observation.value.kind !== "none";
    if ((observation.measurementState === "measured") !== hasMeasuredValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "measured observations require a value and unmeasured observations require none.",
        path: ["value"],
      });
    }
  });

export const criterionResultReasonCodeSchema = z.enum([
  "PASSED",
  "PARTIAL",
  "THRESHOLD_EXCEEDED",
  "CONCEPT_MISSED",
  "NO_MEASUREMENT",
  "NOT_APPLICABLE",
  "SOURCE_INCOMPARABLE",
  "EVALUATION_UNAVAILABLE",
]);

export const criterionResultSchema = z
  .object({
    criterionRef: criterionRefSchema,
    category: z.enum(["structure", "semantic", "timing", "delivery"]),
    scope: criterionScopeSchema,
    measurementState: measurementStateSchema,
    evaluationStatus: criterionEvaluationStatusSchema,
    observationId: coachingIdSchema.nullable(),
    reasonCode: criterionResultReasonCodeSchema,
    evaluatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((result, context) => {
    const isMeasured = result.measurementState === "measured";
    if (isMeasured === (result.evaluationStatus === "not-evaluated")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "measured results require an evaluation and unmeasured results must be not-evaluated.",
        path: ["evaluationStatus"],
      });
    }
    if (isMeasured !== (result.observationId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "measured results require an observation reference and unmeasured results must omit it.",
        path: ["observationId"],
      });
    }

    const allowedReasonsByStatus = {
      passed: ["PASSED"],
      partial: ["PARTIAL"],
      failed: ["THRESHOLD_EXCEEDED", "CONCEPT_MISSED"],
      "not-evaluated": [
        "NO_MEASUREMENT",
        "NOT_APPLICABLE",
        "SOURCE_INCOMPARABLE",
        "EVALUATION_UNAVAILABLE",
      ],
    } as const;
    if (!(allowedReasonsByStatus[result.evaluationStatus] as readonly string[]).includes(result.reasonCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "criterion result reason must match its evaluation status.",
        path: ["reasonCode"],
      });
    }
  });

export { criterionRefSchema };

export type CriterionScope = z.infer<typeof criterionScopeSchema>;
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;
export type MeasurementState = z.infer<typeof measurementStateSchema>;
export type CriterionEvaluationStatus = z.infer<
  typeof criterionEvaluationStatusSchema
>;
export type ReportObservation = z.infer<typeof reportObservationSchema>;
export type CriterionResult = z.infer<typeof criterionResultSchema>;
