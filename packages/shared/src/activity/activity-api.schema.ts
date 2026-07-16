import { z } from "zod";

import { activityIdSchema, activityRunIdSchema } from "./activity-id.schema";
import { activityPresenterResultSchema, activityPublicResultSchema } from "./activity-results.schema";
import {
  activityAnswerSchema,
  activityResponseSchema,
  activityRunSchema,
  activityRuntimeStatusSchema,
  activityTextModerationStatusSchema
} from "./activity-runtime.schema";

export const ensureActivityRunRequestSchema = z.object({}).strict();

export const ensureActivityRunResponseSchema = z
  .object({ run: activityRunSchema })
  .strict();

export const updateActivityRunStatusRequestSchema = z
  .object({
    status: activityRuntimeStatusSchema,
    expectedRevision: z.number().int().nonnegative()
  })
  .strict();

export const updateActivityRunStatusResponseSchema = z
  .object({ run: activityRunSchema })
  .strict();

export const supersedeActivityRunRequestSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();

export const supersedeActivityRunResponseSchema = z
  .object({ previousRunId: activityRunIdSchema, run: activityRunSchema })
  .strict();

export const upsertActivityResponseRequestSchema = z
  .object({
    clientMutationId: z.string().trim().min(1).max(128),
    answers: z.array(activityAnswerSchema).min(1).max(5),
    displayName: z.string().trim().min(1).max(40).nullable().optional()
  })
  .strict();

export const upsertActivityResponseResponseSchema = z
  .object({ response: activityResponseSchema, runRevision: z.number().int().nonnegative() })
  .strict();

export const moderateActivityTextRequestSchema = z
  .object({
    moderationStatus: activityTextModerationStatusSchema.optional(),
    answered: z.boolean().optional(),
    expectedRevision: z.number().int().nonnegative()
  })
  .strict()
  .refine(
    (request) =>
      request.moderationStatus !== undefined || request.answered !== undefined,
    { message: "moderationStatus or answered is required" }
  );

export const getActivityPresenterResultResponseSchema = z
  .object({ result: activityPresenterResultSchema })
  .strict();

export const getActivityPublicResultResponseSchema = z
  .object({ result: activityPublicResultSchema.nullable() })
  .strict();

export const getAudienceActivityResponseSchema = z
  .object({
    activityId: activityIdSchema,
    run: activityRunSchema,
    ownResponse: activityResponseSchema.nullable(),
    publicResult: activityPublicResultSchema.nullable()
  })
  .strict();

export type UpdateActivityRunStatusRequest = z.infer<
  typeof updateActivityRunStatusRequestSchema
>;
export type SupersedeActivityRunRequest = z.infer<
  typeof supersedeActivityRunRequestSchema
>;
export type UpsertActivityResponseRequest = z.infer<
  typeof upsertActivityResponseRequestSchema
>;
export type ModerateActivityTextRequest = z.infer<
  typeof moderateActivityTextRequestSchema
>;
