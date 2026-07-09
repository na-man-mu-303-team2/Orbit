import { describe, expect, it, vi } from "vitest";

import { LiveSttError, type LiveSttPort, type LiveSttResult } from "../stt/liveSttPort";
import {
  createP3RehearsalSession,
  type P3RehearsalSessionSlide
} from "./p3RehearsalSession";
import type { SemanticUtteranceDebugState } from "./semanticSpeechDebug";
import type { SemanticUtteranceDecision } from "./semanticUtteranceDecision";
import type {
  SemanticUtteranceMatcher,
  SemanticUtteranceMatch
} from "./semanticUtteranceMatcher";
import type { SpeechTrackingEvent } from "./speechTrackingEvents";

describe("p3RehearsalSession", () => {
  it("does not commit timer, tracker, or log state when STT start fails", async () => {
    const port = createMockLiveSttPort({
      start: vi.fn(async () => {
        throw new LiveSttError("start_failed", "start failed");
      })
    });
    const session = createP3RehearsalSession({
      slides,
      port,
      now: () => 1_000
    });

    await expect(
      session.start({
        audioSource: {} as MediaStream,
        slideIndex: 0
      })
    ).rejects.toThrow("start failed");

    expect(session.getState()).toEqual({
      status: "failed",
      slideIndex: 0,
      startedAtMs: null,
      slideEnteredAtMs: null,
      snapshot: null,
      finalSegments: [],
      runMeta: null
    });
  });

  it("starts Live STT with current slide bias phrases before exposing running state", async () => {
    const port = createMockLiveSttPort();
    const session = createP3RehearsalSession({
      slides,
      port,
      now: () => 2_000
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });

    expect(port.start).toHaveBeenCalledWith({
      language: "ko",
      audioSource: {},
      biasPhrases: expect.arrayContaining([
        expect.objectContaining({
          text: "다음 슬라이드",
          weight: 1,
          source: "control-phrase"
        }),
        expect.objectContaining({
          text: "생성형 AI",
          weight: 0.94,
          source: "keyword",
          keywordId: "kw_ai",
          canonicalText: "생성형 AI"
        })
      ])
    });
    expect(session.getState()).toMatchObject({
      status: "running",
      slideIndex: 0,
      startedAtMs: 2_000,
      slideEnteredAtMs: 2_000
    });
    expect(session.getState().runMeta?.slideTimeline).toBeUndefined();
  });

  it("tracks final transcript events and finalizes meta without transcript text", async () => {
    const port = createMockLiveSttPort();
    const events: SpeechTrackingEvent[] = [];
    const session = createP3RehearsalSession({
      slides,
      port,
      now: createNow([10_000, 12_000, 20_000]),
      onEvents: (nextEvents) => events.push(...nextEvents)
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });

    port.emit({
      text: "생성형 AI 초안을 안정적으로 추적합니다.",
      isFinal: false,
      timestampMs: [100, 900]
    });
    port.emit({
      text: "생성형 AI 초안을 안정적으로 추적합니다. 마지막으로 개인정보를 보호합니다.",
      isFinal: true,
      timestampMs: [1_000, 2_000]
    });

    expect(events.map((event) => event.type)).toEqual([
      "sentence-covered",
      "coverage-updated",
      "sentence-covered",
      "last-sentence-spoken",
      "keyword-hit",
      "coverage-updated"
    ]);
    expect(session.getState().snapshot).toMatchObject({
      slideId: "slide_1",
      finalSentenceSpoken: true,
      hitKeywordIds: ["kw_ai"]
    });

    const meta = await session.stop();

    expect(meta).toEqual({
      slideTimeline: [
        {
          slideId: "slide_1",
          enteredAt: new Date(10_000).toISOString()
        }
      ],
      missedKeywords: [
        {
          slideId: "slide_2",
          keywordId: "kw_privacy"
        }
      ],
      adviceEvents: [],
      utteranceOutcomes: [
        {
          kind: "covered",
          slideId: "slide_1",
          sentenceId: "sentence_1",
          at: new Date(10_000).toISOString()
        },
        {
          kind: "covered",
          slideId: "slide_1",
          sentenceId: "sentence_2",
          at: new Date(10_000).toISOString()
        },
        {
          kind: "missed",
          slideId: "slide_2",
          sentenceId: "sentence_1"
        }
      ]
    });
    expect(JSON.stringify(meta)).not.toContain("생성형 AI 초안");
    expect(JSON.stringify(meta)).not.toContain("speakerNotes");
  });

  it("records provisional missing on slide exit and keeps slide keyword hits across revisit", async () => {
    const port = createMockLiveSttPort();
    const events: SpeechTrackingEvent[] = [];
    const session = createP3RehearsalSession({
      slides,
      port,
      now: createNow([30_000, 31_000, 32_000, 33_000]),
      onEvents: (nextEvents) => events.push(...nextEvents)
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });
    port.emit({
      text: "생성형 AI",
      isFinal: true,
      timestampMs: [1_000, 1_500]
    });
    session.enterSlide(1);
    session.enterSlide(0);

    expect(
      events.filter((event) => event.type === "keyword-missing")
    ).toMatchObject([
      {
        type: "keyword-missing",
        slideId: "slide_2",
        keywordId: "kw_privacy",
        provisional: true
      }
    ]);
    expect(session.getState().snapshot?.hitKeywordIds).toEqual(["kw_ai"]);
    expect(port.updateBiasPhrases).toHaveBeenCalled();
  });

  it("passes slide control phrases to the tracker extraction path", async () => {
    const port = createMockLiveSttPort();
    const session = createP3RehearsalSession({
      slides: [
        {
          slideId: "slide_control",
          speakerNotes: "다음 슬라이드. 제품 가치를 설명합니다.",
          keywords: [],
          controlPhrases: ["다음 슬라이드"]
        }
      ],
      port,
      now: () => 40_000
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });

    port.emit({
      text: "다음 슬라이드",
      isFinal: true,
      timestampMs: [0, 500]
    });

    expect(session.getState().snapshot).toMatchObject({
      matchableSentenceCount: 1,
      sentenceCoverage: 0,
      effectiveCoverage: 0
    });
  });

  it("finalizes active advice state into local run meta", async () => {
    const port = createMockLiveSttPort();
    const session = createP3RehearsalSession({
      slides,
      port,
      now: createNow([50_000, 51_000])
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });

    session.setAdviceState("pace-too-fast", true);
    session.setAdviceState("slide-overtime", true);

    const meta = await session.stop();

    expect(meta.adviceEvents.map((event) => event.type)).toEqual([
      "pace-too-fast",
      "slide-overtime"
    ]);
  });

  it("start와 slide enter에서 semantic slide index를 준비한다", async () => {
    const port = createMockLiveSttPort();
    const semanticMatcher = createMockSemanticMatcher({ accepted: false });
    const session = createP3RehearsalSession({
      slides,
      port,
      semanticMatcher,
      now: createNow([60_000, 61_000])
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });
    session.enterSlide(1);
    await flushSemanticQueue();

    expect(semanticMatcher.prepareSlide).toHaveBeenCalledWith({
      slideId: "slide_1",
      speakerNotes: slides[0].speakerNotes
    });
    expect(semanticMatcher.prepareSlide).toHaveBeenCalledWith({
      slideId: "slide_2",
      speakerNotes: slides[1].speakerNotes
    });
  });

  it("partial STT는 semantic matcher에 넣지 않고 final STT top 3만 debug에 반영한다", async () => {
    const port = createMockLiveSttPort();
    const debugStates: SemanticUtteranceDebugState[] = [];
    const semanticMatcher = createMockSemanticMatcher({
      accepted: true,
      topMatches: [semanticMatch({ rank: 1, sentenceId: "sentence_1" })]
    });
    const session = createP3RehearsalSession({
      slides,
      port,
      semanticMatcher,
      isSemanticMatchingEnabled: () => false,
      now: () => 70_000,
      onSemanticDebugState: (state) => debugStates.push(state)
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });
    port.emit({ text: "partial text", isFinal: false, timestampMs: [0, 500] });
    port.emit({ text: "semantic final text", isFinal: true, timestampMs: [500, 1000] });
    await flushSemanticQueue();

    expect(semanticMatcher.matchFinalTranscript).toHaveBeenCalledTimes(1);
    expect(semanticMatcher.matchFinalTranscript).toHaveBeenCalledWith({
      slideId: "slide_1",
      transcript: "semantic final text",
      coveredSentenceIds: expect.any(Set)
    });
    expect(debugStates.at(-1)).toMatchObject({
      status: "ready",
      slideId: "slide_1",
      transcript: "semantic final text",
      isFinal: true,
      topMatches: [expect.objectContaining({ rank: 1, sentenceId: "sentence_1" })],
      error: null
    });
    expect(session.getState().snapshot).toMatchObject({
      sentenceCoverage: 0,
      finalSentenceSpoken: false
    });
  });

  it("semantic toggle on일 때 accepted final transcript를 coverage에 반영한다", async () => {
    const port = createMockLiveSttPort();
    const events: SpeechTrackingEvent[] = [];
    const semanticMatcher = createMockSemanticMatcher({
      accepted: true,
      topMatches: [semanticMatch({ rank: 1, sentenceId: "sentence_1" })]
    });
    const session = createP3RehearsalSession({
      slides,
      port,
      semanticMatcher,
      isSemanticMatchingEnabled: () => true,
      now: () => 80_000,
      onEvents: (nextEvents) => events.push(...nextEvents)
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });
    port.emit({ text: "semantic final text", isFinal: true, timestampMs: [500, 1000] });
    await flushSemanticQueue();

    expect(events).toContainEqual({
      type: "sentence-covered",
      slideId: "slide_1",
      sentenceId: "sentence_1",
      matchKind: "paraphrased",
      similarity: 0.82,
      lexicalOverlap: 0.2,
      atMs: 1000
    });
    expect(session.getState().snapshot).toMatchObject({
      sentenceCoverage: 0.5,
      finalSentenceSpoken: false
    });
  });

  it("semantic rejected ad-lib final transcript is recorded without changing coverage", async () => {
    const port = createMockLiveSttPort();
    const events: SpeechTrackingEvent[] = [];
    const semanticMatcher = createMockSemanticMatcher({
      accepted: false,
      topMatches: [semanticMatch({ rank: 1, sentenceId: "sentence_1", similarity: 0.87 })],
      decision: semanticDecision({
        transcript: "고객 사례를 하나 더 말씀드리겠습니다.",
        reason: "ad-lib",
        outcome: "ad-lib",
        accepted: false,
        acceptedMatch: null
      })
    });
    const session = createP3RehearsalSession({
      slides,
      port,
      semanticMatcher,
      isSemanticMatchingEnabled: () => true,
      now: createNow([85_000, 86_000]),
      onEvents: (nextEvents) => events.push(...nextEvents)
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });
    port.emit({
      text: "고객 사례를 하나 더 말씀드리겠습니다.",
      isFinal: true,
      timestampMs: [500, 1000]
    });
    await flushSemanticQueue();

    expect(events).toContainEqual({
      type: "ad-lib-detected",
      slideId: "slide_1",
      text: "고객 사례를 하나 더 말씀드리겠습니다.",
      nearestSentenceId: "sentence_1",
      similarity: 0.87,
      atMs: 1000
    });
    expect(session.getState().snapshot).toMatchObject({
      sentenceCoverage: 0
    });

    const meta = await session.stop();
    expect(meta.utteranceOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slideId: "slide_1",
          kind: "ad-lib",
          text: "고객 사례를 하나 더 말씀드리겠습니다.",
          sentenceId: "sentence_1",
          similarity: 0.87
        }),
        expect.objectContaining({
          slideId: "slide_1",
          kind: "missed",
          sentenceId: "sentence_1"
        })
      ])
    );
  });

  it("semantic matcher 실패 시 기존 substring 기반 tracking은 계속 동작한다", async () => {
    const port = createMockLiveSttPort();
    const events: SpeechTrackingEvent[] = [];
    const debugStates: SemanticUtteranceDebugState[] = [];
    const semanticMatcher = createMockSemanticMatcher({ accepted: false });
    semanticMatcher.matchFinalTranscript = vi.fn(async () => {
      throw new Error("semantic unavailable");
    });
    const session = createP3RehearsalSession({
      slides,
      port,
      semanticMatcher,
      isSemanticMatchingEnabled: () => true,
      now: () => 90_000,
      onEvents: (nextEvents) => events.push(...nextEvents),
      onSemanticDebugState: (state) => debugStates.push(state)
    });

    await session.start({
      audioSource: {} as MediaStream,
      slideIndex: 0
    });
    port.emit({
      text: "생성형 AI 초안을 안정적으로 추적합니다.",
      isFinal: true,
      timestampMs: [500, 1000]
    });
    await flushSemanticQueue();

    expect(events).toContainEqual({
      type: "sentence-covered",
      slideId: "slide_1",
      sentenceId: "sentence_1",
      matchKind: "covered",
      atMs: 1000
    });
    expect(debugStates.at(-1)).toMatchObject({
      status: "error",
      slideId: "slide_1",
      transcript: "생성형 AI 초안을 안정적으로 추적합니다.",
      error: "semantic unavailable"
    });
    expect(session.getState().snapshot).toMatchObject({
      sentenceCoverage: 0.5
    });
  });
});

