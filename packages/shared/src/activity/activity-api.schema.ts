import { z } from "zod";

import { activityIdSchema, activityRunIdSchema } from "./activity-id.schema";
import { activityPresenterResultSchema, activityPublicResultSchema } from "./activity-results.schema";
import { presentationSessionSchema } from "../presentation/presentation.schema";
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

export const getCurrentActivityRunResponseSchema = z
  .object({ run: activityRunSchema.nullable() })
  .strict();

export const activitySessionResultAvailabilitySchema = z.enum([
  "raw-retained",
  "aggregate-only",
  "results-deleted"
]);

export const activitySessionResultItemSchema = z
  .object({
    availability: activitySessionResultAvailabilitySchema,
    result: activityPresenterResultSchema.nullable(),
    run: activityRunSchema
  })
  .strict();

export const getPresentationSessionResultsResponseSchema = z
  .object({
    activities: z.array(activitySessionResultItemSchema),
    session: presentationSessionSchema,
    sessionName: z.string().trim().min(1).max(120)
  })
  .strict();

export const deletePresentationSessionResultsRequestSchema = z
  .object({ confirmation: z.string().trim().min(1).max(120) })
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

export const moderateActivityTextResponseSchema = z
  .object({ result: activityPresenterResultSchema })
  .strict();

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

export const getAudienceActiveActivityResponseSchema = z
  .object({ activity: getAudienceActivityResponseSchema.nullable() })
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
export type GetAudienceActivityResponse = z.infer<
  typeof getAudienceActivityResponseSchema
>;
export type GetAudienceActiveActivityResponse = z.infer<
  typeof getAudienceActiveActivityResponseSchema
>;
export type ActivitySessionResultAvailability = z.infer<
  typeof activitySessionResultAvailabilitySchema
>;
export type ActivitySessionResultItem = z.infer<
  typeof activitySessionResultItemSchema
>;
export type GetPresentationSessionResultsResponse = z.infer<
  typeof getPresentationSessionResultsResponseSchema
>;
export type DeletePresentationSessionResultsRequest = z.infer<
  typeof deletePresentationSessionResultsRequestSchema
>;
