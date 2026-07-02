import { z } from "zod";

import {
  deckAnimationIdSchema,
  deckKeywordIdSchema,
  deckSlideIdSchema
} from "../deck/id.schema";

export const liveSttEventTypeSchema = z.enum([
  "partial-transcript",
  "keyword-detected",
  "keyword-missing",
  "animation-cue",
  "slide-advance"
]);

const keywordCoverageSchema = z.number().finite().min(0).max(1);
export const liveSttAnimationCueSchema = z.enum([
  "emphasis",
  "animation-trigger"
]);
export const liveSttSlideAdvanceReasonSchema = z.enum([
  "script-progress",
  "voice-command"
]);

export const liveSttPartialTranscriptEventSchema = z.object({
  type: z.literal("partial-transcript"),
  transcript: z.string(),
  isFinal: z.boolean().default(false),
  confidence: z.number().finite().min(0).max(1).nullable().default(null)
});

export const liveSttKeywordDetectedEventSchema = z.object({
  type: z.literal("keyword-detected"),
  slideId: deckSlideIdSchema,
  keywordId: deckKeywordIdSchema,
  text: z.string().min(1),
  matchedText: z.string().min(1),
  coverage: keywordCoverageSchema
});

export const liveSttKeywordMissingEventSchema = z.object({
  type: z.literal("keyword-missing"),
  slideId: deckSlideIdSchema,
  missingKeywordIds: z.array(deckKeywordIdSchema),
  coverage: keywordCoverageSchema
});

export const liveSttAnimationCueEventSchema = z.object({
  type: z.literal("animation-cue"),
  slideId: deckSlideIdSchema,
  keywordId: z.union([deckKeywordIdSchema, z.literal("command-emphasis")]),
  cue: liveSttAnimationCueSchema,
  animationId: deckAnimationIdSchema.nullable().default(null),
  text: z.string().min(1)
});

export const liveSttSlideAdvanceEventSchema = z.object({
  type: z.literal("slide-advance"),
  fromSlideId: deckSlideIdSchema,
  toSlideId: deckSlideIdSchema,
  reason: liveSttSlideAdvanceReasonSchema,
  coverage: keywordCoverageSchema
});

export const liveSttEventSchema = z.discriminatedUnion("type", [
  liveSttPartialTranscriptEventSchema,
  liveSttKeywordDetectedEventSchema,
  liveSttKeywordMissingEventSchema,
  liveSttAnimationCueEventSchema,
  liveSttSlideAdvanceEventSchema
]);

export type LiveSttEventType = z.infer<typeof liveSttEventTypeSchema>;
export type LiveSttPartialTranscriptEvent = z.infer<
  typeof liveSttPartialTranscriptEventSchema
>;
export type LiveSttKeywordDetectedEvent = z.infer<
  typeof liveSttKeywordDetectedEventSchema
>;
export type LiveSttKeywordMissingEvent = z.infer<
  typeof liveSttKeywordMissingEventSchema
>;
export type LiveSttAnimationCue = z.infer<typeof liveSttAnimationCueSchema>;
export type LiveSttAnimationCueEvent = z.infer<
  typeof liveSttAnimationCueEventSchema
>;
export type LiveSttSlideAdvanceReason = z.infer<
  typeof liveSttSlideAdvanceReasonSchema
>;
export type LiveSttSlideAdvanceEvent = z.infer<
  typeof liveSttSlideAdvanceEventSchema
>;
export type LiveSttEvent = z.infer<typeof liveSttEventSchema>;
