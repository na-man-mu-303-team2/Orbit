import { describe, expect, it } from "vitest";

import { matchKeywordOccurrenceTriggers } from "./keywordOccurrenceRuntime";

describe("matchKeywordOccurrenceTriggers", () => {
  const slide = {
    slideId: "slide_1",
    speakerNotes:
      "오늘은 AI 덱 생성 파이프라인을 소개합니다. 중간에도 AI를 언급합니다. 마지막에 AI를 말하면 이미지가 나타납니다.",
    keywords: [
      {
        keywordId: "kw_ai",
        text: "AI",
        synonyms: [],
        abbreviations: [],
        required: true
      }
    ],
    actions: [],
    animations: []
  };

  it("does not match a later keyword occurrence before script progress reaches its window", () => {
    const matches = matchKeywordOccurrenceTriggers({
      slide,
      targetOccurrenceIds: ["kwo_slide_1_kw_ai_47_49"],
      transcript: "오늘은 AI",
      latestTranscript: "AI",
      confidence: 0.95
    });

    expect(matches).toEqual([]);
  });

  it("matches the target occurrence when script progress is inside the occurrence window", () => {
    const matches = matchKeywordOccurrenceTriggers({
      slide,
      targetOccurrenceIds: ["kwo_slide_1_kw_ai_47_49"],
      transcript:
        "오늘은 AI 덱 생성 파이프라인을 소개합니다. 중간에도 AI를 언급합니다. 마지막에 AI를 말하면",
      latestTranscript: "AI",
      confidence: 0.95
    });

    expect(matches).toEqual([
      {
        keywordId: "kw_ai",
        occurrenceId: "kwo_slide_1_kw_ai_47_49",
        text: "AI",
        currentCharOffset: 55
      }
    ]);
  });

  it("beforeChars 안에서 발화한 target occurrence를 허용한다", () => {
    const matches = matchKeywordOccurrenceTriggers({
      slide,
      targetOccurrenceIds: ["kwo_slide_1_kw_ai_47_49"],
      transcript:
        "오늘은 AI 덱 생성 파이프라인을 소개합니다. 중간에도 AI를 언급합니다.",
      latestTranscript: "AI",
      confidence: 0.95,
      window: { beforeChars: 24, afterChars: 0 }
    });

    expect(matches).toEqual([
      expect.objectContaining({
        occurrenceId: "kwo_slide_1_kw_ai_47_49"
      })
    ]);
  });

  it("does not match an occurrence that was already confirmed in the slide session", () => {
    const matches = matchKeywordOccurrenceTriggers({
      slide,
      targetOccurrenceIds: ["kwo_slide_1_kw_ai_47_49"],
      transcript:
        "오늘은 AI 덱 생성 파이프라인을 소개합니다. 중간에도 AI를 언급합니다. 마지막에 AI를 말하면",
      latestTranscript: "AI",
      confidence: 0.95,
      confirmedOccurrenceIds: ["kwo_slide_1_kw_ai_47_49"]
    });

    expect(matches).toEqual([]);
  });

  it("does not match when transcript confidence is below the occurrence threshold", () => {
    const matches = matchKeywordOccurrenceTriggers({
      slide,
      targetOccurrenceIds: ["kwo_slide_1_kw_ai_47_49"],
      transcript:
        "오늘은 AI 덱 생성 파이프라인을 소개합니다. 중간에도 AI를 언급합니다. 마지막에 AI를 말하면",
      latestTranscript: "AI",
      confidence: 0.4
    });

    expect(matches).toEqual([]);
  });
});