const slides: P3RehearsalSessionSlide[] = [
  {
    slideId: "slide_1",
    speakerNotes:
      "생성형 AI 초안을 안정적으로 추적합니다. 마지막으로 개인정보를 보호합니다.",
    keywords: [
      {
        keywordId: "kw_ai",
        text: "생성형 AI",
        synonyms: [],
        abbreviations: ["AI"]
      }
    ],
    controlPhrases: ["다음 슬라이드"],
    legacyPhrases: ["레거시 본문"]
  },
  {
    slideId: "slide_2",
    speakerNotes: "프라이버시 기준을 설명합니다.",
    keywords: [
      {
        keywordId: "kw_privacy",
        text: "프라이버시",
        synonyms: ["개인정보"],
        abbreviations: []
      }
    ],
    controlPhrases: ["다음 슬라이드"]
  }
];

function createMockLiveSttPort(overrides: Partial<LiveSttPort> = {}) {
  const resultSubscribers = new Set<(result: LiveSttResult) => void>();
  const errorSubscribers = new Set<(error: LiveSttError) => void>();
  const port = {
    engineId: "sherpa",
    capabilities: {
      onDevice: true,
      streaming: true,
      keywordBiasing: true,
      languages: ["ko"]
    },
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    updateBiasPhrases: vi.fn(),
    onResult: vi.fn((cb: (result: LiveSttResult) => void) => {
      resultSubscribers.add(cb);
      return () => resultSubscribers.delete(cb);
    }),
    onError: vi.fn((cb: (error: LiveSttError) => void) => {
      errorSubscribers.add(cb);
      return () => errorSubscribers.delete(cb);
    }),
    dispose: vi.fn(),
    emit(result: LiveSttResult) {
      for (const subscriber of resultSubscribers) {
        subscriber(result);
      }
    },
    emitError(error: LiveSttError) {
      for (const subscriber of errorSubscribers) {
        subscriber(error);
      }
    },
    ...overrides
  };

  return port as LiveSttPort & {
    emit: (result: LiveSttResult) => void;
    emitError: (error: LiveSttError) => void;
  };
}

