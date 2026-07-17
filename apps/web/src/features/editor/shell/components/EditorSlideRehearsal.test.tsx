import { createDemoDeck } from "@orbit/editor-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EditorSlideRehearsalState } from "../hooks/useEditorSlideRehearsal";
import {
  createEditorSlideRehearsalScriptProgress,
  EditorSlideRehearsalBottomPanel,
  EditorSlideRehearsalLeftPanel,
  EditorSlideRehearsalRightPanel,
  formatRehearsalTime
} from "./EditorSlideRehearsal";

const listeningState: EditorSlideRehearsalState = {
  activeSlideId: "slide_1",
  audioLevelPercent: 48,
  elapsedSeconds: 65,
  engineId: "web-speech",
  errorMessage: null,
  finalTranscript: "발표를 시작합니다",
  hitKeywordIds: ["kw_1"],
  interimTranscript: "현재 슬라이드는",
  status: "listening"
};

describe("EditorSlideRehearsal", () => {
  it("하단에 실시간 인식 상태와 연습 종료 동작을 표시한다", () => {
    const slide = createDemoDeck().slides[0]!;
    const html = renderToStaticMarkup(
      <EditorSlideRehearsalBottomPanel
        onRestart={vi.fn()}
        onStop={vi.fn()}
        slide={slide}
        state={{ ...listeningState, activeSlideId: slide.slideId }}
      />
    );

    expect(html).toContain("음성 인식");
    expect(html).toContain("인식 중");
    expect(html).toContain("01:05");
    expect(html).toContain('aria-label="슬라이드 연습 종료"');
    expect(html).toContain("연습 종료");
    expect(html).toContain('aria-label="발표 대본 프롬프터"');
    expect(html).toContain("rehearsal-teleprompter-current");
    expect(html).toContain('data-auto-scroll="true"');
  });

  it("중지된 연습을 다시 시작하는 동작을 표시한다", () => {
    const slide = createDemoDeck().slides[0]!;
    const html = renderToStaticMarkup(
      <EditorSlideRehearsalBottomPanel
        onRestart={vi.fn()}
        onStop={vi.fn()}
        slide={slide}
        state={{
          ...listeningState,
          activeSlideId: slide.slideId,
          status: "stopped"
        }}
      />
    );

    expect(html).toContain('aria-label="슬라이드 연습 시작"');
    expect(html).toContain("연습 시작");
  });

  it("오른쪽 패널에 현재 슬라이드와 체크포인트를 표시한다", () => {
    const slide = createDemoDeck().slides[0]!;
    const html = renderToStaticMarkup(
      <EditorSlideRehearsalRightPanel
        onRestart={vi.fn()}
        onStop={vi.fn()}
        slide={slide}
        state={{
          ...listeningState,
          activeSlideId: slide.slideId,
          hitKeywordIds: slide.keywords[0] ? [slide.keywords[0].keywordId] : []
        }}
      />
    );

    expect(html).toContain("CURRENT SLIDE");
    expect(html).toContain(slide.title);
    expect(html).toContain("발표 체크포인트");
    expect(html).not.toContain("연습 시간");
    expect(html).not.toContain("음성 엔진");
    expect(html).not.toContain("Web Speech");
  });

  it("에디터 왼쪽 패널에 리허설 안내를 표시한다", () => {
    const slide = createDemoDeck().slides[0]!;
    const html = renderToStaticMarkup(
      <EditorSlideRehearsalLeftPanel
        onResizeStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
        slide={slide}
        state={{ ...listeningState, activeSlideId: slide.slideId }}
      />
    );

    expect(html).toContain("editor-slide-rehearsal-left-pane");
    expect(html).toContain("슬라이드 리허설");
    expect(html).toContain("발표 체크포인트");
    expect(html).toContain('aria-label="리허설 패널 크기 조정"');
  });

  it("경과 시간을 분:초 형식으로 만든다", () => {
    expect(formatRehearsalTime(0)).toBe("00:00");
    expect(formatRehearsalTime(125)).toBe("02:05");
  });

  it("확정된 음성에 맞춰 다음 대본 문장으로 진행한다", () => {
    const slide = createDemoDeck().slides[0]!;
    slide.speakerNotes =
      "첫 번째 핵심 내용을 차분하게 설명합니다. 두 번째 비교 결과를 이어서 설명합니다.";

    const progress = createEditorSlideRehearsalScriptProgress({
      finalTranscript: "첫 번째 핵심 내용을 차분하게 설명합니다",
      interimTranscript: "",
      slide
    });

    expect(progress.progressPercent).toBe(50);
    expect(progress.rows.map((row) => row.status)).toEqual([
      "covered",
      "current"
    ]);
    expect(progress.focusSentenceId).toBe("sentence_2");
  });
});
