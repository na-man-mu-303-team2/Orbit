import { describe, expect, it } from "vitest";

import { analyzeKoreanFillers, countSpokenSyllables } from "./fillerAnalyzer";

describe("analyzeKoreanFillers", () => {
  it("normalizes stretched tokens and phrase fillers", () => {
    expect(analyzeKoreanFillers("음 으음, 뭐 랄까 이 결과는 어어 중요합니다")).toEqual({
      totalCount: 4,
      details: [
        { word: "음", count: 2 },
        { word: "뭐랄까", count: 1 },
        { word: "어", count: 1 },
      ],
    });
  });

  it("counts Korean syllables without persisting transcript", () => {
    expect(countSpokenSyllables("안녕하세요 orbit team")).toBe(7);
  });
});
