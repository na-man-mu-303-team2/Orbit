import { createDemoDeck } from "@orbit/editor-core";
import type { SlideQuestionGuide } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  getAdjacentQuestionId,
  getInitialQuestionId,
  OfficialSourceLinks,
  SlideQuestionGuidePanel,
  SlideQuestionGuideCarousel,
} from "./SlideQuestionGuidePanel";

const source = {
  kind: "web" as const,
  sourceId: "web:official-1",
  url: "https://example.edu/program",
  title: "공식 교육과정 안내",
  authority: "official" as const,
  contentHash: "b".repeat(64),
  retrievedAt: "2026-07-17T00:00:00.000Z",
};

describe("SlideQuestionGuidePanel official sources", () => {
  it("상단 설명 없이 질문 생성 액션과 질문 영역을 위로 배치한다", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(
      <SlideQuestionGuidePanel
        deck={deck}
        flushPendingSaves={vi.fn()}
        projectId={deck.projectId}
        slide={deck.slides[0] ?? null}
      />,
    );

    expect(html).toContain("질문 생성");
    expect(html).toContain("redesign-button-primary");
    expect(html).not.toContain("현재 슬라이드 예상 질문");
    expect(html).not.toContain("검증된 공식 웹사이트에 근거한 질문 3개");
    expect(html).not.toContain("공식 웹 근거를 찾지 못해");
  });

  it("renders a visible, clickable official citation", () => {
    const html = renderToStaticMarkup(<OfficialSourceLinks sources={[source]} />);

    expect(html).toContain("공식 출처");
    expect(html).toContain("공식 교육과정 안내");
    expect(html).toContain('href="https://example.edu/program"');
    expect(html).toContain('target="_blank"');
  });

  it("shows one question and answer with previous and next arrows", () => {
    const guide = {
      items: [
        question("question-1", "첫 번째 예상 질문", "첫 번째 추천 답변"),
        question("question-2", "두 번째 예상 질문", "두 번째 추천 답변"),
        question("question-3", "세 번째 예상 질문", "세 번째 추천 답변"),
      ],
    } as unknown as SlideQuestionGuide;

    const html = renderToStaticMarkup(
      <SlideQuestionGuideCarousel
        guide={guide}
        selectedQuestionId="question-1"
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("첫 번째 예상 질문");
    expect(html).toContain("첫 번째 추천 답변");
    expect(html).not.toContain("두 번째 예상 질문");
    expect(html).not.toContain("세 번째 예상 질문");
    expect(html).toContain('aria-label="이전 질문"');
    expect(html).toContain('aria-label="다음 질문"');
    expect(html).toContain("1 / 3");
    expect(html).toContain("disabled");
  });

  it("새로 생성한 질문은 첫 번째 질문부터 선택한다", () => {
    const guide = {
      items: [
        question("question-1", "첫 번째 예상 질문", "첫 번째 추천 답변"),
        question("question-2", "두 번째 예상 질문", "두 번째 추천 답변"),
      ],
    } as unknown as SlideQuestionGuide;

    expect(getInitialQuestionId(guide)).toBe("question-1");
    expect(getInitialQuestionId(null)).toBeNull();

    const html = renderToStaticMarkup(
      <SlideQuestionGuideCarousel
        guide={guide}
        selectedQuestionId={getInitialQuestionId(guide)}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("첫 번째 예상 질문");
    expect(html).not.toContain("두 번째 예상 질문");
    expect(html).toContain("1 / 2");
  });

  it("moves only to an adjacent question and stops at both ends", () => {
    const guide = {
      items: [
        question("question-1", "첫 번째 예상 질문", "첫 번째 추천 답변"),
        question("question-2", "두 번째 예상 질문", "두 번째 추천 답변"),
        question("question-3", "세 번째 예상 질문", "세 번째 추천 답변"),
      ],
    } as unknown as SlideQuestionGuide;

    expect(getAdjacentQuestionId(guide, "question-1", 1)).toBe("question-2");
    expect(getAdjacentQuestionId(guide, "question-2", -1)).toBe("question-1");
    expect(getAdjacentQuestionId(guide, "question-1", -1)).toBeNull();
    expect(getAdjacentQuestionId(guide, "question-3", 1)).toBeNull();
  });
});

function question(questionId: string, questionText: string, summary: string) {
  return {
    questionId,
    questionText,
    supportState: "grounded",
    keyConcepts: [],
    suggestedAnswer: {
      summary,
      structure: ["핵심 내용을 설명합니다."],
      caveats: [],
    },
    remediation: null,
    sourceRefs: [],
  };
}
