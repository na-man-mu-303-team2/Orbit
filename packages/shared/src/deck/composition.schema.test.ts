import { describe, expect, it } from "vitest";

import { deckCompositionIdSchema } from "./composition.schema";

describe("deckCompositionIdSchema", () => {
  it("accepts all generated cover compositions", () => {
    const ids = [
      "cover-classic-corporate",
      "cover-visual-impact",
      "cover-immersive-background",
      "cover-research-author",
      "cover-structured-report",
      "cover-modern-high-tech"
    ];

    expect(ids.map((id) => deckCompositionIdSchema.parse(id))).toEqual(ids);
  });

  it("keeps legacy cover composition IDs compatible", () => {
    expect(deckCompositionIdSchema.parse("minimal-cover")).toBe("minimal-cover");
    expect(deckCompositionIdSchema.parse("hero-full-bleed")).toBe(
      "hero-full-bleed"
    );
  });

  it("accepts phase one automatic art direction compositions", () => {
    const ids = [
      "process-vertical-rail",
      "bento-focus",
      "diagram-orbit",
      "editorial-media-band"
    ];

    expect(ids.map((id) => deckCompositionIdSchema.parse(id))).toEqual(ids);
  });
});
