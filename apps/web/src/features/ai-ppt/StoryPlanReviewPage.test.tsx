import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StoryPlanReviewView, storyPlanPath } from "./StoryPlanReviewPage";

const response = {
  jobId: "job-1",
  projectId: "project-1",
  status: "review-pending" as const,
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
    repairReasonCodes: ["CONTENT_CAPACITY"],
    slides: [
      {
        order: 1,
        slideType: "summary",
        title: "핵심",
        message: "핵심 메시지",
        speakerNotes: "발표자 노트",
        targetSeconds: 60,
        sourceState: "attention" as const,
        sources: [
          { title: "공식 안내", type: "web" as const, authority: "official" as const },
        ],
      },
    ],
  },
  error: null,
};

describe("StoryPlanReviewView", () => {
  it("renders the selected concept copy and safe review actions", () => {
    const html = renderToStaticMarkup(
      <StoryPlanReviewView
        activeTab="flow"
        onApprove={() => undefined}
        onCancel={() => undefined}
        onRegenerate={() => undefined}
        onTabChange={() => undefined}
        response={response}
      />,
    );

    expect(html).toContain("이야기 구성을 확인하세요.");
    expect(html).toContain("다른 구성 제안받기");
    expect(html).toContain("이 구성으로 생성");
    expect(html).toContain("일부 확인 필요");
    expect(html).not.toContain("검증됨");
  });

  it("builds the production Story Review route", () => {
    expect(storyPlanPath("project 1", "job/1")).toBe(
      "/project/project%201/story-plan/job%2F1",
    );
  });
});
