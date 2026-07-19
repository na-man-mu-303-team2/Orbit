import type { RehearsalProjectSummary } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RehearsalProjectSummaryDashboard } from "./RehearsalProjectSummaryDashboard";

describe("RehearsalProjectSummaryDashboard", () => {
  it("직전 회차와 최신 회차의 개선 지표를 시각 비교 문구로 표시한다", () => {
    const html = renderToStaticMarkup(
      <RehearsalProjectSummaryDashboard
        comparison={null}
        summary={summaryFixture()}
      />,
    );

    expect(html).toContain("발표 개선 요약");
    expect(html).toContain("6회차 기반");
    expect(html).toContain(
      'aria-label="총 발표 시간. 권장 10:21에서 현재 10:21. 권장과 일치"',
    );
    expect(html).toContain(
      'aria-label="긴 침묵. 직전 2회에서 현재 1회. 1회 감소"',
    );
    expect(html).toContain(
      'aria-label="핵심 메시지 전달. 직전 7/8 전달에서 현재 8/8 전달. 1개 개선"',
    );
    expect(html).toContain(
      'aria-label="시간 초과 슬라이드. 직전 1/8장에서 현재 0/8장. 1장 감소"',
    );
    expect(html).toContain("project-summary-kpi-visual is-comparison");
    expect(html).toContain("project-summary-kpi-readout is-comparison");
    expect(html).toContain("is-target-match");
    expect(html).toContain('aria-label="다음 연습 우선 행동"');
    expect(html.indexOf("project-summary-next-action")).toBeLessThan(
      html.indexOf("project-summary-kpi-section"),
    );
  });
});

function summaryFixture(): RehearsalProjectSummary {
  return {
    projectId: "project_1",
    runCount: 6,
    progressComment: "발표 흐름이 안정되고 있어요.",
    runDurationSeries: [],
    slideAvgTimings: [],
    runMetricSeries: [
      {
        runId: "run_5",
        createdAt: "2026-07-18T00:00:00.000Z",
        duration: {
          measurementState: "measured",
          reasonCode: null,
          actualSeconds: 621,
          targetSeconds: 621,
        },
        longSilence: {
          measurementState: "measured",
          reasonCode: null,
          count: 2,
          metricDefinitionVersion: 2,
        },
        coreMessageCoverage: {
          measurementState: "measured",
          reasonCode: null,
          coveredCount: 7,
          partialCount: 1,
          missedCount: 0,
          measurableCount: 8,
          rate: 0.875,
        },
        timingOverrun: {
          measurementState: "measured",
          reasonCode: null,
          overrunCount: 1,
          measurableCount: 8,
          rate: 0.125,
        },
      },
      {
        runId: "run_6",
        createdAt: "2026-07-19T00:00:00.000Z",
        duration: {
          measurementState: "measured",
          reasonCode: null,
          actualSeconds: 621,
          targetSeconds: 621,
        },
        longSilence: {
          measurementState: "measured",
          reasonCode: null,
          count: 1,
          metricDefinitionVersion: 2,
        },
        coreMessageCoverage: {
          measurementState: "measured",
          reasonCode: null,
          coveredCount: 8,
          partialCount: 0,
          missedCount: 0,
          measurableCount: 8,
          rate: 1,
        },
        timingOverrun: {
          measurementState: "measured",
          reasonCode: null,
          overrunCount: 0,
          measurableCount: 8,
          rate: 0,
        },
      },
    ],
    slidePerformanceSummaries: [],
  };
}
