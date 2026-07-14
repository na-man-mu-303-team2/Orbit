import { describe, expect, it } from "vitest";

import {
  normalizeFocusedPracticeSentenceText,
  splitFocusedPracticeSentences,
} from "./focused-practice-target";

describe("focused-practice sentence target text", () => {
  it("uses the same zero-based sentence order for punctuation and explicit lines", () => {
    expect(splitFocusedPracticeSentences("첫 문장. 둘째 문장! 3.14는 숫자입니다."))
      .toEqual(["첫 문장", "둘째 문장", "3.14는 숫자입니다"]);
    expect(splitFocusedPracticeSentences("첫 줄\n둘째 줄"))
      .toEqual(["첫 줄", "둘째 줄"]);
  });

  it("normalizes Unicode, whitespace, and terminal punctuation before hashing", () => {
    expect(normalizeFocusedPracticeSentenceText("  발표   목적입니다!  "))
      .toBe("발표 목적입니다");
  });
});
