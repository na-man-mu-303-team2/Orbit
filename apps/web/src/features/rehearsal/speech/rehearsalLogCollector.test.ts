import { describe, expect, it } from "vitest";

import { createRehearsalLogCollector } from "./rehearsalLogCollector";

describe("rehearsalLogCollector", () => {
  it("슬라이드 진입 시간을 run meta timeline으로 기록한다", () => {
    const collector = createRehearsalLogCollector({
      slides: [{ slideId: "slide_1", keywordIds: [] }],
      now: () => new Date("2026-07-03T00:00:00.000Z")
    });

    collector.enterSlide("slide_1");

    expect(collector.finalize()).toEqual({
      slideTimeline: [
        {
          slideId: "slide_1",
          enteredAt: "2026-07-03T00:00:00.000Z"
        }
      ],
      missedKeywords: [],
      adviceEvents: [],
      utteranceOutcomes: [],
      semanticCueDecisions: []
    });
  });

  it("최종 missedKeywords는 stop 시점의 세션 누적 hit 집합으로 계산한다", () => {
    const collector = createRehearsalLogCollector({
      slides: [
        { slideId: "slide_1", keywordIds: ["kw_orbit", "kw_timer"] },
        { slideId: "slide_2", keywordIds: ["kw_finish"] }
      ],
      now: () => new Date("2026-07-03T00:00:00.000Z")
    });

    collector.recordKeywordHit("slide_1", "kw_orbit");
    collector.recordProvisionalMissing("slide_1", "kw_timer");
    collector.recordKeywordHit("slide_1", "kw_timer");

    expect(collector.finalize().missedKeywords).toEqual([
      { slideId: "slide_2", keywordId: "kw_finish" }
    ]);
  });

  it("records utterance outcomes and computes missed sentences at finalization", () => {
    const collector = createRehearsalLogCollector({
      slides: [
        {
          slideId: "slide_1",
          keywordIds: [],
          matchableSentenceIds: ["sentence_1", "sentence_2", "sentence_3"]
        }
      ],
      now: () => new Date("2026-07-03T00:00:10.000Z")
    });

    collector.recordSentenceCovered({
      slideId: "slide_1",
      sentenceId: "sentence_1",
      matchKind: "covered",
      similarity: 0.99,
      lexicalOverlap: 0.8
    });
    collector.recordSentenceCovered({
      slideId: "slide_1",
      sentenceId: "sentence_2",
      matchKind: "paraphrased",
      similarity: 0.93,
      lexicalOverlap: 0.2
    });
    collector.recordAdLib({
      slideId: "slide_1",
      text: "고객 사례를 하나 더 말씀드리겠습니다.",
      nearestSentenceId: "sentence_2",
      similarity: 0.87
    });

    expect(collector.finalize().utteranceOutcomes).toEqual([
      {
        slideId: "slide_1",
        kind: "covered",
        sentenceId: "sentence_1",
        similarity: 0.99,
        lexicalOverlap: 0.8,
        at: "2026-07-03T00:00:10.000Z"
      },
      {
        slideId: "slide_1",
        kind: "paraphrased",
        sentenceId: "sentence_2",
        similarity: 0.93,
        lexicalOverlap: 0.2,
        at: "2026-07-03T00:00:10.000Z"
      },
      {
        slideId: "slide_1",
        kind: "ad-lib",
        text: "고객 사례를 하나 더 말씀드리겠습니다.",
        sentenceId: "sentence_2",
        similarity: 0.87,
        at: "2026-07-03T00:00:10.000Z"
      },
      {
        slideId: "slide_1",
        kind: "missed",
        sentenceId: "sentence_3"
      }
    ]);
  });

  it("조언 이벤트는 상태 진입 시 1회 기록하고 재진입 쿨다운을 적용한다", () => {
    let nowMs = Date.parse("2026-07-03T00:00:00.000Z");
    const collector = createRehearsalLogCollector({
      slides: [{ slideId: "slide_1", keywordIds: [] }],
      now: () => new Date(nowMs),
      adviceReentryCooldownMs: 15000
    });

    collector.setAdviceState("pace-too-fast", true);
    collector.setAdviceState("pace-too-fast", true);
    collector.setAdviceState("pace-too-fast", false);
    nowMs += 10000;
    collector.setAdviceState("pace-too-fast", true);
    collector.setAdviceState("pace-too-fast", false);
    nowMs += 6000;
    collector.setAdviceState("pace-too-fast", true);

    expect(collector.finalize().adviceEvents).toEqual([
      {
        type: "pace-too-fast",
        at: "2026-07-03T00:00:00.000Z"
      },
      {
        type: "pace-too-fast",
        at: "2026-07-03T00:00:16.000Z"
      }
    ]);
  });

  it("capability event를 100개로 제한해 run meta에 보존한다", () => {
    const collector = createRehearsalLogCollector({
      slides: [{ slideId: "slide_1", keywordIds: [] }]
    });

    for (let index = 0; index < 105; index += 1) {
      collector.recordSemanticCapabilityEvent({
        eventId: `cap_${index}`,
        capability: "nli",
        fromState: index % 2 === 0 ? "available" : "degraded",
        toState: index % 2 === 0 ? "degraded" : "available",
        ...(index % 2 === 0 ? { reason: "timeout" as const } : {}),
        measurementMode: index % 2 === 0 ? "basic" : "full",
        retryable: true,
        cueIds: [],
        at: new Date(index).toISOString()
      });
    }

    const events = collector.finalize().semanticCapabilityEvents;
    expect(events).toHaveLength(100);
    expect(events[0]?.eventId).toBe("cap_5");
    expect(events.at(-1)?.eventId).toBe("cap_104");
  });
});
