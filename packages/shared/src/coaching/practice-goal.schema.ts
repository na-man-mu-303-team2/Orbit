import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  boundedObservationSchema,
  coachingIdSchema,
  criterionRefSchema,
  focusedPracticeTargetScopeSchema,
} from "./coaching-common.schema";

export const practiceGoalEvidenceRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("semantic-cue"),
      slideId: coachingIdSchema,
      cueId: coachingIdSchema,
      outcome: z.enum(["missed", "not_covered", "contradicted"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("slide-timing"),
      slideId: coachingIdSchema,
      targetSeconds: z.number().nonnegative(),
      actualSeconds: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("delivery-count"),
      slideId: coachingIdSchema.optional(),
      metric: z.enum(["filler-word-count", "pause-count"]),
      count: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("structure"),
      criterionId: coachingIdSchema,
      outcome: z.enum(["partial", "missed"]),
    })
    .strict(),
]);

const practiceGoalShape = {
    goalId: coachingIdSchema,
    goalSetId: coachingIdSchema,
    projectId: coachingIdSchema,
    originFullRunId: coachingIdSchema,
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    patternKey: z.string().regex(/^[a-f0-9]{64}$/i),
    category: z.enum(["semantic", "timing", "delivery", "structure"]),
    criterionRef: criterionRefSchema,
    targetScope: focusedPracticeTargetScopeSchema.nullable(),
    recommendedPracticeMode: z.enum(["focused", "full-run-only"]),
    evidenceRefs: z.array(practiceGoalEvidenceRefSchema).max(20),
    problemLabel: z.string().trim().min(1).max(240),
    nextAction: z.string().trim().min(1).max(240),
    successCondition: z.string().trim().min(1).max(240),
    measurementState: z.enum(["measured", "unmeasured"]),
    createdAt: isoDateTimeSchema,
} as const;

function validatePracticeGoal(
  goal: { recommendedPracticeMode: "focused" | "full-run-only"; targetScope: unknown },
  context: z.RefinementCtx,
) {
  if (
    (goal.recommendedPracticeMode === "focused") !==
    (goal.targetScope !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "focused goals require a target scope and full-run-only goals must not have one.",
      path: ["targetScope"],
    });
  }
}

export const practiceGoalSchema = z
  .object(practiceGoalShape)
  .strict()
  .superRefine(validatePracticeGoal);

export const practiceGoalSetSchema = z
  .object({
    goalSetId: coachingIdSchema,
    projectId: coachingIdSchema,
    sourceFullRunId: coachingIdSchema,
    revision: z.number().int().positive(),
    sourceAnalysisRevision: z.number().int().positive(),
    isCurrent: z.boolean(),
    analysisState: z.enum(["partial", "final"]),
    dataOrigin: z.enum(["live", "fixture"]),
    derivationVersion: z.literal(1),
    goals: z.array(practiceGoalSchema).max(3),
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((set, context) => {
    const priorities = set.goals.map((goal) => goal.priority);
    const patternKeys = set.goals.map((goal) => goal.patternKey);
    if (new Set(priorities).size !== priorities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "goal priorities must be unique.",
        path: ["goals"],
      });
    }
    if (new Set(patternKeys).size !== patternKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "goal pattern keys must be unique.",
        path: ["goals"],
      });
    }
    set.goals.forEach((goal, index) => {
      if (goal.goalSetId !== set.goalSetId || goal.projectId !== set.projectId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "goal identity must belong to its containing set.",
          path: ["goals", index],
        });
      }
    });
  });

export const practiceGoalResolutionSchema = z
  .object({
    resolutionId: coachingIdSchema,
    goalId: coachingIdSchema,
    originFullRunId: coachingIdSchema,
    evaluatedFullRunId: coachingIdSchema,
    criterionRef: criterionRefSchema,
    status: z.enum(["resolved", "repeated", "unmeasured", "incomparable"]),
    measurementState: z.enum(["measured", "unmeasured"]),
    observation: boundedObservationSchema,
    reasonCode: z.enum([
      "PASSED",
      "FAILED",
      "NO_MEASUREMENT",
      "DECK_CHANGED",
      "BRIEF_CHANGED",
      "CRITERION_CHANGED",
      "SCOPE_CHANGED",
    ]),
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();

export const practiceGoalHistorySchema = z
  .object({
    label: z.enum([
      "current",
      "last-run",
      "recent-twice",
      "persistent",
      "improving",
      "regressed",
    ]),
    occurrenceCount: z.number().int().nonnegative(),
    comparableRunCount: z.number().int().nonnegative().max(5),
    lastSeenAt: isoDateTimeSchema,
  })
  .strict();

export const practicePlanGoalSchema = z
  .object({
    ...practiceGoalShape,
    history: practiceGoalHistorySchema,
    canStartFocusedPractice: z.boolean(),
    unavailableReason: z
      .enum(["SOURCE_STALE", "UNMEASURED", "FULL_RUN_ONLY"])
      .nullable(),
  })
  .strict()
  .superRefine(validatePracticeGoal);

const readyPracticePlanResponseSchema = z
  .object({
    status: z.literal("ready"),
    sourceFullRunId: coachingIdSchema,
    goalSet: practiceGoalSetSchema,
    goals: z.array(practicePlanGoalSchema).max(3),
    fullRehearsalCta: z
      .object({
        projectId: coachingIdSchema,
        sourceGoalSetId: coachingIdSchema,
      })
      .strict(),
  })
  .strict();

export const practicePlanResponseSchema = z.discriminatedUnion("status", [
  readyPracticePlanResponseSchema,
  z.object({ status: z.literal("processing"), sourceFullRunId: coachingIdSchema }).strict(),
  z.object({ status: z.literal("no-goal"), sourceFullRunId: coachingIdSchema }).strict(),
  z
    .object({
      status: z.literal("stale"),
      sourceFullRunId: coachingIdSchema,
      reason: z.enum(["SOURCE_STALE", "SOURCE_INCOMPATIBLE"]),
    })
    .strict(),
  z
    .object({
      status: z.literal("error"),
      sourceFullRunId: coachingIdSchema,
      code: z.enum(["SOURCE_NOT_FOUND", "SOURCE_FAILED", "INTERNAL_ERROR"]),
    })
    .strict(),
]);

export type PracticeGoal = z.infer<typeof practiceGoalSchema>;
export type PracticeGoalSet = z.infer<typeof practiceGoalSetSchema>;
export type PracticeGoalResolution = z.infer<
  typeof practiceGoalResolutionSchema
>;
export type PracticePlanResponse = z.infer<typeof practicePlanResponseSchema>;
