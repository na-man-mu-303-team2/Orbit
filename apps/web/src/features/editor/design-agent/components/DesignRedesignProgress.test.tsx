import type { SlideRedesignProgressPayload } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesignRedesignProgress } from "./DesignRedesignProgress";

describe("DesignRedesignProgress", () => {
  it("renders the ordered stages and marks the current stage accessibly", () => {
    const html = renderToStaticMarkup(
      <DesignRedesignProgress
        progress={progress({
          stage: "coloring",
          completedStages: ["interpreting", "composing"],
        })}
      />,
    );

    expect(html).toContain('aria-label="슬라이드 리디자인 진행 상태"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("슬라이드를 읽는 중");
    expect(html).toContain("이미지를 준비하는 중");
    expect(html.match(/>완료</g)).toHaveLength(2);
  });

  it("marks an omitted illustrating stage as skipped", () => {
    const html = renderToStaticMarkup(
      <DesignRedesignProgress
        progress={progress({
          stage: "verifying",
          completedStages: [
            "interpreting",
            "composing",
            "coloring",
            "ornamenting",
          ],
        })}
      />,
    );

    expect(html).toMatch(
      /data-stage-state="skipped"[^>]*>.*이미지를 준비하는 중.*건너뜀/s,
    );
  });

  it("announces the intermediate preview as read-only without an apply action", () => {
    const html = renderToStaticMarkup(
      <DesignRedesignProgress
        connectionDegraded
        progress={progress({
          stage: "illustrating",
          completedStages: [
            "interpreting",
            "composing",
            "coloring",
            "ornamenting",
          ],
          previewProposal: proposal(),
        })}
      />,
    );

    expect(html).toContain("중간 미리보기가 준비되었습니다");
    expect(html).toContain("읽기 전용입니다");
    expect(html).toContain("주기적으로 확인하고 있습니다");
    expect(html).not.toContain(">적용<");
  });
});

function progress(
  overrides: Partial<SlideRedesignProgressPayload>,
): SlideRedesignProgressPayload {
  return {
    jobId: "job_redesign_1",
    projectId: "project_demo_1",
    sessionId: "design_session_1",
    stage: "interpreting",
    completedStages: [],
    ...overrides,
  };
}

function proposal() {
  return {
    proposalId: "proposal_preview_1",
    projectId: "project_demo_1",
    deckId: "deck_demo_1",
    slideId: "slide_intro",
    requestMessageId: "request_redesign_1",
    responseMessageId: "response_redesign_1",
    baseVersion: 1,
    title: "읽기 전용 중간 미리보기",
    operations: [
      {
        type: "update_slide_style" as const,
        slideId: "slide_intro",
        style: { backgroundColor: "#F8FAFC" },
      },
    ],
    affectedElementIds: [],
    warnings: [],
    status: "pending" as const,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
  };
}
