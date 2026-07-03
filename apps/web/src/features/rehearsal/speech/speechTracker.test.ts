import { describe, expect, it } from "vitest";

import { createSpeechTracker } from "./speechTracker";

describe("SpeechTracker", () => {
  it("final 전사만 문장 커버리지와 키워드 상태를 갱신한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes:
        "오르빗 리허설 화면은 발표 흐름을 점검합니다. 마지막 결론은 실시간 피드백입니다.",
      keywords: [
        {
          keywordId: "kw_orbit",
          text: "오르빗",
          synonyms: [],
          abbreviations: []
        }
      ]
    });

    expect(
      tracker.acceptResult({
        text: "오르빗 리허설 화면",
        isFinal: false,
        timestampMs: [0, 500]
      })
    ).toEqual([]);
    expect(tracker.snapshot().effectiveCoverage).toBe(0);

    const events = tracker.acceptResult({
      text: "오르빗 리허설 화면은 발표 흐름을 점검합니다",
      isFinal: true,
      timestampMs: [500, 1500]
    });

    expect(events.map((event) => event.type)).toContain("sentence-covered");
    expect(events).toContainEqual({
      type: "keyword-hit",
      slideId: "slide_1",
      keywordId: "kw_orbit",
      atMs: 1500
    });
    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 0.5,
      finalSentenceSpoken: false,
      hitKeywordIds: ["kw_orbit"]
    });
  });

  it("마지막 문장 발화와 hybrid coverage를 함께 계산한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      threshold: 0.7,
      speakerNotes:
        "첫 내용은 제품 맥락을 설명합니다. 두 번째 내용은 사용 흐름을 보여줍니다. 마지막 결론은 실시간 피드백입니다.",
      keywords: []
    });

    const events = tracker.acceptResult({
      text:
        "제품 맥락을 설명합니다. 사용 흐름을 보여줍니다. 마지막 결론은 실시간 피드백입니다.",
      isFinal: true,
      timestampMs: [0, 2000]
    });
    const coverage = events.find((event) => event.type === "coverage-updated");

    expect(events.map((event) => event.type)).toContain("last-sentence-spoken");
    expect(coverage).toMatchObject({
      sentenceCoverage: 1,
      effectiveCoverage: 1
    });
    expect(coverage?.type === "coverage-updated" ? coverage.wordCoverage : 0).toBeGreaterThan(
      0.6
    );
  });

  it("threshold 근처에서만 어절 보조 신호를 +/-10%p로 반영한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      threshold: 0.7,
      speakerNotes:
        "오르빗 화면은 자료를 정리합니다. 리허설 흐름은 시간을 점검합니다. 마지막 결론은 피드백입니다.",
      keywords: []
    });

    tracker.acceptResult({
      text:
        "오르빗 화면은 자료를 정리합니다. 리허설 흐름은 시간을 점검합니다. 마지막 결론은 다른 표현입니다.",
      isFinal: true,
      timestampMs: [0, 2000]
    });

    const snapshot = tracker.snapshot();
    expect(snapshot.sentenceCoverage).toBeCloseTo(2 / 3, 5);
    expect(snapshot.wordCoverage).toBeGreaterThan(snapshot.sentenceCoverage);
    expect(snapshot.effectiveCoverage).toBeLessThanOrEqual(
      snapshot.sentenceCoverage + 0.1
    );
    expect(snapshot.effectiveCoverage).toBeGreaterThan(snapshot.sentenceCoverage);
  });

  it("슬라이드 이탈 시 잠정 missing을 내고 복귀하면 전환 판정 상태만 리셋한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes: "오르빗 리허설 화면을 설명합니다.",
      keywords: [
        {
          keywordId: "kw_orbit",
          text: "오르빗",
          synonyms: [],
          abbreviations: []
        },
        {
          keywordId: "kw_timer",
          text: "타이머",
          synonyms: [],
          abbreviations: []
        }
      ]
    });

    tracker.acceptResult({
      text: "오르빗 리허설 화면을 설명합니다",
      isFinal: true,
      timestampMs: [0, 1000]
    });
    expect(tracker.exitSlide(1500)).toContainEqual({
      type: "keyword-missing",
      slideId: "slide_1",
      keywordId: "kw_timer",
      provisional: true,
      atMs: 1500
    });

    tracker.resetForSlideVisit();

    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 0,
      effectiveCoverage: 0,
      hitKeywordIds: ["kw_orbit"]
    });
  });
});
