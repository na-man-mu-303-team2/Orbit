import type { LiveSttResult } from "../stt/liveSttPort";
import { createDefaultPhraseExtractor } from "./phraseExtractor";
import {
  mergeSpeechTrackingConfig,
  type SpeechTrackingConfig,
  type SpeechTrackingConfigOverride
} from "./speechTrackingConfig";
import type {
  ExtractedSentence,
  SpeechTrackerSnapshot,
  SpeechTrackingEvent
} from "./speechTrackingEvents";
import {
  calculateWordMultisetRecall,
  createFinalSegmentWindow,
  matchKeywordAliases,
  matchPhraseCandidate
} from "./speechMatcher";

export type SpeechTrackerKeyword = {
  keywordId: string;
  noteOccurrence?: number;
  text: string;
  synonyms: readonly string[];
  abbreviations: readonly string[];
};

export type CreateSpeechTrackerInput = {
  slideId: string;
  speakerNotes: string;
  keywords: readonly SpeechTrackerKeyword[];
  controlPhrases?: readonly string[];
  threshold?: number;
  config?: SpeechTrackingConfigOverride;
};

export type SpeechTracker = {
  acceptResult: (result: LiveSttResult) => SpeechTrackingEvent[];
  exitSlide: (atMs: number) => SpeechTrackingEvent[];
  resetForSlideVisit: () => void;
  snapshot: () => SpeechTrackerSnapshot;
};

export function createSpeechTracker(input: CreateSpeechTrackerInput): SpeechTracker {
  const config = mergeSpeechTrackingConfig(input.config);
  const threshold = input.threshold ?? 0.7;
  const extractor = createDefaultPhraseExtractor({
    ...input.config,
    controlPhrases: input.controlPhrases
  });
  const sentences = extractor.extract(input.speakerNotes);
  const matchableSentenceIds = sentences
    .filter((sentence) => sentence.matchable)
    .map((sentence) => sentence.sentenceId);
  const keywordAliases = input.keywords.map((keyword) => ({
    keywordId: keyword.keywordId,
    noteOccurrence: keyword.noteOccurrence,
    text: keyword.text,
    aliases: [keyword.text, ...keyword.synonyms, ...keyword.abbreviations]
  }));

  const sessionKeywordHits = new Set<string>();
  const visit = createVisitState();

  function acceptResult(result: LiveSttResult): SpeechTrackingEvent[] {
    if (!result.isFinal) {
      return [];
    }

    const atMs = result.timestampMs[1];
    const events: SpeechTrackingEvent[] = [];
    const finalWindow = createFinalSegmentWindow({
      previousFinalTranscript: visit.finalTranscript,
      latestFinalSegment: result.text,
      tailCharacters: config.matchingTailCharacters
    });
    visit.finalTranscript = appendTranscript(visit.finalTranscript, result.text);

    for (const sentence of sentences) {
      if (!sentence.matchable || visit.coveredSentenceIds.has(sentence.sentenceId)) {
        continue;
      }

      if (isSentenceMatched(sentence, finalWindow, config)) {
        visit.coveredSentenceIds.add(sentence.sentenceId);
        events.push({
          type: "sentence-covered",
          slideId: input.slideId,
          sentenceId: sentence.sentenceId,
          atMs
        });

        if (sentence.isFinalTrigger && !visit.finalSentenceSpoken) {
          visit.finalSentenceSpoken = true;
          events.push({
            type: "last-sentence-spoken",
            slideId: input.slideId,
            sentenceId: sentence.sentenceId,
            atMs
          });
        }
      }
    }

    for (const match of matchKeywordAliases({
      transcript: visit.finalTranscript,
      keywords: keywordAliases.filter(
        (keyword) => !sessionKeywordHits.has(keyword.keywordId)
      )
    })) {
      sessionKeywordHits.add(match.keywordId);
      events.push({
        type: "keyword-hit",
        slideId: input.slideId,
        keywordId: match.keywordId,
        atMs
      });
    }

    const coverage = computeCoverage({
      coveredSentenceCount: visit.coveredSentenceIds.size,
      matchableSentenceCount: matchableSentenceIds.length,
      finalTranscript: visit.finalTranscript,
      speakerNotes: input.speakerNotes,
      threshold,
      config
    });
    visit.sentenceCoverage = coverage.sentenceCoverage;
    visit.wordCoverage = coverage.wordCoverage;
    visit.effectiveCoverage = coverage.effectiveCoverage;

    events.push({
      type: "coverage-updated",
      slideId: input.slideId,
      sentenceCoverage: coverage.sentenceCoverage,
      wordCoverage: coverage.wordCoverage,
      effectiveCoverage: coverage.effectiveCoverage,
      atMs
    });

    return events;
  }

  function exitSlide(atMs: number): SpeechTrackingEvent[] {
    const missingKeywordIds = input.keywords
      .map((keyword) => keyword.keywordId)
      .filter((keywordId) => !sessionKeywordHits.has(keywordId));
    visit.provisionalMissingKeywordIds = new Set(missingKeywordIds);

    return missingKeywordIds.map((keywordId) => ({
      type: "keyword-missing",
      slideId: input.slideId,
      keywordId,
      provisional: true,
      atMs
    }));
  }

  function resetForSlideVisit() {
    const nextVisit = createVisitState();
    Object.assign(visit, nextVisit);
  }

  function snapshot(): SpeechTrackerSnapshot {
    return {
      slideId: input.slideId,
      coveredSentenceIds: Array.from(visit.coveredSentenceIds),
      matchableSentenceCount: matchableSentenceIds.length,
      sentenceCoverage: visit.sentenceCoverage,
      wordCoverage: visit.wordCoverage,
      effectiveCoverage: visit.effectiveCoverage,
      finalSentenceSpoken: visit.finalSentenceSpoken,
      hitKeywordIds: Array.from(sessionKeywordHits),
      provisionalMissingKeywordIds: Array.from(visit.provisionalMissingKeywordIds)
    };
  }

  return {
    acceptResult,
    exitSlide,
    resetForSlideVisit,
    snapshot
  };
}