function createNow(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

function createMockSemanticMatcher(options: {
  accepted: boolean;
  topMatches?: SemanticUtteranceMatch[];
  decision?: SemanticUtteranceDecision | null;
}): SemanticUtteranceMatcher {
  return {
    prepareSlide: vi.fn(async (input) => ({
      slideId: input.slideId,
      speakerNotesHash: input.speakerNotes,
      modelId: "Xenova/multilingual-e5-small" as const,
      dimensions: 384 as const,
      sentences: [],
      builtAtMs: 0
    })),
    matchFinalTranscript: vi.fn(async () => ({
      accepted: options.accepted,
      topMatches: options.topMatches ?? [],
      decision:
        options.decision ??
        (options.accepted
          ? semanticDecision({
              accepted: true,
              acceptedMatch: options.topMatches?.[0] ?? semanticMatch({}),
              reason: "accepted-paraphrase",
              outcome: "paraphrased"
            })
          : null)
    }))
  };
}

function semanticMatch(
  override: Partial<SemanticUtteranceMatch>
): SemanticUtteranceMatch {
  return {
    rank: 1,
    sentenceId: "sentence_1",
    sentenceIndex: 0,
    text: "Semantic sentence.",
    similarity: 0.82,
    covered: false,
    ...override
  };
}

function semanticDecision(
  override: Partial<SemanticUtteranceDecision>
): SemanticUtteranceDecision {
  const topMatches = [semanticMatch({ similarity: 0.87 })];
  return {
    accepted: false,
    slideId: "slide_1",
    transcript: "semantic final text",
    isFinal: true,
    topMatches,
    acceptedMatch: null,
    reason: "ad-lib",
    outcome: "ad-lib",
    scoreThreshold: 0.89,
    ambiguousMargin: 0.04,
    lexicalOverlap: 0.2,
    ...override
  };
}

async function flushSemanticQueue() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
