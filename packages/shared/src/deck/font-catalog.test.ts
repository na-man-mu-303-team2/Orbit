import { describe, expect, it } from "vitest";

import { generateDeckFontCatalog, recommendGenerateDeckFonts } from "./font-catalog";

describe("recommendGenerateDeckFonts", () => {
  it("returns three font candidates matched to the requested mood", () => {
    const options = recommendGenerateDeckFonts("동글동글하고 친근한 한글 폰트");

    expect(options).toHaveLength(3);
    expect(options[0].moodTags).toEqual(
      expect.arrayContaining(["rounded", "friendly"])
    );
    expect(options[0].license).toBeTruthy();
    expect(options[0].sourceUrl).toContain("http");
  });

  it("marks wide display fonts with overflow safety metadata", () => {
    const gmarketSans = generateDeckFontCatalog.find(
      (font) => font.fontId === "gmarket-sans"
    );

    expect(gmarketSans).toMatchObject({
      recommendedBodySize: 20,
      widthFactor: 1.18,
      overflowRisk: "high"
    });
  });
});
