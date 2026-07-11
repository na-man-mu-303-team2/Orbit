import { z } from "zod";

import {
  deckActionIdSchema,
  deckElementIdSchema,
  deckSemanticCueIdSchema,
  deckSlideIdSchema
} from "./id.schema";

const semanticCueTextSchema = z.string().trim().min(1);

const compactStringArraySchema = z
  .array(semanticCueTextSchema)
  .transform((values) => dedupeStrings(values));

export const semanticCuePrioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3)
]);

export const semanticCueImportanceSchema = z.enum([
  "core",
  "supporting",
  "optional"
]);

export const semanticCueReviewStatusSchema = z.enum([
  "suggested",
  "approved",
  "excluded"
]);

export const semanticCueFreshnessSchema = z.enum(["current", "stale"]);

export const semanticCueOriginSchema = z.enum(["ai", "manual", "imported"]);

export const semanticCueTypeSchema = z.enum([
  "definition",
  "problem",
  "cause",
  "solution",
  "result",
  "warning",
  "lesson",
  "transition",
  "closing"
]);

export const semanticCueSourceRefSchema = z
  .object({
    kind: z.enum([
      "slide-title",
      "speaker-notes",
      "element",
      "table",
      "chart",
      "image-analysis"
    ]),
    refId: z.string().trim().min(1).max(120).optional(),
    sourceHash: z.string().trim().min(8).max(128)
  })
  .strict();

export const semanticCueAliasesSchema = z
  .record(compactStringArraySchema)
  .transform((aliases) => {
    const compactAliases: Record<string, string[]> = {};

    for (const [key, values] of Object.entries(aliases)) {
      const trimmedKey = key.trim();
      if (trimmedKey && values.length > 0) {
        compactAliases[trimmedKey] = values;
      }
    }

    return compactAliases;
  });

export const semanticCueSchema = z
  .object({
    cueId: deckSemanticCueIdSchema,
    slideId: deckSlideIdSchema,
    meaning: semanticCueTextSchema.max(240),
    reportLabel: semanticCueTextSchema.max(80).optional(),
    presenterTag: semanticCueTextSchema.max(40).optional(),
    cueType: semanticCueTypeSchema.optional(),
    importance: semanticCueImportanceSchema.default("supporting"),
    reviewStatus: semanticCueReviewStatusSchema.default("suggested"),
    freshness: semanticCueFreshnessSchema.default("current"),
    origin: semanticCueOriginSchema.default("imported"),
    revision: z.number().int().positive().default(1),
    sourceDeckVersion: z.number().int().positive().optional(),
    sourceFingerprint: z.string().trim().min(8).max(128).optional(),
    sourceRefs: z.array(semanticCueSourceRefSchema).max(16).default([]),
    qualityWarnings: z
      .array(semanticCueTextSchema.max(80))
      .max(12)
      .default([]),
    required: z.boolean().default(true),
    priority: semanticCuePrioritySchema.default(2),
    candidateKeywords: compactStringArraySchema.default([]),
    aliases: semanticCueAliasesSchema.default({}),
    requiredConcepts: compactStringArraySchema.default([]),
    nliHypotheses: compactStringArraySchema.pipe(
      z.array(semanticCueTextSchema.max(300)).min(1).max(3)
    ),
    negativeHints: compactStringArraySchema.default([]),
    targetElementIds: z.array(deckElementIdSchema).default([]),
    triggerActionIds: z.array(deckActionIdSchema).default([])
  })
  .strict();

export type SemanticCuePriority = z.infer<typeof semanticCuePrioritySchema>;
export type SemanticCueImportance = z.infer<typeof semanticCueImportanceSchema>;
export type SemanticCueReviewStatus = z.infer<
  typeof semanticCueReviewStatusSchema
>;
export type SemanticCueFreshness = z.infer<typeof semanticCueFreshnessSchema>;
export type SemanticCueOrigin = z.infer<typeof semanticCueOriginSchema>;
export type SemanticCueType = z.infer<typeof semanticCueTypeSchema>;
export type SemanticCueSourceRef = z.infer<typeof semanticCueSourceRefSchema>;
export type SemanticCue = z.infer<typeof semanticCueSchema>;

function dedupeStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase("ko-KR");

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}
