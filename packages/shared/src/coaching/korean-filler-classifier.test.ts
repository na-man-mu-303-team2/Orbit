import { describe, expect, it } from "vitest";
import {
  classifyKoreanFillerUtterance,
  koreanFillerClassifierVersion,
} from "./korean-filler-classifier";

describe("korean filler classifier v2", () => {
  it("confirms standalone vocalized pauses without matching substrings", () => {
    const result = classify("음 음식은 어제 그림과 저기압을 설명했습니다 어 으");

    expect(koreanFillerClassifierVersion).toBe("korean-filler-classifier-v2");
    expect(result.fillerOccurrences.map((item) => item.normalized)).toEqual([
      "음",
      "어",
      "으",
    ]);
  });

  it("does not match filler syllables inside 일반 어휘", () => {
    const result = classify("음식 어제 그림 저기압");

    expect(result.fillerOccurrences).toEqual([]);
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

  it("separates contextual filler uses from the same 일반 어휘", () => {
    const fillerResult = classify(
      "그, 결과입니다. 저, 수치를 보겠습니다. 이제, 결론입니다. 약간, 망설였습니다.",
      "결과입니다. 수치를 보겠습니다. 결론입니다. 망설였습니다.",
    );
    const lexicalResult = classify(
      "그 결과를 저기에서 이제 설명하고 약간의 차이를 비교합니다.",
    );

    expect(fillerResult.fillerOccurrences.map((item) => item.normalized)).toEqual([
      "그",
      "저",
      "이제",
      "약간",
    ]);
    expect(lexicalResult.fillerOccurrences).toEqual([]);
  });

  it("uses longest phrases and does not double-count consumed tokens", () => {
    const result = classify("뭐 랄까, 그 뭐지 결과입니다");

    expect(result.fillerOccurrences.map((item) => item.normalized)).toEqual([
      "뭐랄까",
      "그뭐지",
    ]);
  });

  it("keeps repetition, stutter, and restart separate from filler counts", () => {
    const result = classify(
      "제가 제가 설명합니다. 결, 결론은 이렇습니다. 아니 다시 설명합니다",
    );

    expect(result.fillerOccurrences).toEqual([]);
    expect(result.disfluencyOccurrences.map((item) => item.kind)).toEqual([
      "repetition",
      "stutter",
      "restart",
    ]);
  });
});

function classify(transcript: string, scriptText?: string) {
  return classifyKoreanFillerUtterance({
    utteranceId: "utterance-1",
    transcript,
    slideId: "slide_1",
    scriptText,
  });
}
