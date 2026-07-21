import { z } from "zod";

import { fillerTranscriptionModeSchema, liveSttEngineSchema } from "./runtime";

export const runtimeConfigResponseSchema = z
  .object({
    liveSttEngine: liveSttEngineSchema,
    fillerTranscriptionMode: fillerTranscriptionModeSchema.default("mini"),
    adaptiveRehearsalCoachEnabled: z.boolean(),
    focusedPracticeEnabled: z.boolean(),
    challengeQnaEnabled: z.boolean(),
    slidePracticeEnabled: z.boolean(),
    slideQuestionGuidesEnabled: z.boolean(),
  })
  .strict();

export type RuntimeConfigResponse = z.infer<typeof runtimeConfigResponseSchema>;

export const coachingCapabilitiesResponseSchema = z.object({
  adaptiveRehearsalCoachEnabled: z.boolean(),
  focusedPracticeEnabled: z.boolean(),
  challengeQnaEnabled: z.boolean(),
}).strict();
export type CoachingCapabilitiesResponse = z.infer<typeof coachingCapabilitiesResponseSchema>;
