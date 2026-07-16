import {
  legacyRehearsalReportMetricsDefaults,
  legacyRehearsalSilenceAnalysis,
  legacyRehearsalVolumeAnalysis,
  type RehearsalReport,
} from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RehearsalVolumeOverview } from "./RehearsalVolumeOverview";

describe("RehearsalVolumeOverview", () => {
  it("shows relative issue counts and the first five time-ordered issues", () => {
    const html = renderToStaticMarkup(
      <RehearsalVolumeOverview
        formatDuration={(seconds) => `${seconds}s`}
        report={reportFixture(measuredVolumeAnalysis())}
      />,
    );

    expect(html).toContain(
      "전체 발화보다 작게 말한 구간</span><strong>3<em>개",
    );
    expect(html).toContain(
      "전체 발화보다 크게 말한 구간</span><strong>3<em>개",
    );
    expect(html.match(/rrd-volume-issue is-/g)).toHaveLength(5);
    expect(html).toContain("전체 6개 보기");
    expect(html).toContain("이 구간 들어보기");
    expect(html).not.toContain("dBFS");
    expect(html).not.toContain("averageDbfs");
  });

  it("distinguishes legacy and measured empty reports", () => {
    const legacyHtml = renderToStaticMarkup(
      <RehearsalVolumeOverview
        formatDuration={(seconds) => `${seconds}s`}
        report={reportFixture(legacyRehearsalVolumeAnalysis)}
      />,
    );
    expect(legacyHtml).toContain("음량 분석 기능이 적용되기 전에");

    const emptyHtml = renderToStaticMarkup(
      <RehearsalVolumeOverview
        formatDuration={(seconds) => `${seconds}s`}
        report={reportFixture({ ...measuredVolumeAnalysis(), issueSegments: [] })}
      />,
    );
    expect(emptyHtml).toContain("음량 변화가 큰 구간이 없었어요");
  });
});

function reportFixture(
  volumeAnalysis: RehearsalReport["volumeAnalysis"],
): RehearsalReport {
  return {
    reportId: "report_1",
    runId: "run_1",
    projectId: "project_1",
    deckId: "deck_1",
    transcriptRetained: false,
    transcript: null,
    volumeAnalysis,
    silenceAnalysis: legacyRehearsalSilenceAnalysis,
    metrics: {
      ...legacyRehearsalReportMetricsDefaults,
      durationSeconds: 12,
      wordsPerMinute: 120,
      fillerWordCount: 0,
      longSilenceCount: null,
      keywordCoverage: 1,
      keywordCoverageMeasurement: { state: "measured" },
    },
    speedSamples: [],
    fillerWordDetails: [],
    missedKeywords: [],
    utteranceOutcomes: [],
    semanticCueDecisions: [],
    semanticEvaluation: {
      state: "unavailable",
      measurementMode: "none",
      reasons: ["evaluation_not_run"],
      retryable: false,
    },
    semanticCueOutcomes: [],
    slideTimings: [],
    slideInsights: [],
    qnaSummary: {
      questionCount: 0,
      questionSummary: "",
      unclearTopics: [],
    },
    coaching: null,
    generatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function measuredVolumeAnalysis(): RehearsalReport["volumeAnalysis"] {
  return {
    metricDefinitionVersion: 1,
    measurementState: "measured",
    reasonCode: null,
    averageDbfs: -21,
    baselineDbfs: -20,
    variationDb: 9,
    activeRatio: 0.8,
    issueSegments: [
      issue("quiet", 1, 2),
      issue("loud", 3, 4),
      issue("quiet", 5, 6),
      issue("loud", 7, 8),
      issue("quiet", 9, 10),
      issue("loud", 11, 12),
    ],
  };
}

function issue(
  kind: "quiet" | "loud",
  startSeconds: number,
  endSeconds: number,
): RehearsalReport["volumeAnalysis"]["issueSegments"][number] {
  return {
    kind,
    startSeconds,
    endSeconds,
    durationSeconds: endSeconds - startSeconds,
    meanDeviationDb: kind === "quiet" ? -7 : 7,
  };
}