function createVisitState() {
  return {
    finalTranscript: "",
    coveredSentenceIds: new Set<string>(),
    provisionalMissingKeywordIds: new Set<string>(),
    sentenceCoverage: 0,
    wordCoverage: 0,
    effectiveCoverage: 0,
    finalSentenceSpoken: false
  };
}

function isSentenceMatched(
  sentence: ExtractedSentence,
  finalWindow: string,
  config: SpeechTrackingConfig
) {
  return sentence.candidates.some(
    (candidate) =>
      matchPhraseCandidate({
        candidateText: candidate.text,
        finalSegmentWindow: finalWindow,
        diceThreshold: config.diceThreshold
      }).matched
  );
}

function computeCoverage(options: {
  coveredSentenceCount: number;
  matchableSentenceCount: number;
  finalTranscript: string;
  speakerNotes: string;
  threshold: number;
  config: SpeechTrackingConfig;
}) {
  const sentenceCoverage =
    options.matchableSentenceCount === 0
      ? 0
      : options.coveredSentenceCount / options.matchableSentenceCount;
  const wordCoverage = calculateWordMultisetRecall({
    scriptText: options.speakerNotes,
    transcriptText: options.finalTranscript
  });
  const effectiveCoverage = computeEffectiveCoverage({
    sentenceCoverage,
    wordCoverage,
    threshold: options.threshold,
    config: options.config
  });

  return {
    sentenceCoverage,
    wordCoverage,
    effectiveCoverage
  };
}

function computeEffectiveCoverage(options: {
  sentenceCoverage: number;
  wordCoverage: number;
  threshold: number;
  config: SpeechTrackingConfig;
}) {
  const { sentenceCoverage, wordCoverage, threshold, config } = options;
  const correctionWindow = config.hybridCoverage.correctionWindow;
  if (Math.abs(sentenceCoverage - threshold) > correctionWindow) {
    return sentenceCoverage;
  }

  const weighted =
    config.hybridCoverage.sentenceWeight * sentenceCoverage +
    config.hybridCoverage.wordWeight * wordCoverage;
  return clamp(
    weighted,
    sentenceCoverage - correctionWindow,
    sentenceCoverage + correctionWindow
  );
}

function appendTranscript(current: string, next: string) {
  return [current.trim(), next.trim()].filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
