import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  activityIdSchema,
  activityRunIdSchema
} from "../activity/activity-id.schema";
import { activityPublicResultSchema } from "../activity/activity-results.schema";
import { activityRuntimeStatusSchema } from "../activity/activity-runtime.schema";
import {
  deckElementIdSchema,
  deckIdSchema,
  deckSlideIdSchema
} from "../deck/id.schema";

export const websocketEventTypeSchema = z.enum([
  "project-joined",
  "project-presence",
  "deck-updated",
  "slide-changed",
  "highlight-changed",
  "presentation-started",
  "audience-joined",
  "question-created",
  "poll-voted",
  "survey-submitted",
  "active-activity-changed",
  "activity-state-changed",
  "activity-results-updated"
]);

export const websocketEventSchema = z.object({
  type: websocketEventTypeSchema,
  roomId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  userId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  sentAt: isoDateTimeSchema
});

export const slideChangedPayloadSchema = z.object({
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  slideIndex: z.number().int().nonnegative()
});

export const highlightChangedPayloadSchema = z.object({
  slideId: deckSlideIdSchema,
  elementId: deckElementIdSchema,
  state: z.enum(["active", "inactive"])
});

export const activeActivityChangedPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    activityId: activityIdSchema,
    activityRunId: activityRunIdSchema,
    revision: z.number().int().nonnegative()
  })
  .strict();

export const activityStateChangedPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    activityId: activityIdSchema,
    activityRunId: activityRunIdSchema,
    status: activityRuntimeStatusSchema,
    revision: z.number().int().nonnegative()
  })
  .strict();

export const activityResultsUpdatedPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    activityRunId: activityRunIdSchema,
    revision: z.number().int().nonnegative(),
    refetch: z.boolean(),
    publicResult: activityPublicResultSchema.optional()
  })
  .strict();

const presentationEventEnvelopeShape = {
  roomId: z.string().min(1),
  sessionId: z.string().min(1),
  userId: z.literal("system"),
  sentAt: isoDateTimeSchema
};

export const activeActivityChangedEventSchema = z
  .object({
    ...presentationEventEnvelopeShape,
    type: z.literal("active-activity-changed"),
    payload: activeActivityChangedPayloadSchema
  })
  .strict();

export const activityStateChangedEventSchema = z
  .object({
    ...presentationEventEnvelopeShape,
    type: z.literal("activity-state-changed"),
    payload: activityStateChangedPayloadSchema
  })
  .strict();

export const activityResultsUpdatedEventSchema = z
  .object({
    ...presentationEventEnvelopeShape,
    type: z.literal("activity-results-updated"),
    payload: activityResultsUpdatedPayloadSchema
  })
  .strict();

export const presentationActivityEventSchema = z.discriminatedUnion("type", [
  activeActivityChangedEventSchema,
  activityStateChangedEventSchema,
  activityResultsUpdatedEventSchema
]);

export type WebsocketEvent = z.infer<typeof websocketEventSchema>;
export type WebsocketEventType = z.infer<typeof websocketEventTypeSchema>;
export type SlideChangedPayload = z.infer<typeof slideChangedPayloadSchema>;
export type HighlightChangedPayload = z.infer<
  typeof highlightChangedPayloadSchema
>;
export type ActiveActivityChangedPayload = z.infer<
  typeof activeActivityChangedPayloadSchema
>;
export type ActivityStateChangedPayload = z.infer<
  typeof activityStateChangedPayloadSchema
>;
export type ActivityResultsUpdatedPayload = z.infer<
  typeof activityResultsUpdatedPayloadSchema
>;
export type PresentationActivityEvent = z.infer<
  typeof presentationActivityEventSchema
>;
