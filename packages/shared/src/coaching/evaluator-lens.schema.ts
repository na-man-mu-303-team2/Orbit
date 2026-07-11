import { z } from "zod";

import {
  coachingIdSchema,
  evaluatorLensRefSchema,
  frozenBriefRefSchema,
} from "./coaching-common.schema";
import { evaluationCriterionSchema } from "./evaluation-criterion.schema";
import { approvedReferenceSnapshotRefSchema } from "./presentation-brief.schema";

const criterionCategorySchema = z.enum([
  "structure",
  "semantic",
  "timing",
  "delivery",
]);

export const evaluatorLensDefinitionSchema = z
  .object({
    ref: evaluatorLensRefSchema,
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
    priorityOrder: z.array(criterionCategorySchema).length(4),
  })
  .strict()
  .superRefine((lens, context) => {
    if (new Set(lens.priorityOrder).size !== lens.priorityOrder.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lens priorityOrder must contain each category once.",
        path: ["priorityOrder"],
      });
    }
  });

export const evaluatorLensRegistryResponseSchema = z
  .object({
    lenses: z.array(evaluatorLensDefinitionSchema).length(3),
  })
  .strict();

export const rehearsalEvaluationPlanSchema = z
  .object({
    planVersion: z.literal(1),
    briefRef: frozenBriefRefSchema,
    evaluatorLensRef: evaluatorLensRefSchema,
    targetDurationSeconds: z.number().int().positive(),
    criteria: z.array(evaluationCriterionSchema).max(100),
    metricDefinitionVersions: z
      .object({
        timing: z.literal(1),
        filler: z.literal(1),
        pause: z.literal(1),
        semantic: z.literal(1),
      })
      .strict(),
    approvedReferences: z.array(approvedReferenceSnapshotRefSchema).max(10),
    practiceGoalSetRef: z
      .object({
        goalSetId: coachingIdSchema,
        revision: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type EvaluatorLensDefinition = z.infer<
  typeof evaluatorLensDefinitionSchema
>;
export type RehearsalEvaluationPlan = z.infer<
  typeof rehearsalEvaluationPlanSchema
>;

