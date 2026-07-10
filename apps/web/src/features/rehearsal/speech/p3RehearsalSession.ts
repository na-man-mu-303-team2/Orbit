import type { RehearsalRunMeta, SemanticCue } from "@orbit/shared";

import type {
  LiveSttBiasPhrase,
  LiveSttPort,
  LiveSttResult
} from "../stt/liveSttPort";
import { createDefaultPhraseExtractor } from "./phraseExtractor";
import { buildSpeechTrackingBiasPhrases } from "./speechBiasPhrases";
import {
  createRehearsalLogCollector,
  type RehearsalLogCollector
} from "./rehearsalLogCollector";
import {
  defaultSpeechTrackingConfig,
  type AdviceEventType,
  type SpeechTrackingConfigOverride
} from "./speechTrackingConfig";
import type { SpeechTrackerKeyword } from "./speechTracker";
import { createSpeechTracker, type SpeechTracker } from "./speechTracker";
import {
  createSemanticDebugState,
  semanticDebugErrorMessage,
  type SemanticUtteranceDebugState
} from "./semanticSpeechDebug";
import type { SemanticMatchDecisionReason } from "./semanticUtteranceDecision";
import type { SemanticUtteranceMatcher } from "./semanticUtteranceMatcher";
import type { SemanticCueDebugEvent } from "./semanticCueDebugEvents";
import type { SemanticCueRuntime } from "./semanticCueRuntime";
import type { SpeechTrackerSnapshot, SpeechTrackingEvent } from "./speechTrackingEvents";

export type P3RehearsalSessionSlide = {
  slideId: string;
  speakerNotes: string;
  keywords: readonly SpeechTrackerKeyword[];
  semanticCues?: readonly SemanticCue[];
  controlPhrases?: readonly string[];
  cuePhrases?: readonly string[];
  legacyPhrases?: readonly string[];
};

export type P3RehearsalSessionState = {
  status: "idle" | "starting" | "running" | "paused" | "stopped" | "failed";
  slideIndex: number;
  startedAtMs: number | null;
  slideEnteredAtMs: number | null;
  snapshot: SpeechTrackerSnapshot | null;
  finalSegments: LiveSttResult[];
  runMeta: RehearsalRunMeta | null;
};

export type CreateP3RehearsalSessionInput = {
  slides: readonly P3RehearsalSessionSlide[];
  port: LiveSttPort;
  threshold?: number;
  config?: SpeechTrackingConfigOverride;
  now?: () => number;
  onEvents?: (events: SpeechTrackingEvent[]) => void;
  onSnapshot?: (snapshot: SpeechTrackerSnapshot) => void;
  semanticMatcher?: SemanticUtteranceMatcher;
  semanticCueRuntime?: SemanticCueRuntime;
  isSemanticMatchingEnabled?: () => boolean;
  onSemanticDebugState?: (state: SemanticUtteranceDebugState) => void;
  onSemanticCueDebugEvent?: (event: SemanticCueDebugEvent) => void;
};

export type P3RehearsalSession = {
  start: (options: {
    audioSource: MediaStream;
    slideIndex?: number;
  }) => Promise<P3RehearsalSessionState>;
  pause: () => Promise<P3RehearsalSessionState>;
  resume: (options: { audioSource: MediaStream }) => Promise<P3RehearsalSessionState>;
  enterSlide: (slideIndex: number) => SpeechTrackingEvent[];
  acceptResult: (result: LiveSttResult) => SpeechTrackingEvent[];
  setAdviceState: (type: AdviceEventType, active: boolean) => void;
  stop: () => Promise<RehearsalRunMeta>;
  getState: () => P3RehearsalSessionState;
};

