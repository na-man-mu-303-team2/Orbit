import type { SlideQuestionGuide } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getAdjacentQuestionId,
  OfficialSourceLinks,
  SlideQuestionGuideCarousel,
  SlideQuestionGuideResearchNotice,
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
  it("renders a visible, clickable official citation", () => {
    const html = renderToStaticMarkup(<OfficialSourceLinks sources={[source]} />);

    expect(html).toContain("공식 출처");
    expect(html).toContain("공식 교육과정 안내");
    expect(html).toContain('href="https://example.edu/program"');
    expect(html).toContain('target="_blank"');
  });

  it("explains when web research degrades to existing sources", () => {
    const guide = {
      schemaVersion: 2,
      research: {
        status: "unavailable",
        attempts: 2,
        officialSourceCount: 0,
        issueCodes: ["official-missing"],
        researchedAt: "2026-07-17T00:00:00.000Z",
      },
    } as unknown as SlideQuestionGuide;

    const html = renderToStaticMarkup(<SlideQuestionGuideResearchNotice guide={guide} />);

    expect(html).toContain("공식 웹 근거를 찾지 못해");
    expect(html).toContain("슬라이드와 승인 참고자료만 사용했습니다");
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
