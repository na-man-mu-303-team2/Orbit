import type { RehearsalRunMeta } from "@orbit/shared";

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
import type { SemanticUtteranceMatcher } from "./semanticUtteranceMatcher";
import type { SpeechTrackerSnapshot, SpeechTrackingEvent } from "./speechTrackingEvents";

export type P3RehearsalSessionSlide = {
  slideId: string;
  speakerNotes: string;
  keywords: readonly SpeechTrackerKeyword[];
  controlPhrases?: readonly string[];
  cuePhrases?: readonly string[];
  legacyPhrases?: readonly string[];
};

export type P3RehearsalSessionState = {
  status: "idle" | "starting" | "running" | "stopped" | "failed";
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
  isSemanticMatchingEnabled?: () => boolean;
  onSemanticDebugState?: (state: SemanticUtteranceDebugState) => void;
};

export type P3RehearsalSession = {
  start: (options: {
    audioSource: MediaStream;
    slideIndex?: number;
  }) => Promise<P3RehearsalSessionState>;
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
      keywordIds: slide.keywords.map((keyword) => keyword.keywordId)
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

  async function start(options: {
    audioSource: MediaStream;
    slideIndex?: number;
  }): Promise<P3RehearsalSessionState> {
    slideIndex = options.slideIndex ?? 0;
    const slide = getSlide(slideIndex);
    status = "starting";
    runMeta = null;
    finalSegments.length = 0;

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
        biasPhrases: buildBiasPhrasesForSlide(slide, input.config)
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
    input.port.updateBiasPhrases(buildBiasPhrasesForSlide(slide, input.config));
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

    if (result.isFinal) {
      finalSegments.push(result);
    }

    const events = currentTracker.acceptResult(result);
    applyEventsToLog(events, collector);
    if (events.length > 0) {
      input.onEvents?.(events);
    }
    if (result.isFinal) {
      enqueueSemanticFinalResult({
        result,
        resultSlideIndex: slideIndex,
        tracker: currentTracker,
        generation: semanticGeneration
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
        error: null
      });

      const topMatch = match.topMatches[0];
      if (!match.accepted || !topMatch || !input.isSemanticMatchingEnabled?.()) {
        return;
      }

      const events = options.tracker.acceptSemanticSentenceMatch({
        sentenceId: topMatch.sentenceId,
        transcript: options.result.text,
        similarity: topMatch.similarity,
        atMs: options.result.timestampMs[1]
      });
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

  return {
    start,
    enterSlide,
    acceptResult,
    setAdviceState,
    stop,
    getState
  };
}

export function buildBiasPhrasesForSlide(
  slide: P3RehearsalSessionSlide,
  config: SpeechTrackingConfigOverride = {}
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
      case "coverage-updated":
      case "last-sentence-spoken":
        break;
    }
  }
}
