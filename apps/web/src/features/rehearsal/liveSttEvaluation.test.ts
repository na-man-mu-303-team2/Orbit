import { describe, expect, it } from "vitest";
import {
  calculateCharacterErrorRate,
  evaluateLiveSttPredictions
} from "./liveSttEvaluation";

describe("liveSttEvaluation", () => {
  it("calculates Korean CER with normalized character distance", () => {
    expect(calculateCharacterErrorRate("오르빗", "오르비트")).toBeCloseTo(
      2 / 3,
      5
    );
    expect(calculateCharacterErrorRate("다음 슬라이드", "다음슬라이드")).toBe(0);
  });

  it("summarizes CER, keyword recall, false triggers, and latency", () => {
    const summary = evaluateLiveSttPredictions(
      [
        {
          id: "control-next",
          referenceTranscript: "다음 슬라이드로 넘어가 주세요",
          expectedKeywords: ["다음 슬라이드"],
          shouldTriggerControl: true
        },
        {
          id: "keyword-orbit",
          referenceTranscript: "오르빗 리허설을 시작합니다",
          expectedKeywords: ["오르빗"],
          shouldTriggerControl: false,
          segmentEndedAtMs: 1000
        },
        {
          id: "free-speech",
          referenceTranscript: "안녕하세요 다음 슬라이드는 설명 자료입니다",
          expectedKeywords: [],
          shouldTriggerControl: false
        }
      ],
      [
        {
          id: "control-next",
          transcript: "다음 슬라이드로 넘어가 주세요",
          detectedKeywords: ["다음 슬라이드"],
          triggeredControl: true
        },
        {
          id: "keyword-orbit",
          transcript: "오르비트 리허설을 시작합니다",
          detectedKeywords: ["오르빗"],
          triggeredControl: false,
          transcriptAtMs: 1320
        },
        {
          id: "free-speech",
          transcript: "안녕하세요 다음 슬라이드는 설명 자료입니다",
          detectedKeywords: [],
          triggeredControl: true
        }
      ]
    );

    expect(summary.itemCount).toBe(3);
    expect(summary.averageCer).toBeGreaterThan(0);
    expect(summary.keywordRecall).toBe(1);
    expect(summary.falseTriggerRate).toBe(0.5);
    expect(summary.averageLatencyMs).toBe(320);
    expect(summary.items.find((item) => item.id === "free-speech")).toMatchObject({
      falseTrigger: true
    });
  });
});
