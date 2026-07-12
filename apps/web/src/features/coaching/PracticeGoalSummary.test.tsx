import type { PracticePlanResponse } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PracticeGoalSummary } from "./PracticeGoalSummary";

describe("PracticeGoalSummary", () => {
  it("keeps the practice plan entry visible while goal derivation is processing", () => {
    const html = render({ status: "processing", sourceFullRunId: "run-a" });

    expect(html).toContain("연습 계획 준비 중");
    expect(html).toContain("연습 계획 열기");
    expect(html).toContain("/rehearsal/project-a/plan/run-a");
  });

  it("keeps the practice plan entry visible when no priority goals exist", () => {
    const html = render({ status: "no-goal", sourceFullRunId: "run-a" });

    expect(html).toContain("지금 바로 반복할 목표가 없어요");
    expect(html).toContain("연습 계획 열기");
    expect(html).toContain("/rehearsal/project-a/plan/run-a");
  });
});

function render(plan: PracticePlanResponse) {
  return renderToStaticMarkup(
    <PracticeGoalSummary
      initialPlan={plan}
      projectId="project-a"
      sourceFullRunId="run-a"
    />,
  );
}
