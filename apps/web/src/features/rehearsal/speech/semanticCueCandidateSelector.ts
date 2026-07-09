import type { SemanticCue } from "@orbit/shared";

import { normalizeSpeechText } from "./phraseExtractor";
import type { SemanticMatchDecisionReason } from "./semanticUtteranceDecision";

export type SemanticCueCandidate = {
  cue: SemanticCue;
  lexicalScore: number;
  conceptCoverage: number;
  retrievalScore: number;
  priorityScore: number;
  score: number;
  selectedForNli: boolean;
  nliSkippedReason?: string;
};

export function selectSemanticCueCandidates(options: {
  slideId: string;
  transcript: string;
  cues: readonly SemanticCue[];
  coveredCueIds: ReadonlySet<string>;
  semanticDecisionReason: SemanticMatchDecisionReason | "no_match";
  retrievalScoresByCueId?: ReadonlyMap<string, number>;
  maxCandidates?: number;
}): SemanticCueCandidate[] {
  const maxCandidates = options.maxCandidates ?? 3;
  const slideCues = options.cues.filter((cue) => cue.slideId === options.slideId);
  const candidates = slideCues.map((cue) =>
    scoreSemanticCueCandidate({
      cue,
      transcript: options.transcript,
      covered: options.coveredCueIds.has(cue.cueId),
      semanticDecisionReason: options.semanticDecisionReason,
      retrievalScore: options.retrievalScoresByCueId?.get(cue.cueId) ?? 0
    })
  );

  const selected = candidates
    .filter((candidate) => candidate.selectedForNli)
    .sort(compareSemanticCueCandidates)
    .slice(0, maxCandidates);

  if (selected.length > 0) {
    return selected;
  }

  return candidates.sort(compareSemanticCueCandidates).slice(0, maxCandidates);
}

function scoreSemanticCueCandidate(options: {
  cue: SemanticCue;
  transcript: string;
  covered: boolean;
  semanticDecisionReason: SemanticMatchDecisionReason | "no_match";
  retrievalScore: number;
}): SemanticCueCandidate {
  const lexicalScore = scoreTermCoverage(options.transcript, [
    ...options.cue.candidateKeywords,
    ...Object.keys(options.cue.aliases),
    ...Object.values(options.cue.aliases).flat()
  ]);
  const conceptCoverage = scoreTermCoverage(
    options.transcript,
    options.cue.requiredConcepts
  );
  const priorityScore = priorityToScore(options.cue.priority, options.cue.required);
  const retrievalScore = clamp01(options.retrievalScore);
  const score = roundScore(
    lexicalScore * 0.28 +
      conceptCoverage * 0.32 +
      retrievalScore * 0.25 +
      priorityScore * 0.15
  );
  const nliSkippedReason = getCandidateSkipReason({
    covered: options.covered,
    score,
    semanticDecisionReason: options.semanticDecisionReason
  });

  return {
    cue: options.cue,
    lexicalScore,
    conceptCoverage,
    retrievalScore,
    priorityScore,
    score,
    selectedForNli: nliSkippedReason === undefined,
    ...(nliSkippedReason === undefined ? {} : { nliSkippedReason })
  };
}

function getCandidateSkipReason(options: {
  covered: boolean;
  score: number;
  semanticDecisionReason: SemanticMatchDecisionReason | "no_match";
}) {
  if (options.covered) {
    return "already-covered";
  }

  if (options.semanticDecisionReason === "no_match" && options.score < 0.4) {
    return "no-meaningful-candidate";
  }

  if (options.score < 0.18) {
    return "low-cue-score";
  }

  return undefined;
}

function compareSemanticCueCandidates(
  left: SemanticCueCandidate,
  right: SemanticCueCandidate
) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.cue.required !== right.cue.required) {
    return left.cue.required ? -1 : 1;
  }

  return left.cue.priority - right.cue.priority;
}

function scoreTermCoverage(transcript: string, terms: readonly string[]) {
  const normalizedTranscript = normalizeSpeechText(transcript);
  const normalizedTerms = uniqueTerms(terms);
  if (!normalizedTranscript || normalizedTerms.length === 0) {
    return 0;
  }

  const matched = normalizedTerms.filter((term) =>
    normalizedTranscript.includes(term)
  ).length;

  return roundScore(matched / normalizedTerms.length);
}

function uniqueTerms(terms: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const term of terms) {
    const normalized = normalizeSpeechText(term);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function priorityToScore(priority: 1 | 2 | 3, required: boolean) {
  const priorityScore = priority === 1 ? 1 : priority === 2 ? 0.66 : 0.33;
  return required ? priorityScore : priorityScore * 0.75;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}
