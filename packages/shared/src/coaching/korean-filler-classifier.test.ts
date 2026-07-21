import { describe, expect, it } from "vitest";
import {
  classifyKoreanFillerUtterance,
  koreanFillerClassifierVersion,
} from "./korean-filler-classifier";

describe("korean filler classifier v2", () => {
  it("confirms standalone vocalized pauses without matching substrings", () => {
    const result = classify("음 음식은 어제 준비했습니다 어");

    expect(koreanFillerClassifierVersion).toBe("korean-filler-classifier-v2");
    expect(result.fillerOccurrences.map((item) => item.normalized)).toEqual([
      "음",
      "어",
    ]);
  });

  it("requires two contextual signals for ambiguous lexical fillers", () => {
    const result = classify("이제 결과를 설명합니다. 그, 그 결과입니다");

    expect(result.fillerOccurrences.map((item) => item.surface)).toEqual([
      "그",
      "그",
    ]);
    expect(result.fillerOccurrences.some((item) => item.surface === "이제")).toBe(
      false,
    );
  });

  it("uses longest phrases and does not double-count consumed tokens", () => {
    const result = classify("뭐 랄까, 그 뭐지 결과입니다");

    expect(result.fillerOccurrences.map((item) => item.normalized)).toEqual([
      "뭐랄까",
      "그뭐지",
    ]);
  });

  it("keeps repetition, stutter, and restart separate from filler counts", () => {
    const result = classify("결과 결과를 결-결과, 아니 다시 설명합니다");

    expect(result.fillerOccurrences).toEqual([]);
    expect(result.disfluencyOccurrences.map((item) => item.kind)).toEqual([
      "repetition",
      "stutter",
      "restart",
    ]);
  });
});

function classify(transcript: string) {
  return classifyKoreanFillerUtterance({
    utteranceId: "utterance-1",
    transcript,
    slideId: "slide_1",
  });
}
