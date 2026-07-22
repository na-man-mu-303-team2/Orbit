import type { TextElementProps } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { resolveEffectiveTypography } from "./effectiveTypography";

describe("resolveEffectiveTypography", () => {
  it("matches Web shrink-text scale and line-space reduction", () => {
    const result = resolveEffectiveTypography({
      text: "축소된 제목",
      fontSize: 40,
      fontWeight: "normal",
      letterSpacing: 2,
      lineHeight: 1.4,
      align: "left",
      verticalAlign: "top",
      autoFit: "shrink-text",
      fontScale: 0.8,
      lineSpaceReduction: 0.25
    });

    expect(result).toMatchObject({
      effectiveFontSize: 32,
      dominantFontSize: 32,
      effectiveLetterSpacing: 1.6,
      resolvedFontScale: 0.8
    });
    expect(result.effectiveLineHeight).toBeCloseTo(0.84);
  });

  it("uses character-weighted median and dominant run", () => {
    const props: TextElementProps = {
      text: "큰글자본문본문본문본문",
      fontSize: 20,
      fontWeight: "normal",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
      paragraphs: [
        {
          text: "큰글자본문본문본문본문",
          align: "left",
          lineHeight: 1.2,
          spaceBefore: 0,
          spaceAfter: 0,
          indent: 0,
          runs: [
            { text: "큰글자", fontSize: 48, baseline: "normal" },
            { text: "본문본문본문본문", fontSize: 20, baseline: "normal" }
          ]
        }
      ]
    };

    expect(resolveEffectiveTypography(props)).toMatchObject({
      characterCount: 11,
      effectiveFontSize: 20,
      dominantFontSize: 20
    });
  });

  it("ignores shrink-only fields unless autoFit is shrink-text", () => {
    const result = resolveEffectiveTypography({
      text: "본문",
      fontSize: 24,
      fontWeight: "normal",
      lineHeight: 1.5,
      align: "left",
      verticalAlign: "top",
      autoFit: "none"
    });

    expect(result).toMatchObject({
      effectiveFontSize: 24,
      effectiveLineHeight: 1.5,
      resolvedFontScale: 1
    });
  });
});
