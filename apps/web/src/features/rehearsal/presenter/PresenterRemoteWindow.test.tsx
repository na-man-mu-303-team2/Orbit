import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import {
  applyPresenterRemoteMessage,
  getPresenterRemoteCurrentSentenceIndex,
  getPresenterRemoteCommandDispatchDelays,
  getPresenterRemoteKeywordRows,
  getPresenterRemoteNextSentenceIndex,
  getPresenterRemoteTimingState,
  splitPresenterRemoteNotes,
  PresenterRemoteWindow,
} from "./PresenterRemoteWindow";
import { createPresenterSlideshowState } from "./presenterStateStore";
import { createPresenterStateMessage } from "./presentationChannel";

vi.mock("./SlideshowRenderer", () => ({
  SlideshowRenderer: (props: { slideId: string }) => (
    <div data-slide-id={props.slideId}>Slide preview</div>
  ),
}));

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1",
};

describe("PresenterRemoteWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders presenter-only notes and remote controls", () => {
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={createPresenterSlideshowState(p0AnimationDeck)}
      />,
    );

    expect(html).toContain("발표자 제어");
    expect(html).toContain("대본");
    expect(html).toContain("현재 슬라이드");
    expect(html).toContain("다음 슬라이드");
    expect(html).toContain("타이머");
    expect(html).toContain("슬라이드 목표");
    expect(html).toContain("시작");
    expect(html).toContain("리셋");
    expect(html).toContain("핵심 키워드");
    expect(html).toContain("현재 큐");
    expect(html).toContain("첫 문장입니다");
    expect(html).toContain("이전");
    expect(html).toContain("다음");
    expect(html).toContain("팝업 가림");
    expect(html).toContain("발표 종료");
    expect(html).not.toContain("Partial transcript");
    expect(html).not.toContain("rawAudio");
  });

  it("splits presenter notes into cue rows", () => {
    expect(
      splitPresenterRemoteNotes("첫 문장입니다. 마지막 문장입니다."),
    ).toEqual(["첫 문장입니다", "마지막 문장입니다"]);
  });

  it("derives keyword cue status from the current slide step", () => {
    const slide = {
      ...p0AnimationDeck.slides[0]!,
      keywords: [
        {
          keywordId: "keyword_one",
          text: "첫 키워드",
          synonyms: [],
          abbreviations: [],
          required: true,
        },
        {
          keywordId: "keyword_two",
          text: "두 번째 키워드",
          synonyms: [],
          abbreviations: [],
          required: true,
        },
      ],
    };

    expect(getPresenterRemoteKeywordRows(slide, 1)).toEqual([
      {
        keywordId: "keyword_one",
        status: "done",
        text: "첫 키워드",
      },
      {
        keywordId: "keyword_two",
        status: "active",
        text: "두 번째 키워드",
      },
    ]);
  });

  it("uses presenter timing snapshots for the remote timer", () => {
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      timing: {
        canStartLiveStt: false,
        currentSlideElapsedSeconds: 25,
        currentSlideTargetSeconds: 60,
        displayedSeconds: 275,
        elapsedSeconds: 25,
        isLiveSttActive: true,
        isRunning: true,
        liveStatus: "listening",
        mode: "timer" as const,
        timerDurationSeconds: 300,
      },
    };
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={state}
      />,
    );

    expect(
      getPresenterRemoteTimingState(
        p0AnimationDeck,
        p0AnimationDeck.slides[0],
        state,
      ),
    ).toMatchObject({
      displayedSeconds: 275,
      isLiveSttActive: true,
      isRunning: true,
    });
    expect(html).toContain("4:35");
    expect(html).toContain("0:25");
    expect(html).toContain("1:00");
    expect(html).toContain("음성인식 중");
    expect(html).toContain("일시정지");
  });

  it("renders paused remote timer controls as resume", () => {
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      timing: {
        canStartLiveStt: false,
        currentSlideElapsedSeconds: 25,
        currentSlideTargetSeconds: 60,
        displayedSeconds: 275,
        elapsedSeconds: 25,
        isLiveSttActive: false,
        isPaused: true,
        isRunning: false,
        liveStatus: "stopped",
        mode: "timer" as const,
        timerDurationSeconds: 300,
      },
    };
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={state}
      />,
    );

    expect(html).toContain("일시정지됨");
    expect(html).toContain("다시 시작");
  });

  it("renders semantic debug panel from owner presenter speech state", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === "orbit.semanticSpeech.debugPanel" ? "1" : null,
      },
    });

    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={{
          ...createPresenterSlideshowState(p0AnimationDeck),
          speech: createPresenterSpeechState(),
        }}
      />,
    );

    expect(html).toContain("Semantic STT");
    expect(html).toContain("방금 final STT 문장");
    expect(html).toContain("#1 · 0.910 · 문장 1");
    expect(html).toContain("적용");
  });

  it("입력 순서와 무관하게 가장 높은 severity 한 개와 추가 개수만 표시한다", () => {
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={{
          ...createPresenterSlideshowState(p0AnimationDeck),
          speech: {
            ...createPresenterSpeechState(),
            semanticCapabilityItems: [
              {
                key: "semantic_runtime" as const,
                severity: "warning" as const,
                shortLabel: "의미 체크 오프라인",
                detail: "수동 발표는 계속할 수 있습니다.",
                retryable: true,
                affectedCount: 2,
                source: "system-status" as const,
                actionLabel: "재시도" as const,
                recovered: false,
                measurementMode: "none" as const
              },
              {
                key: "nli" as const,
                severity: "error" as const,
                shortLabel: "정밀 판정 비활성",
                detail: "기본 의미 체크로 계속합니다.",
                retryable: true,
                affectedCount: 1,
                source: "system-status" as const,
                recovered: false,
                measurementMode: "basic" as const
              }
            ]
          }
        }}
      />
    );

    expect(html).toContain('aria-label="발표자 시스템 상태"');
    expect(html).toContain("정밀 판정 비활성");
    expect(html).toContain("+1");
    expect(html).toContain("기본 의미 체크로 계속합니다.");
    expect(html).not.toContain("의미 체크 오프라인");
    expect(html).not.toContain("AI 코칭");
  });

  it("focuses the next uncovered script sentence from owner speech coverage", () => {
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      stepIndex: 0,
      speech: {
        ...createPresenterSpeechState(),
        coveredSentenceIds: ["sentence_1"],
      },
    };
    const sentences = ["첫 문장입니다", "마지막 문장입니다"];
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={state}
      />,
    );

    expect(getPresenterRemoteCurrentSentenceIndex(sentences, state)).toBe(1);
    expect(html).toContain("presenter-script-row--covered");
    expect(html).toContain("presenter-script-row--current");
  });

  it("marks the next remote script sentence after current", () => {
    const state = createPresenterSlideshowState(p0AnimationDeck);
    const sentences = ["첫 문장입니다", "둘째 문장입니다", "마지막 문장입니다"];

    expect(getPresenterRemoteNextSentenceIndex(sentences, state, 0)).toBe(1);
  });

  it("mirrors semantic paraphrase coverage from owner speech state", () => {
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      speech: {
        ...createPresenterSpeechState(),
        coveredSentenceIds: ["sentence_1"],
        coveredSentenceMatchKinds: {
          sentence_1: "paraphrased" as const,
        },
      },
    };
    const html = renderToStaticMarkup(
      <PresenterRemoteWindow
        deck={p0AnimationDeck}
        identity={identity}
        initialState={state}
      />,
    );

    expect(html).toContain("presenter-script-row--paraphrased");
    expect(html).toContain("체크됨");
  });

  it("retries idempotent remote timer pause commands across transient channel races", () => {
    expect(
      getPresenterRemoteCommandDispatchDelays({ action: "timer-pause" }),
    ).toEqual([0, 150, 500]);
    expect(
      getPresenterRemoteCommandDispatchDelays({ action: "timer-reset" }),
    ).toEqual([0, 150, 500]);
    expect(
      getPresenterRemoteCommandDispatchDelays({ action: "timer-start" }),
    ).toEqual([0]);
  });

  it("applies presenter state messages without replacing presenter-only deck data", () => {
    const initialState = createPresenterSlideshowState(p0AnimationDeck);
    const next = applyPresenterRemoteMessage(
      initialState,
      createPresenterStateMessage({
        identity,
        sentAt: 20,
        state: {
          ...initialState,
          slideId: "slide_p0_2",
          slideIndex: 1,
          stepIndex: 0,
        },
        triggerAnimationIds: [],
      }),
    );

    expect(next).toMatchObject({
      slideId: "slide_p0_2",
      slideIndex: 1,
      stepIndex: 0,
    });
  });
});

