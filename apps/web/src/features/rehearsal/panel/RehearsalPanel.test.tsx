import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ExtractedSentence, SpeechTrackerSnapshot } from "../speech/speechTrackingEvents";
import type { RehearsalTimingSnapshot, TimingAdviceState } from "./rehearsalTiming";
import { RehearsalPanel } from "./RehearsalPanel";

describe("RehearsalPanel", () => {
  it("renders rehearsal timers, keyword state, script state, and advice", () => {
    const html = renderPanel({ mode: "rehearsal" });

    expect(html).toContain("남은 시간");
    expect(html).toContain("04:30");
    expect(html).toContain("현재 슬라이드");
    expect(html).toContain("00:50 / 00:45");
    expect(html).toContain("생성형 AI");
    expect(html).toContain("체크됨");
    expect(html).toContain("다음 문장은 매칭할 수 없습니다.");
    expect(html).toContain("매칭 제외");
    expect(html).toContain("말 속도");
    expect(html).toContain("빠름");
    expect(html).toContain("슬라이드 시간 초과");
  });

  it("hides rehearsal-only advice in live mode without adding a mode toggle", () => {
    const html = renderPanel({ mode: "live" });

    expect(html).toContain("남은 시간");
    expect(html).toContain("생성형 AI");
    expect(html).not.toContain("말 속도");
    expect(html).not.toContain("슬라이드 시간 초과");
    expect(html).not.toContain("리허설");
    expect(html).not.toContain("실전");
  });

  it("does not render transcript text in the default panel DOM", () => {
    const html = renderPanel({
      transcriptText: "이 문장은 STT 전사라 기본 패널에 나오면 안 됩니다"
    });

    expect(html).not.toContain("이 문장은 STT 전사");
    expect(html).not.toContain("transcript");
  });

  it("marks the script region as non auto-scrolling", () => {
    const html = renderPanel();

    expect(html).toContain('data-auto-scroll="false"');
  });
});

function renderPanel(
  overrides: {
    mode?: "rehearsal" | "live";
    transcriptText?: string;
  } = {}
) {
  return renderToStaticMarkup(
    <RehearsalPanel
      mode={overrides.mode ?? "rehearsal"}
      timing={timing}
      wordsPerMinute={140}
      adviceState={adviceState}
      keywords={keywords}
      sentences={sentences}
      snapshot={snapshot}
    />
  );
}

const timing: RehearsalTimingSnapshot = {
  deckTargetSeconds: 600,
  elapsedSeconds: 330,
  remainingSeconds: 270,
  currentSlideElapsedSeconds: 50,
  currentSlideTargetSeconds: 45,
  currentSlideOvertime: true
};

const adviceState: TimingAdviceState = {
  pace: "too-fast",
  slideOvertime: true
};

const keywords = [
  {
    keywordId: "kw_ai",
    text: "생성형 AI"
  },
  {
    keywordId: "kw_privacy",
    text: "프라이버시"
  }
];

const sentences: ExtractedSentence[] = [
  {
    sentenceId: "sentence_1",
    text: "첫 문장은 이미 말했습니다.",
    index: 0,
    isFinalTrigger: false,
    matchable: true,
    candidates: []
  },
  {
    sentenceId: "sentence_2",
    text: "다음 문장은 매칭할 수 없습니다.",
    index: 1,
    isFinalTrigger: false,
    matchable: false,
    candidates: []
  },
  {
    sentenceId: "sentence_3",
    text: "마지막 문장입니다.",
    index: 2,
    isFinalTrigger: true,
    matchable: true,
    candidates: []
  }
];

const snapshot: SpeechTrackerSnapshot = {
  slideId: "slide_1",
  coveredSentenceIds: ["sentence_1"],
  matchableSentenceCount: 2,
  sentenceCoverage: 0.5,
  wordCoverage: 0.45,
  effectiveCoverage: 0.49,
  finalSentenceSpoken: false,
  hitKeywordIds: ["kw_ai"],
  provisionalMissingKeywordIds: ["kw_privacy"]
};
