import { describe, expect, it, vi } from "vitest";

import { LiveSttError, type LiveSttPort, type LiveSttResult } from "../stt/liveSttPort";
import {
  createP3RehearsalSession,
  type P3RehearsalSessionSlide
} from "./p3RehearsalSession";
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
      biasPhrases: expect.arrayContaining(["다음 슬라이드", "생성형 AI"])
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
      adviceEvents: []
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
