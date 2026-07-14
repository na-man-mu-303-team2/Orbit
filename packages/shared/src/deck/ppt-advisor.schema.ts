import { z } from "zod";

import {
  generateDeckMediaPolicySchema,
  generateDeckReferencePolicySchema,
} from "./generate-deck.schema";

export const pptAdvisorHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1_000),
});

export const pptAdvisorBriefSchema = z.object({
  topic: z.string().trim().max(500).default(""),
  purpose: z.string().trim().max(1_000).default(""),
  presentationContext: z.string().trim().max(1_000).default(""),
  audienceText: z.string().trim().max(1_000).default(""),
  presentationType: z.string().trim().max(500).default(""),
  successCriteria: z.string().trim().max(1_000).default(""),
  duration: z.number().int().min(1).max(120),
  slides: z.number().int().min(1).max(20).optional(),
  tone: z.enum(["professional", "friendly", "confident", "concise"]),
});

export const pptAdvisorDesignSchema = z.object({
  colorMood: z.string().trim().max(1_000).default(""),
  fontMood: z.string().trim().max(1_000).default(""),
  mediaPolicy: generateDeckMediaPolicySchema,
  referencePolicy: generateDeckReferencePolicySchema,
});

export const pptAdvisorRequestSchema = z.object({
  question: z.string().trim().min(1).max(1_000),
  brief: pptAdvisorBriefSchema,
  design: pptAdvisorDesignSchema,
  history: z.array(pptAdvisorHistoryItemSchema).max(6).default([]),
});

const suggestionMetadataSchema = z.object({
  label: z.string().trim().min(1).max(300),
  reason: z.string().trim().min(1).max(500),
});

export const pptAdvisorSuggestionSchema = z.discriminatedUnion("field", [
  suggestionMetadataSchema.extend({
    field: z.literal("duration"),
    value: z.number().int().min(1).max(120),
  }),
  suggestionMetadataSchema.extend({
    field: z.literal("slides"),
    value: z.number().int().min(1).max(20),
  }),
  suggestionMetadataSchema.extend({
    field: z.literal("tone"),
    value: z.enum(["professional", "friendly", "confident", "concise"]),
  }),
  suggestionMetadataSchema.extend({
    field: z.literal("colorMood"),
    value: z.string().trim().min(1).max(500),
  }),
  suggestionMetadataSchema.extend({
    field: z.literal("fontMood"),
    value: z.string().trim().min(1).max(500),
  }),
  suggestionMetadataSchema.extend({
    field: z.literal("mediaPolicy"),
    value: generateDeckMediaPolicySchema,
  }),
  suggestionMetadataSchema.extend({
    field: z.literal("referencePolicy"),
    value: generateDeckReferencePolicySchema,
  }),
]);

export const pptAdvisorResponseSchema = z.object({
  answer: z.string().trim().min(1).max(2_000),
  suggestions: z.array(pptAdvisorSuggestionSchema).max(3).default([]),
});

export type PptAdvisorHistoryItem = z.infer<typeof pptAdvisorHistoryItemSchema>;
export type PptAdvisorRequest = z.infer<typeof pptAdvisorRequestSchema>;
export type PptAdvisorSuggestion = z.infer<typeof pptAdvisorSuggestionSchema>;
export type PptAdvisorResponse = z.infer<typeof pptAdvisorResponseSchema>;
