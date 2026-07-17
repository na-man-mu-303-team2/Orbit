import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RehearsalRunComparisonViewModel } from "./rehearsalRunComparisonModel";
import { RehearsalRunComparisonOverview } from "./RehearsalRunComparisonOverview";

describe("RehearsalRunComparisonOverview", () => {
  it("renders a bounded briefing and all comparison groups with evidence links", () => {
    const html = renderToStaticMarkup(
      <RehearsalRunComparisonOverview model={modelFixture()} />,
    );

    expect(html).toContain("다음 리허설 브리핑");
    expect(html).toContain("반복된 이슈");
    expect(html).toContain("새 이슈");
    expect(html).toContain("개선됨");
    expect(html).toContain("비교 제외");
    expect(html).toContain("부정적인 결과로 계산하지 않아요");
    expect(html).toContain("1회 → 0회");
    expect(html).toContain("총 1.2초 → 0초");
    expect(html).toContain(
      'href="/rehearsal/project_1/report/run_current#semantic-outcome-cue_1-1"',
    );
  });

  it("explains a first run with no comparison issues", () => {
    const html = renderToStaticMarkup(
      <RehearsalRunComparisonOverview
        model={{
          ...modelFixture(),
          hasPreviousRun: false,
          contextLabel: "첫 비교 기준을 만들었어요",
          briefing: [],
        }}
      />,
    );

    expect(html).toContain("첫 비교 기준을 만들었어요");
    expect(html).toContain("다음 회차부터 개선과 반복 이슈를 비교할 수 있어요");
  });
});

function modelFixture(): RehearsalRunComparisonViewModel {
  const item = {
    category: "semantic-cue" as const,
    categoryLabel: "의미 전달",
    cueId: "cue_1",
    cueRevision: 1,
    href: "/rehearsal/project_1/report/run_current#semantic-outcome-cue_1-1",
    label: "고객 가치",
    reason: "두 회차 연속 핵심 의미를 전달하지 못했습니다.",
    severity: "high" as const,
    slideId: "slide_1",
    slideLabel: "슬라이드 1 · 문제 정의",
  };
  return {
    briefing: [item],
    contextLabel: "직전 완료 회차와 비교했어요",
    hasPreviousRun: true,
    silenceComparison: {
      currentLongSilenceCount: 0,
      previousLongSilenceCount: 1,
      longSilenceCountDelta: -1,
      currentTotalSilenceSeconds: 0,
      previousTotalSilenceSeconds: 1.2,
      totalSilenceSecondsDelta: -1.2,
    },
    groups: [
      {
        key: "repeated",
        label: "반복된 이슈",
        description: "직전 회차에 이어 이번에도 확인된 핵심 이슈예요.",
        items: [item],
      },
      {
        key: "new",
        label: "새 이슈",
        description: "이번 회차에서 새로 확인된 이슈예요.",
        items: [],
      },
      {
        key: "improved",
        label: "개선됨",
        description: "직전 회차의 이슈를 이번 회차에서 개선했어요.",
        items: [],
      },
      {
        key: "incomparable",
        label: "비교 제외",
        description:
          "기준 변경 또는 측정 제외로 직접 비교하지 않았으며 부정적인 결과로 계산하지 않아요.",
        items: [],
      },
    ],
  };
}
