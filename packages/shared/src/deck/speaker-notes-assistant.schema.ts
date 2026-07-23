import { z } from "zod";

import { jobSchema } from "../jobs/job.schema";
import { deckIdSchema, deckSlideIdSchema } from "./id.schema";

export const speakerNotesSuggestionModeSchema = z.enum([
  "draft",
  "shorten",
  "naturalize",
  "emphasize",
  "icebreaker"
]);

export const speakerNotesSuggestionRequestSchema = z
  .object({
    deckId: deckIdSchema,
    slideId: deckSlideIdSchema,
    baseVersion: z.number().int().positive(),
    mode: speakerNotesSuggestionModeSchema
  })
  .strict();

export const speakerNotesSuggestionJobPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    request: speakerNotesSuggestionRequestSchema
  })
  .strict();

export const speakerNotesSuggestionProviderRequestSchema = z
  .object({
    mode: speakerNotesSuggestionModeSchema,
    slideTitle: z.string().trim().max(500),
    slideContent: z.array(z.string().trim().min(1).max(2_000)).max(40),
    currentNotes: z.string().max(20_000),
    targetSpeakerNotesChars: z.number().int().nonnegative().optional(),
    charsPerMinute: z.number().int().positive().optional()
  })
  .strict();

export const speakerNotesSuggestionProviderResultSchema = z
  .object({
    suggestedNotes: z.string().trim().min(1).max(20_000),
    summary: z.string().trim().min(1).max(500),
    warnings: z.array(z.string().trim().min(1).max(500)).max(10).default([])
  })
  .strict();

export const speakerNotesSuggestionResultSchema = z
  .object({
    slideId: deckSlideIdSchema,
    baseVersion: z.number().int().positive(),
    mode: speakerNotesSuggestionModeSchema,
    suggestedNotes: z.string().trim().min(1).max(20_000),
    summary: z.string().trim().min(1).max(500),
    warnings: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
    metrics: z
      .object({
        characterCount: z.number().int().nonnegative(),
        estimatedSeconds: z.number().int().nonnegative().optional()
      })
      .strict()
  })
  .strict();

export const createSpeakerNotesSuggestionJobResponseSchema = z
  .object({ job: jobSchema })
  .strict();

export type SpeakerNotesSuggestionMode = z.infer<
  typeof speakerNotesSuggestionModeSchema
>;
export type SpeakerNotesSuggestionRequest = z.infer<
  typeof speakerNotesSuggestionRequestSchema
>;
export type SpeakerNotesSuggestionJobPayload = z.infer<
  typeof speakerNotesSuggestionJobPayloadSchema
>;
export type SpeakerNotesSuggestionProviderRequest = z.infer<
  typeof speakerNotesSuggestionProviderRequestSchema
>;
export type SpeakerNotesSuggestionProviderResult = z.infer<
  typeof speakerNotesSuggestionProviderResultSchema
>;
export type SpeakerNotesSuggestionResult = z.infer<
  typeof speakerNotesSuggestionResultSchema
>;
export type CreateSpeakerNotesSuggestionJobResponse = z.infer<
  typeof createSpeakerNotesSuggestionJobResponseSchema
>;
