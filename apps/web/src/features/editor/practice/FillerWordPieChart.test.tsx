import type { SlidePracticeReport } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildFillerWordChartItems,
  FillerWordPieChart,
} from "./FillerWordPieChart";
import { PracticeResult } from "./SlidePracticePanel";

describe("FillerWordPieChart", () => {
  it("습관어가 3개면 3개 항목만 표시한다", () => {
    const html = renderToStaticMarkup(
      <FillerWordPieChart
        totalCount={6}
        details={[
          { word: "음", count: 3 },
          { word: "어", count: 2 },
          { word: "그러니까", count: 1 },
        ]}
      />,
    );

    expect(html.match(/editor-practice-filler-legend-item/g)).toHaveLength(3);
    expect(html).toContain("음");
    expect(html).toContain("3회");
    expect(html).not.toContain("기타");
  });

  it("습관어가 6개 이상이면 상위 5개와 기타로 묶는다", () => {
    const items = buildFillerWordChartItems([
      { word: "음", count: 6 },
      { word: "어", count: 5 },
      { word: "그", count: 4 },
      { word: "그러니까", count: 3 },
      { word: "뭐랄까", count: 2 },
      { word: "약간", count: 2 },
      { word: "아", count: 1 },
    ], 23);

    expect(items).toHaveLength(6);
    expect(items.at(-1)).toMatchObject({ word: "기타", count: 3 });
  });

  it("습관어가 없으면 빈 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <FillerWordPieChart totalCount={0} details={[]} />,
    );

    expect(html).toContain("감지된 습관어가 없습니다.");
    expect(html).not.toContain("<svg");
  });

  it("차트 아래에 기존 목소리 스타일과 지표를 표시한다", () => {
    const html = renderToStaticMarkup(<PracticeResult report={practiceReport()} />);

    expect(html.indexOf("editor-practice-filler-chart")).toBeLessThan(
      html.indexOf("editor-practice-summary"),
    );
    expect(html).toContain("자장가형");
    expect(html).toContain("17.5 음절/초");
    expect(html).toContain("87%");
    expect(html).toContain("34.3 Hz");
  });
});

function practiceReport(): SlidePracticeReport {
  return {
    reportVersion: 1,
    metricDefinitionVersion: 1,
    classifierVersion: 1,
    practiceSessionId: "practice-1",
    projectId: "project-1",
    deckId: "deck-1",
    deckVersion: 1,
    slideId: "slide-1",
    slideOrder: 0,
    startedAt: "2026-07-17T00:00:00.000Z",
    durationMs: 10_000,
    syllableCount: 50,
    meanRecognitionConfidence: 0.9,
    fillers: {
      policyVersion: 1,
      totalCount: 3,
      details: [{ word: "음", count: 3 }],
    },
    voice: {
      activeSpeechMs: 1_300,
      pauseRatio: 0.87,
      pitchMedianHz: 120,
      pitchSpanHz: 34.3,
      pitchValidRatio: 0.9,
      loudnessDb: -20,
      loudnessMadDb: 2,
      syllablesPerSecond: 17.5,
      signalToNoiseDb: 18,
      breathinessRatio: 0.1,
      clarityRatio: 0.9,
      rhythmRegularity: 0.8,
      clippingRatio: 0,
    },
    style: {
      mode: "lullaby",
      confidence: 0.8,
      evidenceLabels: ["낮은 말 속도"],
      message: "자장가처럼 차분해요.",
    },
    quality: { state: "measured", reasons: [] },
    source: {
      kind: "browser",
      sttEngine: "web-speech",
      deviceIdHash: null,
      baselineVersion: null,
    },
  };
}
