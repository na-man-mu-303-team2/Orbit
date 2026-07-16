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
    repairReasonCodes: ["CONTENT_CAPACITY" as const],
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

  it("renders evidence and speaker notes from the same safe plan", () => {
    const evidence = renderToStaticMarkup(
      <StoryPlanReviewView
        activeTab="evidence"
        onApprove={() => undefined}
        onCancel={() => undefined}
        onRegenerate={() => undefined}
        onTabChange={() => undefined}
        response={response}
      />,
    );
    const notes = renderToStaticMarkup(
      <StoryPlanReviewView
        activeTab="notes"
        onApprove={() => undefined}
        onCancel={() => undefined}
        onRegenerate={() => undefined}
        onTabChange={() => undefined}
        response={response}
      />,
    );

    expect(evidence).toContain("공식 안내 · 웹 자료");
    expect(notes).toContain("발표자 노트");
  });

  it.each(["approved", "cancelled", "failed"] as const)(
    "disables every mutation action in the %s state",
    (status) => {
      const html = renderToStaticMarkup(
        <StoryPlanReviewView
          activeTab="flow"
          onApprove={() => undefined}
          onCancel={() => undefined}
          onRegenerate={() => undefined}
          onTabChange={() => undefined}
          response={{ ...response, status }}
        />,
      );

      expect(html.match(/ disabled=""/g)).toHaveLength(3);
    },
  );

  it("disables only regeneration when the five-attempt limit is exhausted", () => {
    const html = renderToStaticMarkup(
      <StoryPlanReviewView
        activeTab="flow"
        onApprove={() => undefined}
        onCancel={() => undefined}
        onRegenerate={() => undefined}
        onTabChange={() => undefined}
        response={{
          ...response,
          plan: { ...response.plan, regenerationCount: 5 },
        }}
      />,
    );

    expect(html.match(/ disabled=""/g)).toHaveLength(1);
  });

  it.each([
    ["cancelled", "생성이 취소되었습니다."],
    ["failed", "구성을 만들지 못했습니다."],
  ] as const)("renders the terminal %s state without a plan", (status, copy) => {
    const html = renderToStaticMarkup(
      <StoryPlanReviewView
        activeTab="flow"
        onApprove={() => undefined}
        onCancel={() => undefined}
        onRegenerate={() => undefined}
        onTabChange={() => undefined}
        response={{ ...response, status, plan: null }}
      />,
    );

    expect(html).toContain(copy);
  });
});
