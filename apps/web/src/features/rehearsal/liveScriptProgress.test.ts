import type { Slide } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { evaluateLiveScriptProgress } from "./liveScriptProgress";

function createScriptProgressTestSlide(): Slide {
  return {
    slideId: "slide_1",
    order: 1,
    title: "Script Progress",
    thumbnailUrl: "",
    style: {},
    speakerNotes:
      "첫 번째 문장에서 ORBIT 흐름을 소개합니다. 두 번째 문장에서 animation runtime을 설명합니다. 마지막 문장에서 다음 슬라이드로 넘어갑니다.",
    keywords: [],
    elements: [],
    animations: []
  };
}

describe("live script progress", () => {
  it("tracks progress coverage across speaker notes", () => {
    const slide = createScriptProgressTestSlide();
    const analysis = evaluateLiveScriptProgress(
      slide,
      "첫 번째 문장에서 ORBIT 흐름을 소개합니다 두 번째 문장에서 animation runtime을 설명합니다"
    );

    expect(analysis.coverage).toBeGreaterThan(0.6);
    expect(analysis.lastSentenceMatched).toBe(false);
  });

  it("requires the last sentence before slide advance is considered complete", () => {
    const slide = createScriptProgressTestSlide();
    const analysis = evaluateLiveScriptProgress(
      slide,
      "첫 번째 문장에서 ORBIT 흐름을 소개합니다 두 번째 문장에서 animation runtime을 설명합니다 마지막 문장에서 다음 슬라이드로 넘어갑니다"
    );

    expect(analysis.coverage).toBe(1);
    expect(analysis.lastSentenceMatched).toBe(true);
  });
});
