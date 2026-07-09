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
