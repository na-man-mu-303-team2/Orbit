import { CONTEXT_MATCH_THRESHOLD } from "@orbit/shared";

import {
  calculateWordMultisetRecall,
  matchPhraseCandidate,
  type PhraseMatchMethod,
} from "../speech/speechMatcher";
import { normalizeLiveTranscriptText } from "../stt/liveTranscriptText";

export const CONTEXT_DICE_MATCH_THRESHOLD = 0.78;
export const CONTEXT_WORD_RECALL_THRESHOLD = 0.5;
export const CONTEXT_SEMANTIC_MATCH_THRESHOLD = 0.8;
export const CONTEXT_SEMANTIC_WORD_RECALL_THRESHOLD = 0.15;
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
    hasSemanticLexicalGrounding({
      itemSentence: input.itemSentence,
      transcriptWindow: input.transcriptWindow,
      lexicalOverlap,
    })
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

function hasSemanticLexicalGrounding(input: {
  itemSentence: string;
  transcriptWindow: string;
  lexicalOverlap: number;
}) {
  const itemAnchors = collectContextAnchors(input.itemSentence);
  const transcriptAnchors = collectContextAnchors(input.transcriptWindow);
  if (
    !hasRequiredContextAnchors({
      itemSentence: input.itemSentence,
      itemAnchors,
      transcriptAnchors,
    })
  ) {
    return false;
  }

  if (input.lexicalOverlap >= CONTEXT_SEMANTIC_WORD_RECALL_THRESHOLD) {
    return true;
  }

  if (itemAnchors.size === 0) {
    return false;
  }

  let sharedAnchors = 0;
  for (const anchor of itemAnchors) {
    if (transcriptAnchors.has(anchor)) {
      sharedAnchors += 1;
    }
  }

  return sharedAnchors > 0 && sharedAnchors / itemAnchors.size >= 0.25;
}

function hasRequiredContextAnchors(input: {
  itemSentence: string;
  itemAnchors: ReadonlySet<string>;
  transcriptAnchors: ReadonlySet<string>;
}) {
  const normalizedItem = normalizeLiveTranscriptText(input.itemSentence);
  if (
    input.itemAnchors.has("비용") &&
    input.itemAnchors.has("폐기물") &&
    (!input.transcriptAnchors.has("비용") || !input.transcriptAnchors.has("폐기물"))
  ) {
    return false;
  }

  if (
    input.itemAnchors.has("불편") &&
    input.itemAnchors.has("반납") &&
    (!input.transcriptAnchors.has("불편") || !input.transcriptAnchors.has("반납"))
  ) {
    return false;
  }

  if (
    isNeedOrSolutionContext(normalizedItem) &&
    (!input.transcriptAnchors.has("필요") ||
      (!input.transcriptAnchors.has("반납") && !input.transcriptAnchors.has("시스템")))
  ) {
    return false;
  }

  return true;
}

function isNeedOrSolutionContext(normalizedItem: string) {
  return (
    normalizedItem.includes("필요") ||
    normalizedItem.includes("편리") ||
    normalizedItem.includes("해결") ||
    normalizedItem.includes("개선")
  );
}

function collectContextAnchors(value: string) {
  const normalized = normalizeLiveTranscriptText(value);
  const anchors = new Set<string>();
  for (const group of CONTEXT_ANCHOR_GROUPS) {
    if (group.some((term) => normalized.includes(term))) {
      anchors.add(group[0] ?? "");
    }
  }
  anchors.delete("");
  return anchors;
}

const CONTEXT_ANCHOR_GROUPS = [
  ["일회용컵", "일회용", "컵"],
  ["다회용컵", "다회용"],
  ["폐기물", "쓰레기", "버려", "버리"],
  ["비용", "부담", "처리비"],
  ["반납", "돌려주", "돌려줘", "반환"],
  ["불편", "번거", "귀찮", "어렵"],
  ["시스템", "구조", "절차", "과정", "방식"],
  ["편리", "쉽", "간편", "빠르"],
  ["필요", "필요성", "해야", "마련", "요구", "개선", "해결"],
  ["보증금", "보증"],
  ["qr", "큐알", "코드", "스캔", "찍"],
  ["장벽", "참여", "이용률"],
  ["파일럿", "실험", "검증"],
  ["4주", "한달", "한 달"],
  ["감축", "줄이", "줄어"],
  ["30", "30%"],
  ["반납률", "회수율"],
  ["80", "80%"],
  ["데이터", "측정", "분석", "수집"],
  ["확대", "넓히", "늘리"],
] as const;

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
