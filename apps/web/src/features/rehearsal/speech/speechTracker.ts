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
  acceptSemanticSentenceMatch: (input: {
    sentenceId: string;
    transcript: string;
    similarity: number;
    atMs: number;
  }) => SpeechTrackingEvent[];
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
    aliases: [keyword.text, ...keyword.synonyms, ...keyword.abbreviations]
  }));

  const sessionKeywordHits = new Set<string>();
  const visit = createVisitState();

  function acceptResult(result: LiveSttResult): SpeechTrackingEvent[] {
    const atMs = result.timestampMs[1];
    const events: SpeechTrackingEvent[] = [];
    const finalWindow = createFinalSegmentWindow({
      previousFinalTranscript: visit.finalTranscript,
      latestFinalSegment: result.text,
      tailCharacters: config.matchingTailCharacters
    });
    const trackingTranscript = appendTranscript(visit.finalTranscript, result.text);

    if (result.isFinal) {
      visit.finalTranscript = trackingTranscript;
    }

    for (const sentence of sentences) {
      if (!sentence.matchable || visit.coveredSentenceIds.has(sentence.sentenceId)) {
        continue;
      }

      if (isSentenceMatched(sentence, finalWindow, config, result.isFinal)) {
        events.push(...coverSentence(sentence, atMs));
      }
    }

    if (result.isFinal) {
      for (const match of matchKeywordAliases({
        transcript: result.text,
        keywords: keywordAliases
      })) {
        if (sessionKeywordHits.has(match.keywordId)) {
          continue;
        }

        sessionKeywordHits.add(match.keywordId);
        events.push({
          type: "keyword-hit",
          slideId: input.slideId,
          keywordId: match.keywordId,
          atMs
        });
      }
    }

    const coverage = computeCoverage({
      coveredSentenceCount: visit.coveredSentenceIds.size,
      matchableSentenceCount: matchableSentenceIds.length,
      transcript: trackingTranscript,
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

  function acceptSemanticSentenceMatch(options: {
    sentenceId: string;
    transcript: string;
    similarity: number;
    atMs: number;
  }): SpeechTrackingEvent[] {
    const sentence = sentences.find(
      (candidate) =>
        candidate.sentenceId === options.sentenceId && candidate.matchable
    );
    if (!sentence || visit.coveredSentenceIds.has(sentence.sentenceId)) {
      return [];
    }

    const events = coverSentence(sentence, options.atMs);
    events.push(createCoverageUpdatedEvent(options.atMs));
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
    acceptSemanticSentenceMatch,
    exitSlide,
    resetForSlideVisit,
    snapshot
  };

  function coverSentence(
    sentence: ExtractedSentence,
    atMs: number
  ): SpeechTrackingEvent[] {
    const events: SpeechTrackingEvent[] = [];
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

    return events;
  }

  function createCoverageUpdatedEvent(atMs: number): SpeechTrackingEvent {
    const coverage = computeCoverage({
      coveredSentenceCount: visit.coveredSentenceIds.size,
      matchableSentenceCount: matchableSentenceIds.length,
      transcript: visit.finalTranscript,
      speakerNotes: input.speakerNotes,
      threshold,
      config
    });
    visit.sentenceCoverage = coverage.sentenceCoverage;
    visit.wordCoverage = coverage.wordCoverage;
    visit.effectiveCoverage = coverage.effectiveCoverage;

    return {
      type: "coverage-updated",
      slideId: input.slideId,
      sentenceCoverage: coverage.sentenceCoverage,
      wordCoverage: coverage.wordCoverage,
      effectiveCoverage: coverage.effectiveCoverage,
      atMs
    };
  }
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
  config: SpeechTrackingConfig,
  allowFuzzyMatch: boolean
) {
  return sentence.candidates.some(
    (candidate) =>
      matchPhraseCandidate({
        candidateText: candidate.text,
        finalSegmentWindow: finalWindow,
        diceThreshold: allowFuzzyMatch ? config.diceThreshold : 1
      }).matched
  );
}

function computeCoverage(options: {
  coveredSentenceCount: number;
  matchableSentenceCount: number;
  transcript: string;
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
    transcriptText: options.transcript
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