export function createP3RehearsalSession(
  input: CreateP3RehearsalSessionInput
): P3RehearsalSession {
  const now = input.now ?? (() => Date.now());
  let currentNowMs = 0;
  const getNowMs = () => {
    currentNowMs = now();
    return currentNowMs;
  };
  const collector = createRehearsalLogCollector({
    slides: input.slides.map((slide) => ({
      slideId: slide.slideId,
      keywordIds: slide.keywords.map((keyword) => keyword.keywordId),
      matchableSentenceIds: getMatchableSentenceIdsForSlide(slide, input.config)
    })),
    now: () => new Date(currentNowMs || now()),
    adviceReentryCooldownMs:
      input.config?.adviceReentryCooldownMs ??
      defaultSpeechTrackingConfig.adviceReentryCooldownMs
  });
  const trackers = new Map<number, SpeechTracker>();
  const finalSegments: LiveSttResult[] = [];
  let status: P3RehearsalSessionState["status"] = "idle";
  let slideIndex = 0;
  let startedAtMs: number | null = null;
  let slideEnteredAtMs: number | null = null;
  let currentTracker: SpeechTracker | null = null;
  let runMeta: RehearsalRunMeta | null = null;
  let cleanupSubscriptions: (() => void) | null = null;
  let semanticGeneration = 0;
  let semanticQueue: Promise<void> = Promise.resolve();
  const semanticPrepareBySlideId = new Map<string, Promise<void>>();
  let resultTimestampOffsetMs = 0;
  let lastAcceptedResultEndMs = 0;

  async function start(options: {
    audioSource: MediaStream;
    slideIndex?: number;
  }): Promise<P3RehearsalSessionState> {
    slideIndex = options.slideIndex ?? 0;
    const slide = getSlide(slideIndex);
    status = "starting";
    runMeta = null;
    finalSegments.length = 0;
    resultTimestampOffsetMs = 0;
    lastAcceptedResultEndMs = 0;

    try {
      cleanupSubscriptions?.();
      const unsubscribeResult = input.port.onResult(acceptResult);
      const unsubscribeError = input.port.onError(() => {
        status = "failed";
        cleanupSubscriptions?.();
      });
      cleanupSubscriptions = () => {
        unsubscribeResult();
        unsubscribeError();
        cleanupSubscriptions = null;
      };

      await input.port.start({
        language: "ko",
        audioSource: options.audioSource,
        biasPhrases: buildBiasPhrasesForSlideIndex(slideIndex)
      });
    } catch (error) {
      status = "failed";
      startedAtMs = null;
      slideEnteredAtMs = null;
      currentTracker = null;
      cleanupSubscriptions?.();
      throw error;
    }

    const startedAt = getNowMs();
    startedAtMs = startedAt;
    slideEnteredAtMs = startedAt;
    currentTracker = getTracker(slideIndex);
    collector.enterSlide(slide.slideId);
    status = "running";
    semanticGeneration += 1;
    scheduleSemanticPrepare(slideIndex, semanticGeneration);
    emitSnapshot();
    return getState();
  }

  async function pause(): Promise<P3RehearsalSessionState> {
    if (status !== "running") {
      return getState();
    }

    semanticGeneration += 1;
    await input.port.stop();
    status = "paused";
    emitSnapshot();
    return getState();
  }

  async function resume(options: {
    audioSource: MediaStream;
  }): Promise<P3RehearsalSessionState> {
    if (status !== "paused") {
      return getState();
    }

    resultTimestampOffsetMs = lastAcceptedResultEndMs;
    status = "starting";
    try {
      await input.port.start({
        language: "ko",
        audioSource: options.audioSource,
        biasPhrases: buildBiasPhrasesForSlideIndex(slideIndex)
      });
    } catch (error) {
      status = "failed";
      cleanupSubscriptions?.();
      throw error;
    }

    status = "running";
    semanticGeneration += 1;
    scheduleSemanticPrepare(slideIndex, semanticGeneration);
    emitSnapshot();
    return getState();
  }

  function enterSlide(nextSlideIndex: number): SpeechTrackingEvent[] {
    if (status !== "running") {
      return [];
    }

    const events: SpeechTrackingEvent[] = [];
    const atMs = getRelativeNowMs();
    if (currentTracker) {
      events.push(...currentTracker.exitSlide(atMs));
    }

    slideIndex = nextSlideIndex;
    const slide = getSlide(slideIndex);
    currentTracker = getTracker(slideIndex);
    currentTracker.resetForSlideVisit();
    slideEnteredAtMs = getNowMs();
    collector.enterSlide(slide.slideId);
    input.port.updateBiasPhrases(buildBiasPhrasesForSlideIndex(slideIndex));
    semanticGeneration += 1;
    scheduleSemanticPrepare(slideIndex, semanticGeneration);
    applyEventsToLog(events, collector);
    if (events.length > 0) {
      input.onEvents?.(events);
    }
    emitSnapshot();
    return events;
  }

  function acceptResult(result: LiveSttResult): SpeechTrackingEvent[] {
    if (status !== "running" || !currentTracker) {
      return [];
    }

    const normalizedResult = normalizeResultTimestamp(result);
    if (result.isFinal) {
      finalSegments.push(normalizedResult);
    }

    const events = currentTracker.acceptResult(normalizedResult);
    applyEventsToLog(events, collector);
    if (events.length > 0) {
      input.onEvents?.(events);
    }
    if (result.isFinal) {
      enqueueSemanticFinalResult({
        result: normalizedResult,
        resultSlideIndex: slideIndex,
        tracker: currentTracker,
        generation: semanticGeneration,
        phraseMatched: events.some((event) => event.type === "sentence-covered"),
        keywordCoverage: calculateKeywordCoverage(currentTracker.snapshot(), getSlide(slideIndex))
      });
    }
    emitSnapshot();
    return events;
  }

  function setAdviceState(type: AdviceEventType, active: boolean) {
    collector.setAdviceState(type, active);
  }

  async function stop() {
    cleanupSubscriptions?.();
    await input.port.stop();
    status = "stopped";
    semanticGeneration += 1;
    runMeta = collector.finalize();
    return runMeta;
  }

  function getState(): P3RehearsalSessionState {
    return {
      status,
      slideIndex,
      startedAtMs,
      slideEnteredAtMs,
      snapshot: currentTracker?.snapshot() ?? null,
      finalSegments: [...finalSegments],
      runMeta
    };
  }

  function getTracker(index: number) {
    const current = trackers.get(index);
    if (current) {
      return current;
    }

    const slide = getSlide(index);
    const tracker = createSpeechTracker({
      slideId: slide.slideId,
      speakerNotes: slide.speakerNotes,
      keywords: slide.keywords,
      controlPhrases: slide.controlPhrases,
      threshold: input.threshold,
      config: input.config
    });
    trackers.set(index, tracker);
    return tracker;
  }

  function emitSnapshot() {
    const snapshot = currentTracker?.snapshot();
    if (snapshot) {
      input.onSnapshot?.(snapshot);
    }
  }

  function getRelativeNowMs() {
    const base = startedAtMs ?? getNowMs();
    return Math.max(getNowMs() - base, 0);
  }

  function getSlide(index: number) {
    const slide = input.slides[index];
    if (!slide) {
      throw new Error(`P3 rehearsal slide index is out of range: ${index}`);
    }
    return slide;
  }

  function buildBiasPhrasesForSlideIndex(index: number) {
    return buildBiasPhrasesForSlide(getSlide(index), input.config, {
      adjacentSlides: [input.slides[index - 1], input.slides[index + 1]].filter(
        (slide): slide is P3RehearsalSessionSlide => slide !== undefined
      )
    });
  }

  function scheduleSemanticPrepare(index: number, generation: number) {
    if (!input.semanticMatcher || status !== "running") {
      return;
    }

    const slide = getSlide(index);
    emitSemanticDebugState({
      status: "indexing-script",
      slideId: slide.slideId,
      transcript: "",
      isFinal: false,
      topMatches: [],
      decision: null,
      error: null
    });

    const preparePromise = input.semanticMatcher
      .prepareSlide({
        slideId: slide.slideId,
        speakerNotes: slide.speakerNotes
      })
      .then(() => {
        if (isSemanticGenerationCurrent(generation, index)) {
          emitSemanticDebugState({
            status: "ready",
            slideId: slide.slideId,
            transcript: "",
            isFinal: false,
            topMatches: [],
            decision: null,
            error: null
          });
        }
      })
      .catch((error: unknown) => {
        if (isSemanticGenerationCurrent(generation, index)) {
          emitSemanticDebugState({
            status: "error",
            slideId: slide.slideId,
            transcript: "",
            isFinal: false,
            topMatches: [],
            decision: null,
            error: semanticDebugErrorMessage(error)
          });
        }
      });

    semanticPrepareBySlideId.set(slide.slideId, preparePromise);
  }

  function enqueueSemanticFinalResult(options: {
    result: LiveSttResult;
    resultSlideIndex: number;
    tracker: SpeechTracker;
    generation: number;
    phraseMatched: boolean;
    keywordCoverage: number;
  }) {
    if (!input.semanticMatcher) {
      return;
    }

    semanticQueue = semanticQueue
      .catch(() => undefined)
      .then(() => processSemanticFinalResult(options));
  }

  async function processSemanticFinalResult(options: {
    result: LiveSttResult;
    resultSlideIndex: number;
    tracker: SpeechTracker;
    generation: number;
    phraseMatched: boolean;
    keywordCoverage: number;
  }) {
    const slide = getSlide(options.resultSlideIndex);
    await semanticPrepareBySlideId.get(slide.slideId);
    if (!isSemanticGenerationCurrent(options.generation, options.resultSlideIndex)) {
      return;
    }

    emitSemanticDebugState({
      status: "matching",
      slideId: slide.slideId,
      transcript: options.result.text,
      isFinal: true,
      topMatches: [],
      decision: null,
      error: null
    });

    try {
      const match = await input.semanticMatcher?.matchFinalTranscript({
        slideId: slide.slideId,
        transcript: options.result.text,
        coveredSentenceIds: new Set(options.tracker.snapshot().coveredSentenceIds)
      });
      if (!match || !isSemanticGenerationCurrent(options.generation, options.resultSlideIndex)) {
        return;
      }

      emitSemanticDebugState({
        status: "ready",
        slideId: slide.slideId,
        transcript: options.result.text,
        isFinal: true,
        topMatches: match.topMatches,
        decision: match.decision,
        error: null
      });

      const decision = match.decision;
      await processSemanticCueFinalResult({
        slide,
        result: options.result,
        decisionReason: decision?.reason ?? "no_match",
        generation: options.generation,
        resultSlideIndex: options.resultSlideIndex,
        phraseMatched: options.phraseMatched,
        keywordCoverage: options.keywordCoverage
      });
      if (!input.isSemanticMatchingEnabled?.()) {
        return;
      }

      const events: SpeechTrackingEvent[] = [];
      if (decision?.outcome === "ad-lib") {
        const nearestMatch = decision.topMatches[0] ?? null;
        events.push({
          type: "ad-lib-detected",
          slideId: slide.slideId,
          text: options.result.text,
          nearestSentenceId: nearestMatch?.sentenceId ?? null,
          similarity: nearestMatch?.similarity ?? null,
          atMs: options.result.timestampMs[1]
        });
      } else if (decision?.accepted && decision.acceptedMatch && decision.outcome) {
        events.push(
          ...options.tracker.acceptSemanticSentenceMatch({
            sentenceId: decision.acceptedMatch.sentenceId,
            transcript: options.result.text,
            similarity: decision.acceptedMatch.similarity,
            matchKind: decision.outcome,
            lexicalOverlap: decision.lexicalOverlap,
            atMs: options.result.timestampMs[1]
          })
        );
      }
      applyEventsToLog(events, collector);
      if (events.length > 0) {
        input.onEvents?.(events);
        emitSnapshot();
      }
    } catch (error) {
      if (isSemanticGenerationCurrent(options.generation, options.resultSlideIndex)) {
        emitSemanticDebugState({
          status: "error",
          slideId: slide.slideId,
          transcript: options.result.text,
          isFinal: true,
          topMatches: [],
          decision: null,
          error: semanticDebugErrorMessage(error)
        });
      }
    }
  }

  function isSemanticGenerationCurrent(generation: number, expectedSlideIndex: number) {
    return (
      status === "running" &&
      generation === semanticGeneration &&
      slideIndex === expectedSlideIndex
    );
  }

  function emitSemanticDebugState(state: SemanticUtteranceDebugState) {
    input.onSemanticDebugState?.(createSemanticDebugState(state));
  }

  async function processSemanticCueFinalResult(options: {
    slide: P3RehearsalSessionSlide;
    result: LiveSttResult;
    decisionReason: SemanticMatchDecisionReason | "no_match";
    generation: number;
    resultSlideIndex: number;
    phraseMatched: boolean;
    keywordCoverage: number;
  }) {
    if (!input.semanticCueRuntime || (options.slide.semanticCues?.length ?? 0) === 0) {
      return;
    }

    const cueResult = await input.semanticCueRuntime.evaluateFinalResult({
      deckId: "deck_unknown",
      slideId: options.slide.slideId,
      transcript: options.result.text,
      isFinal: options.result.isFinal,
      cues: options.slide.semanticCues ?? [],
      coveredCueIds: new Set(),
      phraseMatched: options.phraseMatched,
      keywordCoverage: options.keywordCoverage,
      semanticDecisionReason: options.decisionReason,
      semanticMatchingEnabled: input.isSemanticMatchingEnabled?.() ?? false,
      generation: options.generation,
      nowMs: options.result.timestampMs[1]
    });

    if (!isSemanticGenerationCurrent(options.generation, options.resultSlideIndex)) {
      return;
    }

    collector.recordSemanticCueDecisions(cueResult.decisions);
    input.onSemanticCueDebugEvent?.(cueResult.debugEvent);
  }

  return {
    start,
    pause,
    resume,
    enterSlide,
    acceptResult,
    setAdviceState,
    stop,
    getState
  };

  function normalizeResultTimestamp(result: LiveSttResult): LiveSttResult {
    const startMs = Math.max(result.timestampMs[0] + resultTimestampOffsetMs, 0);
    const endMs = Math.max(
      result.timestampMs[1] + resultTimestampOffsetMs,
      startMs,
      lastAcceptedResultEndMs
    );
    lastAcceptedResultEndMs = endMs;
    return {
      ...result,
      timestampMs: [startMs, endMs]
    };
  }
}

