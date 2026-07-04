import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  audienceFeatureSettingsSchema,
  audienceRealtimeStateSchema,
  audienceStateResponseSchema,
  audienceSafePayloadSchema,
  audiencePublicSessionSchema,
  audienceParticipantSchema,
  audienceIdSchema,
} from "../audience/audience.schema";
import {
  deckElementIdSchema,
  deckIdSchema,
  deckSlideIdSchema,
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
  "audience:join",
  "audience:state",
  "audience:slide-state",
  "audience:effect-state",
  "audience:feature-settings",
  "audience:interaction-active",
  "audience:interaction-results",
  "audience:question-updated",
  "audience:private-answer",
  "audience:reaction",
  "audience:session-ended",
  "audience:survey-opened",
]);

export const websocketEventSchema = z.object({
  type: websocketEventTypeSchema,
  roomId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  userId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  sentAt: isoDateTimeSchema,
});

export const slideChangedPayloadSchema = z.object({
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  slideIndex: z.number().int().nonnegative(),
});

export const highlightChangedPayloadSchema = z.object({
  slideId: deckSlideIdSchema,
  elementId: deckElementIdSchema,
  state: z.enum(["active", "inactive"]),
});

export const audienceRoomIdSchema = z.union([
  z.string().regex(/^presentation:[^:]+:audience$/),
  z.string().regex(/^presentation:[^:]+:presenter$/),
  z.string().regex(/^presentation:[^:]+:audience:[^:]+$/),
]);

export const audienceJoinPayloadSchema = z
  .object({
    session: audiencePublicSessionSchema,
    participant: audienceParticipantSchema,
  })
  .strict();

export const audienceStatePayloadSchema = audienceStateResponseSchema;

export const audienceSlideStatePayloadSchema = z
  .object({
    state: audienceRealtimeStateSchema,
  })
  .strict();

export const audienceEffectStatePayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    slideId: deckSlideIdSchema.nullable(),
    effectState: audienceSafePayloadSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const audienceFeatureSettingsPayloadSchema = z
  .object({
    features: audienceFeatureSettingsSchema,
  })
  .strict();

export const audiencePrivateRoomPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    audienceId: audienceIdSchema,
  })
  .strict();

export type WebsocketEvent = z.infer<typeof websocketEventSchema>;
export type WebsocketEventType = z.infer<typeof websocketEventTypeSchema>;
export type SlideChangedPayload = z.infer<typeof slideChangedPayloadSchema>;
export type HighlightChangedPayload = z.infer<
  typeof highlightChangedPayloadSchema
>;
export type AudienceRoomId = z.infer<typeof audienceRoomIdSchema>;
export type AudienceJoinPayload = z.infer<typeof audienceJoinPayloadSchema>;
export type AudienceStatePayload = z.infer<typeof audienceStatePayloadSchema>;
export type AudienceSlideStatePayload = z.infer<
  typeof audienceSlideStatePayloadSchema
>;
export type AudienceEffectStatePayload = z.infer<
  typeof audienceEffectStatePayloadSchema
>;
export type AudienceFeatureSettingsPayload = z.infer<
  typeof audienceFeatureSettingsPayloadSchema
>;
export type AudiencePrivateRoomPayload = z.infer<
  typeof audiencePrivateRoomPayloadSchema
>;
