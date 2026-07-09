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
      utteranceOutcomes: []
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
});
