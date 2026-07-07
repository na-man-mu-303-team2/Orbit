import { z } from "zod";

export const liveSttEventTypeSchema = z.enum([
  "partial-transcript",
  "keyword-detected",
  "keyword-missing",
  "animation-cue",
  "slide-advance"
]);

const keywordCoverageSchema = z.number().finite().min(0).max(1);

export const liveSttPartialTranscriptEventSchema = z.object({
  type: z.literal("partial-transcript"),
  transcript: z.string(),
  isFinal: z.boolean().default(false),
  confidence: z.number().finite().min(0).max(1).nullable().default(null)
});

export const liveSttKeywordDetectedEventSchema = z.object({
  type: z.literal("keyword-detected"),
  slideId: z.string().min(1),
  keywordId: z.string().min(1),
  occurrenceId: z.string().min(1).optional(),
  text: z.string().min(1),
  matchedText: z.string().min(1),
  coverage: keywordCoverageSchema
});

export const liveSttKeywordMissingEventSchema = z.object({
  type: z.literal("keyword-missing"),
  slideId: z.string().min(1),
  missingKeywordIds: z.array(z.string().min(1)),
  coverage: keywordCoverageSchema
});

export const liveSttAnimationCueEventSchema = z.object({
  type: z.literal("animation-cue"),
  slideId: z.string().min(1),
  keywordId: z.string().min(1),
  occurrenceId: z.string().min(1).optional(),
  cue: z.literal("emphasis"),
  text: z.string().min(1)
});

export const liveSttSlideAdvanceEventSchema = z.object({
  type: z.literal("slide-advance"),
  fromSlideId: z.string().min(1),
  toSlideId: z.string().min(1),
  reason: z.literal("keyword-coverage"),
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
export type LiveSttAnimationCueEvent = z.infer<
  typeof liveSttAnimationCueEventSchema
>;
export type LiveSttSlideAdvanceEvent = z.infer<
  typeof liveSttSlideAdvanceEventSchema
>;
export type LiveSttEvent = z.infer<typeof liveSttEventSchema>;
