import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  hasUnsavedStoryScripts,
  moveStorySlideOrder,
  StoryPlanReviewView,
  storyReviewJobFailureMessage,
  storyGenerationPath,
  storyPlanPath,
  storyPlanRegenerationPollingKey,
  storyStyleColorPath,
} from "./StoryPlanReviewPage";

const response = {
  jobId: "job-1",
  projectId: "project-1",
  status: "review-pending" as const,
  styleContext: { topic: "ORBIT", tone: "professional" as const },
  plan: {
    revision: 2,
    regenerationCount: 1,
    regenerationLimit: 5 as const,
    outline: { title: "ORBIT", slideTitles: ["핵심"] },
    totalSeconds: 60,
    slideCount: 1,
    generatedAt: "2026-07-16T00:00:00.000Z",
    qualityWarnings: [
      { code: "RESEARCH_PARTIAL" as const, message: "일부 확인 필요" },
    ],
    repairReasonCodes: ["CONTENT_CAPACITY" as const],
    slides: [
      {
        order: 1,
        sourceOrder: 1,
        slideType: "summary",
        title: "핵심",
        message: "핵심 메시지",
        speakerNotes: "발표자 대본",
        targetSeconds: 60,
        sourceState: "attention" as const,
        sources: [
          {
            title: "사용자 입력",
            type: "topic" as const,
            authority: "unknown" as const,
          },
          {
            title: "공식 안내",
            type: "web" as const,
            authority: "official" as const,
          },
          {
            title: "참고 문서",
            type: "uploaded" as const,
            authority: "unknown" as const,
          },
        ],
      },
    ],
  },
  error: null,
};

const callbacks = {
  onApprove: () => undefined,
  onCancel: () => undefined,
  onRegenerate: () => undefined,
  onReorder: () => undefined,
  onSaveScript: () => undefined,
  onScriptChange: () => undefined,
  onStoryChange: () => undefined,
  onTabChange: () => undefined,
};

function renderView(activeTab: "outline" | "script", current = response) {
  return renderToStaticMarkup(
    <StoryPlanReviewView
      {...callbacks}
      activeTab={activeTab}
      response={current}
      scriptDrafts={{ 1: "발표자 대본" }}
    />,
  );
}

describe("StoryPlanReviewView", () => {
  it("shows only the outline tab", () => {
    const html = renderView("outline");

    expect(html).toContain("목차");
    expect(html).not.toContain("대본");
  });

  it("builds the production Story Review route", () => {
    expect(storyPlanPath("project 1", "job/1")).toBe(
      "/project/project%201/story-plan/job%2F1",
    );
    expect(storyStyleColorPath("project 1", "job/1")).toBe(
      "/project/project%201/style-color/job%2F1",
    );
    expect(storyGenerationPath("project 1", "job/1")).toBe(
      "/project/project%201/generation/job%2F1",
    );
  });

  it("continues to Style & Color before generation approval", () => {
    const html = renderView("outline");

    expect(html).toContain("스타일 선택");
    expect(html).toContain("다음 단계에서 폰트와 컬러를 선택합니다.");
  });

  it("renders editable slide titles and core messages", () => {
    const html = renderView("outline");

    expect(html).toContain('aria-label="1번 슬라이드 제목"');
    expect(html).toContain('aria-label="1번 슬라이드 핵심 메시지"');
  });

  it("restarts polling when regeneration begins", () => {
    expect(storyPlanRegenerationPollingKey(response)).toBeUndefined();
    expect(
      storyPlanRegenerationPollingKey({ ...response, status: "regenerating" }),
    ).toBe(response.plan.regenerationCount);
  });

  it("treats only changed script drafts as unsaved", () => {
    const slides = response.plan.slides;

    expect(hasUnsavedStoryScripts(slides, {})).toBe(false);
    expect(hasUnsavedStoryScripts(slides, { 1: slides[0]!.speakerNotes })).toBe(
      false,
    );
    expect(hasUnsavedStoryScripts(slides, { 1: "수정한 대본" })).toBe(true);
  });

  it("explains a final generation failure caused by the daily image budget", () => {
    expect(
      storyReviewJobFailureMessage({
        error: {
          code: "GENERATE_DECK_QUALITY_GATE_FAILED",
          message: "Deck quality gate failed.",
        },
        message: "AI PPT generation failed.",
        result: {
          warnings: [
            "Daily image asset budget retained remaining placeholders.",
          ],
        },
      }),
    ).toContain("AI 이미지 일일 생성 한도");
  });

  it("moves the dragged slide to the dropped position", () => {
    expect(moveStorySlideOrder([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
    expect(moveStorySlideOrder([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
  });

  it.each([
    ["cancelled", "생성이 취소되었습니다.", null],
    ["failed", "구성을 만들지 못했습니다.", "이야기 구성을 만들지 못했습니다."],
  ] as const)(
    "renders the terminal %s state without a plan",
    (status, copy, errorMessage) => {
      const html = renderToStaticMarkup(
        <StoryPlanReviewView
          {...callbacks}
          activeTab="outline"
          response={{
            ...response,
            status,
            plan: null,
            error: errorMessage
              ? { code: "PYTHON_WORKER_PLANNING_FAILED", message: errorMessage }
              : null,
          }}
          scriptDrafts={{}}
        />,
      );

      expect(html).toContain(copy);
      if (errorMessage) expect(html).toContain(errorMessage);
    },
  );
});
