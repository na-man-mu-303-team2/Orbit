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
    expect(html).toContain("오늘 목소리는 잠수 모드예요. 수면 위로 한 걸음");
    expect(html).not.toContain("자장가처럼 차분해요.");
    expect(html).toContain("17.5 음절/초");
    expect(html).toContain("87%");
    expect(html).toContain("34.3 Hz");
    expect(html).toContain("-20.0 dBFS");
    expect(html).toContain("판단 근거");
    expect(html).toContain("낮은 말 속도");
  });

  it("과거 터보형 기록도 새 멘트로 표시한다", () => {
    const baseReport = practiceReport();
    const html = renderToStaticMarkup(<PracticeResult report={{
      ...baseReport,
      style: {
        ...baseReport.style,
        mode: "turbo",
        message: "빠른 구간이 뚜렷해요.",
      },
    }} />);

    expect(html).toContain("오늘 목소리에 기분 좋은 가속이 붙었어요");
    expect(html).not.toContain("빠른 구간이 뚜렷해요.");
  });

  it("측정 불충분 결과는 기본형 대신 판단 보류와 측정 불가 음량을 표시한다", () => {
    const baseReport = practiceReport();
    const html = renderToStaticMarkup(<PracticeResult report={{
      ...baseReport,
      classifierVersion: 2,
      voice: { ...baseReport.voice, loudnessDb: null },
      style: {
        mode: "neutral",
        confidence: 0,
        evidenceLabels: ["연습 분량이 부족해요"],
        message: "연습 분량이 부족해 목소리 유형을 판단하지 않았습니다.",
      },
      quality: { state: "unmeasured", reasons: ["insufficient-speech"] },
    }} />);

    expect(html).toContain("판단 보류");
    expect(html).not.toContain("기본형");
    expect(html).toContain("연습 분량이 부족해요");
    expect(html).toContain("측정 안 됨");
  });

  it("v3에서 두 유형 조건이 없으면 측정 결과도 판단 보류로 표시한다", () => {
    const baseReport = practiceReport();
    const html = renderToStaticMarkup(<PracticeResult report={{
      ...baseReport,
      classifierVersion: 3,
      style: {
        mode: "neutral",
        confidence: 0,
        evidenceLabels: ["자장가형·터보형 조건이 뚜렷하지 않아요"],
        message: "자장가형 또는 터보형 조건이 뚜렷하지 않아 유형 판단을 보류했습니다.",
      },
    }} />);

    expect(html).toContain("판단 보류");
    expect(html).not.toContain("기본형");
    expect(html).toContain("자장가형·터보형 조건이 뚜렷하지 않아요");
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
