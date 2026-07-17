import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckSlideIdSchema } from "../deck/id.schema";
import { activityDefinitionSchema } from "./activity-definition.schema";
import {
  activityIdSchema,
  activityOptionIdSchema,
  activityQuestionIdSchema,
  activityResponseIdSchema,
  activityRunIdSchema
} from "./activity-id.schema";

export const activityRuntimeStatusSchema = z.enum([
  "draft",
  "open",
  "closed",
  "results"
]);

export const activityTextModerationStatusSchema = z.enum([
  "pending",
  "approved",
  "hidden"
]);

export const activityRunSchema = z
  .object({
    activityRunId: activityRunIdSchema,
    presentationSessionId: z.string().trim().min(1),
    activityId: activityIdSchema,
    sourceSlideId: deckSlideIdSchema,
    version: z.number().int().positive(),
    supersedesActivityRunId: activityRunIdSchema.nullable(),
    definitionSnapshot: activityDefinitionSchema,
    definitionFingerprint: z.string().trim().min(8).max(128),
    status: activityRuntimeStatusSchema,
    revision: z.number().int().nonnegative(),
    isCurrent: z.boolean(),
    responseCount: z.number().int().nonnegative(),
    openedAt: isoDateTimeSchema.nullable(),
    closedAt: isoDateTimeSchema.nullable(),
    revealedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const ratingActivityAnswerSchema = z
  .object({
    questionId: activityQuestionIdSchema,
    type: z.literal("rating"),
    value: z.number().int().min(1).max(5)
  })
  .strict();

export const singleChoiceActivityAnswerSchema = z
  .object({
    questionId: activityQuestionIdSchema,
    type: z.literal("single-choice"),
    optionId: activityOptionIdSchema
  })
  .strict();

export const multipleChoiceActivityAnswerSchema = z
  .object({
    questionId: activityQuestionIdSchema,
    type: z.literal("multiple-choice"),
    optionIds: z.array(activityOptionIdSchema).min(1).max(8)
  })
  .strict()
  .superRefine((answer, ctx) => {
    if (new Set(answer.optionIds).size !== answer.optionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["optionIds"],
        message: "selected option IDs must be unique"
      });
    }
  });

export const freeTextActivityAnswerSchema = z
  .object({
    questionId: activityQuestionIdSchema,
    type: z.literal("free-text"),
    text: z.string().trim().min(1).max(2000)
  })
  .strict();

export const activityAnswerSchema = z.union([
  ratingActivityAnswerSchema,
  singleChoiceActivityAnswerSchema,
  multipleChoiceActivityAnswerSchema,
  freeTextActivityAnswerSchema
]);

export const activityResponseSchema = z
  .object({
    responseId: activityResponseIdSchema,
    activityRunId: activityRunIdSchema,
    answers: z.array(activityAnswerSchema).min(1).max(5),
    displayName: z.string().trim().min(1).max(40).nullable(),
    revision: z.number().int().positive(),
    submittedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((response, ctx) => {
    const questionIds = new Set<string>();
    response.answers.forEach((answer, index) => {
      if (questionIds.has(answer.questionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answers", index, "questionId"],
          message: "a response can contain one answer per question"
        });
      }
      questionIds.add(answer.questionId);
    });
  });

export type ActivityRuntimeStatus = z.infer<
  typeof activityRuntimeStatusSchema
>;
export type ActivityTextModerationStatus = z.infer<
  typeof activityTextModerationStatusSchema
>;
export type ActivityRun = z.infer<typeof activityRunSchema>;
export type ActivityAnswer = z.infer<typeof activityAnswerSchema>;
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
