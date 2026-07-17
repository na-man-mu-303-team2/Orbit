import type { SlidePracticeReportRecord } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeHistoryContent } from "./SlidePracticeHistoryPanel";
import { listSlidePracticeReports } from "./slidePracticeApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeHistoryContent", () => {
  it("최신 5개만 표시하고 선택한 기록을 바로 연습 상세 화면으로 렌더링한다", () => {
    const reports = Array.from({ length: 6 }, (_, index) => practiceReport(index));
    const html = renderToStaticMarkup(
      <PracticeHistoryContent
        reports={reports}
        selectedReportId="report-2"
        onSelect={() => undefined}
      />,
    );

    expect(html.match(/editor-practice-history-item/g)).toHaveLength(5);
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("선택한 저장 기록");
    expect(html).toContain("습관어 사용 비율");
    expect(html).toContain("기록 2의 목소리 스타일");
    expect(html).not.toContain("기록 5의 목소리 스타일");
  });

  it("기록을 선택하기 전에는 상세 안내를 표시한다", () => {
    const html = renderToStaticMarkup(
      <PracticeHistoryContent
        reports={[practiceReport(0)]}
        selectedReportId={null}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("기록을 선택하면 연습 종료 직후와 같은 상세 결과");
    expect(html).not.toContain("선택한 저장 기록");
  });

  it("DB 저장 기록을 최신 5개로 제한해 요청한다", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      reports: [],
      nextCursor: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    await listSlidePracticeReports({
      projectId: "project-1",
      deckId: "deck-1",
      slideId: "slide-1",
      limit: 5,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/slide-practice-reports?deckId=deck-1&slideId=slide-1&limit=5",
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
