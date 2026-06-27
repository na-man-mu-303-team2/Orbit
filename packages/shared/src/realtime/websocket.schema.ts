import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const websocketEventTypeSchema = z.enum([
  "project-joined",
  "deck-updated",
  "slide-changed",
  "highlight-changed",
  "presentation-started",
  "audience-joined",
  "question-created",
  "poll-voted",
  "survey-submitted"
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
  deckId: z.string().min(1),
  slideId: z.string().min(1),
  slideIndex: z.number().int().nonnegative()
});

export const highlightChangedPayloadSchema = z.object({
  slideId: z.string().min(1),
  elementId: z.string().min(1),
  state: z.enum(["active", "inactive"])
});

export type WebsocketEvent = z.infer<typeof websocketEventSchema>;
export type WebsocketEventType = z.infer<typeof websocketEventTypeSchema>;
export type SlideChangedPayload = z.infer<typeof slideChangedPayloadSchema>;
export type HighlightChangedPayload = z.infer<
  typeof highlightChangedPayloadSchema
>;