function createPresenterSpeechState() {
  return {
    coveredSentenceIds: [],
    coveredSentenceMatchKinds: {},
    matchableSentenceCount: 2,
    semanticDebug: {
      status: "ready" as const,
      slideId: "slide_p0_1",
      transcript: "방금 final STT 문장",
      isFinal: true,
      topMatches: [
        {
          rank: 1,
          sentenceId: "sentence_1",
          sentenceIndex: 0,
          text: "첫 문장입니다",
          similarity: 0.91,
          covered: false,
        },
      ],
      decision: {
        accepted: true,
        acceptedMatch: {
          rank: 1,
          sentenceId: "sentence_1",
          sentenceIndex: 0,
          text: "첫 문장입니다",
          similarity: 0.91,
          covered: false,
        },
        ambiguousMargin: 0.04,
        isFinal: true as const,
        lexicalOverlap: 0.2,
        outcome: "paraphrased" as const,
        reason: "accepted-paraphrase" as const,
        scoreThreshold: 0.89,
        slideId: "slide_p0_1",
        topMatches: [],
        transcript: "방금 final STT 문장",
      },
      error: null,
    },
    semanticMatchingEnabled: true,
    snapshot: {
      slideId: "slide_p0_1",
      coveredSentenceIds: [],
      coveredSentenceMatchKinds: {},
      matchableSentenceCount: 2,
      sentenceCoverage: 0,
      wordCoverage: 0,
      effectiveCoverage: 0,
      finalSentenceSpoken: false,
      hitKeywordIds: [],
      provisionalMissingKeywordIds: [],
    },
  };
}