function calculateKeywordCoverage(
  snapshot: SpeechTrackerSnapshot,
  slide: P3RehearsalSessionSlide
) {
  if (slide.keywords.length === 0) {
    return 0;
  }

  return snapshot.hitKeywordIds.length / slide.keywords.length;
}

export function buildBiasPhrasesForSlide(
  slide: P3RehearsalSessionSlide,
  config: SpeechTrackingConfigOverride = {},
  context: { adjacentSlides?: readonly P3RehearsalSessionSlide[] } = {}
): LiveSttBiasPhrase[] {
  const extractor = createDefaultPhraseExtractor({
    ...config,
    controlPhrases: slide.controlPhrases,
    keywordTerms: slide.keywords.flatMap((keyword) => [
      keyword.text,
      ...keyword.synonyms,
      ...keyword.abbreviations
    ])
  });
  const sentences = extractor.extract(slide.speakerNotes);
  const finalTriggerPhrases = sentences
    .filter((sentence) => sentence.isFinalTrigger)
    .flatMap((sentence) => sentence.candidates.map((candidate) => candidate.text));
  const representativePhrases = sentences.flatMap((sentence) =>
    sentence.candidates.map((candidate) => candidate.text)
  );

  return buildSpeechTrackingBiasPhrases({
    budget: config.biasPhraseBudget,
    controlPhrases: slide.controlPhrases,
    finalTriggerPhrases,
    cuePhrases: slide.cuePhrases,
    keywords: slide.keywords,
    semanticCues: slide.semanticCues,
    adjacentSemanticCues: context.adjacentSlides?.flatMap(
      (adjacentSlide) => adjacentSlide.semanticCues ?? []
    ),
    representativePhrases,
    legacyPhrases: slide.legacyPhrases
  }).map((term) => ({
    text: term.text,
    weight: term.weight,
    source: term.source,
    ...(term.keywordId === undefined ? {} : { keywordId: term.keywordId }),
    ...(term.canonicalText === undefined
      ? {}
      : { canonicalText: term.canonicalText })
  }));
}

