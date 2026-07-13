import { z } from "zod";

import { coachingIdSchema } from "./coaching-common.schema";

export const rehearsalAnalyzeTranscriptSegmentSchema = z
  .object({
    text: z.string(),
    startSeconds: z.number().finite().nonnegative().nullable().optional(),
    endSeconds: z.number().finite().nonnegative().nullable().optional(),
  })
  .strict();

export const rehearsalAnalyzeDeckKeywordSchema = z
  .object({
    keywordId: coachingIdSchema,
    slideId: coachingIdSchema,
    text: z.string().trim().min(1),
    synonyms: z.array(z.string()),
    abbreviations: z.array(z.string()),
    required: z.boolean(),
  })
  .strict();

export const rehearsalAnalyzeSlideTimelineEntrySchema = z
  .object({
    slideId: coachingIdSchema,
    enteredSecond: z.number().finite().nonnegative(),
  })
  .strict();

export const rehearsalAnalyzeRequestSchema = z
  .object({
    runId: coachingIdSchema,
    projectId: coachingIdSchema,
    deckId: coachingIdSchema,
    transcript: z.string(),
    durationSeconds: z.number().finite().nonnegative(),
    segments: z.array(rehearsalAnalyzeTranscriptSegmentSchema),
    deckKeywords: z.array(rehearsalAnalyzeDeckKeywordSchema),
    slideTimeline: z.array(rehearsalAnalyzeSlideTimelineEntrySchema),
  })
  .strict();

export type RehearsalAnalyzeRequest = z.infer<
  typeof rehearsalAnalyzeRequestSchema
>;
