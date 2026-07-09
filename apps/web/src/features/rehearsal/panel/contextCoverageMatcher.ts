import { CONTEXT_MATCH_THRESHOLD } from "@orbit/shared";

import {
  calculateWordMultisetRecall,
  matchPhraseCandidate,
  type PhraseMatchMethod,
} from "../speech/speechMatcher";
import { normalizeLiveTranscriptText } from "../stt/liveTranscriptText";

export const CONTEXT_DICE_MATCH_THRESHOLD = 0.78;
export const CONTEXT_WORD_RECALL_THRESHOLD = 0.5;
export const CONTEXT_SEMANTIC_MATCH_THRESHOLD = 0.84;
export const CONTEXT_SEMANTIC_WORD_RECALL_THRESHOLD = 0.2;
export const CONTEXT_MATCH_MIN_WORDS = 4;
export const CONTEXT_MATCH_MAX_WINDOWS = 12;

export function buildContextMatchCandidateWindows(transcriptWindow: string) {
  const normalized = transcriptWindow
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const candidates = new Set<string>([normalized]);
  for (let index = 1; index < tokens.length; index += 1) {
    const remaining = tokens.length - index;
    if (remaining < CONTEXT_MATCH_MIN_WORDS) {
      continue;
    }

    candidates.add(tokens.slice(index).join(" "));
    if (candidates.size >= CONTEXT_MATCH_MAX_WINDOWS) {
      break;
    }
  }

  return Array.from(candidates);
}

export type ContextItemCoverageEvaluation = {
  lexicalOverlap: number;
  matched: boolean;
  method: PhraseMatchMethod | "semantic";
  semanticSimilarity: number;
  strength: number;
};

export function evaluateContextItemCoverage(input: {
  itemSentence: string;
  transcriptWindow: string;
  semanticSimilarity: number;
}): ContextItemCoverageEvaluation {
  const normalizedSentence = normalizeLiveTranscriptText(input.itemSentence);
  const normalizedTranscript = normalizeLiveTranscriptText(input.transcriptWindow);

  if (!normalizedSentence || normalizedTranscript.length < 4) {
    return {
      lexicalOverlap: 0,
      matched: false,
      method: "none",
      semanticSimilarity: input.semanticSimilarity,
      strength: 0,
    };
  }

  const phraseMatch = matchPhraseCandidate({
    candidateText: input.itemSentence,
    finalSegmentWindow: input.transcriptWindow,
    diceThreshold: CONTEXT_DICE_MATCH_THRESHOLD,
  });
  const lexicalOverlap = calculateWordMultisetRecall({
    scriptText: input.itemSentence,
    transcriptText: input.transcriptWindow,
  });

  if (phraseMatch.method === "substring") {
    return {
      lexicalOverlap,
      matched: true,
      method: "substring",
      semanticSimilarity: input.semanticSimilarity,
      strength: 1,
    };
  }

  if (
    phraseMatch.method === "dice" &&
    phraseMatch.score >= CONTEXT_DICE_MATCH_THRESHOLD &&
    lexicalOverlap >= CONTEXT_WORD_RECALL_THRESHOLD
  ) {
    return {
      lexicalOverlap,
      matched: true,
      method: "dice",
      semanticSimilarity: input.semanticSimilarity,
      strength: Math.max(phraseMatch.score, lexicalOverlap),
    };
  }

  if (
    input.semanticSimilarity >=
      Math.max(CONTEXT_MATCH_THRESHOLD, CONTEXT_SEMANTIC_MATCH_THRESHOLD) &&
    lexicalOverlap >= CONTEXT_SEMANTIC_WORD_RECALL_THRESHOLD
  ) {
    return {
      lexicalOverlap,
      matched: true,
      method: "semantic",
      semanticSimilarity: input.semanticSimilarity,
      strength: input.semanticSimilarity,
    };
  }

  return {
    lexicalOverlap,
    matched: false,
    method: "none",
    semanticSimilarity: input.semanticSimilarity,
    strength: 0,
  };
}

export function isContextItemCovered(input: {
  itemSentence: string;
  transcriptWindow: string;
  semanticSimilarity: number;
}) {
  return evaluateContextItemCoverage(input).matched;
}

export function selectBestContextItemMatch<T extends { itemId: string; sentence: string }>(
  input: {
    items: readonly T[];
    transcriptWindow: string;
    semanticSimilarities: ReadonlyMap<string, number>;
  }
) {
  const matches = input.items
    .map((item) => ({
      evaluation: evaluateContextItemCoverage({
        itemSentence: item.sentence,
        transcriptWindow: input.transcriptWindow,
        semanticSimilarity: input.semanticSimilarities.get(item.itemId) ?? 0,
      }),
      item,
    }))
    .filter((candidate) => candidate.evaluation.matched);

  matches.sort((left, right) => {
    const methodPriority = compareContextMatchMethodPriority(
      left.evaluation.method,
      right.evaluation.method,
    );
    if (methodPriority !== 0) {
      return methodPriority;
    }
    if (right.evaluation.strength !== left.evaluation.strength) {
      return right.evaluation.strength - left.evaluation.strength;
    }
    if (right.evaluation.lexicalOverlap !== left.evaluation.lexicalOverlap) {
      return right.evaluation.lexicalOverlap - left.evaluation.lexicalOverlap;
    }
    return left.item.itemId.localeCompare(right.item.itemId);
  });

  return matches[0] ?? null;
}

function compareContextMatchMethodPriority(
  left: PhraseMatchMethod | "semantic",
  right: PhraseMatchMethod | "semantic",
) {
  return getContextMatchMethodPriority(left) - getContextMatchMethodPriority(right);
}

function getContextMatchMethodPriority(method: PhraseMatchMethod | "semantic") {
  switch (method) {
    case "substring":
      return -3;
    case "dice":
      return -2;
    case "semantic":
      return -1;
    default:
      return 0;
  }
}