function getMatchableSentenceIdsForSlide(
  slide: P3RehearsalSessionSlide,
  config: SpeechTrackingConfigOverride = {}
) {
  return createDefaultPhraseExtractor({
    ...config,
    controlPhrases: slide.controlPhrases
  })
    .extract(slide.speakerNotes)
    .filter((sentence) => sentence.matchable)
    .map((sentence) => sentence.sentenceId);
}

function applyEventsToLog(
  events: readonly SpeechTrackingEvent[],
  collector: RehearsalLogCollector
) {
  for (const event of events) {
    switch (event.type) {
      case "keyword-hit":
        collector.recordKeywordHit(event.slideId, event.keywordId);
        break;
      case "keyword-missing":
        collector.recordProvisionalMissing(event.slideId, event.keywordId);
        break;
      case "advice-event":
        collector.setAdviceState(event.adviceType, true);
        break;
      case "sentence-covered":
        collector.recordSentenceCovered({
          slideId: event.slideId,
          sentenceId: event.sentenceId,
          matchKind: event.matchKind,
          ...(event.similarity === undefined ? {} : { similarity: event.similarity }),
          ...(event.lexicalOverlap === undefined
            ? {}
            : { lexicalOverlap: event.lexicalOverlap })
        });
        break;
      case "ad-lib-detected":
        collector.recordAdLib({
          slideId: event.slideId,
          text: event.text,
          nearestSentenceId: event.nearestSentenceId,
          similarity: event.similarity
        });
        break;
      case "coverage-updated":
      case "last-sentence-spoken":
      case "sentence-missed":
        break;
    }
  }
}
