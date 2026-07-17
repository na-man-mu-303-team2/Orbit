import { z } from "zod";

const activityDomainId = (prefix: string) =>
  z.string().trim().regex(
    new RegExp(`^${prefix}[A-Za-z0-9_-]+$`),
    `ID must start with ${prefix}`
  );

export const activityIdSchema = activityDomainId("activity_");
export const activityQuestionIdSchema = activityDomainId("question_");
export const activityOptionIdSchema = activityDomainId("option_");
export const activityRunIdSchema = activityDomainId("activity_run_");
export const activityResponseIdSchema = activityDomainId("activity_response_");
export const activityTextEntryIdSchema = activityDomainId("activity_text_");

export type ActivityId = z.infer<typeof activityIdSchema>;
export type ActivityQuestionId = z.infer<typeof activityQuestionIdSchema>;
export type ActivityOptionId = z.infer<typeof activityOptionIdSchema>;
export type ActivityRunId = z.infer<typeof activityRunIdSchema>;
export type ActivityResponseId = z.infer<typeof activityResponseIdSchema>;
export type ActivityTextEntryId = z.infer<typeof activityTextEntryIdSchema>;
