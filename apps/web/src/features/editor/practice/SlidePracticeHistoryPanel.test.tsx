import type { SlidePracticeReportRecord } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeHistoryContent } from "./SlidePracticeHistoryPanel";
import { listSlidePracticeReports } from "./slidePracticeApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeHistoryContent", () => {
  it("가장 최근 기록 1개를 바로 연습 상세 화면으로 렌더링한다", () => {
    const reports = [practiceReport(0), practiceReport(1)];
    const html = renderToStaticMarkup(
      <PracticeHistoryContent reports={reports} />,
    );

    expect(html).not.toContain("editor-practice-history-item");
    expect(html).toContain("최근 저장 기록");
    expect(html).toContain("습관어 사용 비율");
    expect(html).toContain("기록 0의 목소리 스타일");
    expect(html).not.toContain("기록 1의 목소리 스타일");
    expect(html).toContain("판단 보류");
    expect(html).not.toContain("기본형");
    expect(html).toContain("판단 근거");
    expect(html).toContain("-20.0 dBFS");
  });

  it("저장 기록의 음량을 측정하지 못한 경우에도 상태를 명시한다", () => {
    const baseReport = practiceReport(0);
    const html = renderToStaticMarkup(
      <PracticeHistoryContent reports={[{
          ...baseReport,
          voice: { ...baseReport.voice, loudnessDb: null },
        }]} />,
    );

    expect(html).toContain("음량");
    expect(html).toContain("측정 안 됨");
  });

  it("DB 저장 기록을 최신 1개로 제한해 요청한다", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      reports: [],
      nextCursor: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    await listSlidePracticeReports({
      projectId: "project-1",
      deckId: "deck-1",
      slideId: "slide-1",
      limit: 1,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/slide-practice-reports?deckId=deck-1&slideId=slide-1&limit=1",
      { credentials: "include" },
    );
  });
});

function practiceReport(index: number): SlidePracticeReportRecord {
  return {
    reportVersion: 1,
    metricDefinitionVersion: 1,
    classifierVersion: 1,
    reportId: `report-${index}`,
    practiceSessionId: `practice-${index}`,
    projectId: "project-1",
    deckId: "deck-1",
    deckVersion: 1,
    slideId: "slide-1",
    slideOrder: 0,
    startedAt: `2026-07-17T00:0${index}:00.000Z`,
    durationMs: 10_000,
    syllableCount: 50,
    meanRecognitionConfidence: 0.9,
    fillers: {
      policyVersion: 1,
      totalCount: index + 1,
      details: [{ word: "음", count: index + 1 }],
    },
    voice: {
      activeSpeechMs: 8_000,
      pauseRatio: 0.2,
      pitchMedianHz: 120,
      pitchSpanHz: 34.3,
      pitchValidRatio: 0.9,
      loudnessDb: -20,
      loudnessMadDb: 2,
      syllablesPerSecond: 4.5,
      signalToNoiseDb: 18,
      breathinessRatio: 0.1,
      clarityRatio: 0.9,
      rhythmRegularity: 0.8,
      clippingRatio: 0,
    },
    style: {
      mode: "neutral",
      confidence: 0.8,
      evidenceLabels: ["안정적인 속도"],
      message: `기록 ${index}의 목소리 스타일`,
    },
    quality: { state: "measured", reasons: [] },
    source: {
      kind: "browser",
      sttEngine: "web-speech",
      deviceIdHash: null,
      baselineVersion: null,
    },
    createdBy: "user-1",
    createdAt: `2026-07-17T00:0${index}:10.000Z`,
    expiresAt: "2026-10-15T00:00:00.000Z",
  };
}
