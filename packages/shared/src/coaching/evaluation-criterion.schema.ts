import { z } from "zod";

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

export { criterionRefSchema };

export type CriterionScope = z.infer<typeof criterionScopeSchema>;
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;

