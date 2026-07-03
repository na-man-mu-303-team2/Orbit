import type { AdviceEventType } from "./speechTrackingConfig";

export type PhraseCandidate = {
  candidateId: string;
  text: string;
  normalizedText: string;
  score: number;
  wordCount: number;
  startWordIndex: number;
  endWordIndex: number;
};

export type ExtractedSentence = {
  sentenceId: string;
  text: string;
  index: number;
  isFinalTrigger: boolean;
  matchable: boolean;
  candidates: PhraseCandidate[];
};

export type SpeechTrackerSnapshot = {
  slideId: string;
  coveredSentenceIds: string[];
  matchableSentenceCount: number;
  sentenceCoverage: number;
  wordCoverage: number;
  effectiveCoverage: number;
  finalSentenceSpoken: boolean;
  hitKeywordIds: string[];
  provisionalMissingKeywordIds: string[];
};

export type SentenceCoveredEvent = {
  type: "sentence-covered";
  slideId: string;
  sentenceId: string;
  atMs: number;
};

export type CoverageUpdatedEvent = {
  type: "coverage-updated";
  slideId: string;
  sentenceCoverage: number;
  wordCoverage: number;
  effectiveCoverage: number;
  atMs: number;
};

export type LastSentenceSpokenEvent = {
  type: "last-sentence-spoken";
  slideId: string;
  sentenceId: string;
  atMs: number;
};

export type KeywordHitEvent = {
  type: "keyword-hit";
  slideId: string;
  keywordId: string;
  atMs: number;
};

export type KeywordMissingEvent = {
  type: "keyword-missing";
  slideId: string;
  keywordId: string;
  provisional: boolean;
  atMs: number;
};

export type AdviceEvent = {
  type: "advice-event";
  slideId: string;
  adviceType: AdviceEventType;
  atMs: number;
};

export type SpeechTrackingEvent =
  | SentenceCoveredEvent
  | CoverageUpdatedEvent
  | LastSentenceSpokenEvent
  | KeywordHitEvent
  | KeywordMissingEvent
  | AdviceEvent;
