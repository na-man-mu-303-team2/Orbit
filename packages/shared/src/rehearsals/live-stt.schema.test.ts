import { describe, expect, it } from "vitest";
import { liveSttEventSchema } from "./live-stt.schema";

describe("liveSttEventSchema", () => {
  it("accepts partial transcript events", () => {
    const event = liveSttEventSchema.parse({
      type: "partial-transcript",
      transcript: "오늘은 ORBIT 리허설을 시작합니다",
      isFinal: false,
      confidence: 0.92
    });

    expect(event.type).toBe("partial-transcript");
    expect(event).toMatchObject({
      type: "partial-transcript",
      transcript: expect.stringContaining("ORBIT")
    });
  });

  it("accepts keyword and cue events for local rehearsal control", () => {
    expect(
      liveSttEventSchema.parse({
        type: "keyword-detected",
        slideId: "slide_1",
        keywordId: "kw_1",
        text: "ORBIT",
        matchedText: "오르빗",
        coverage: 0.5
      })
    ).toMatchObject({ type: "keyword-detected", coverage: 0.5 });

    expect(
      liveSttEventSchema.parse({
        type: "animation-cue",
        slideId: "slide_1",
        keywordId: "kw_1",
        cue: "emphasis",
        text: "ORBIT"
      })
    ).toMatchObject({ type: "animation-cue", cue: "emphasis" });
  });

  it("rejects invalid keyword coverage", () => {
    const result = liveSttEventSchema.safeParse({
      type: "slide-advance",
      fromSlideId: "slide_1",
      toSlideId: "slide_2",
      reason: "keyword-coverage",
      coverage: 1.2
    });

    expect(result.success).toBe(false);
  });
});
