import type { Deck } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { readySlidePrefix } from "./AiDeckGenerationPage";

describe("readySlidePrefix", () => {
  it("exposes only the contiguous completed prefix", () => {
    const deck = {
      slides: [
        { slideId: "slide-1" },
        { slideId: "slide-2" },
        { slideId: "slide-3" },
      ],
    } as Deck;

    expect(readySlidePrefix(deck, ["slide-2", "slide-3"])).toBe(0);
    expect(readySlidePrefix(deck, ["slide-1", "slide-3"])).toBe(1);
    expect(readySlidePrefix(deck, ["slide-1", "slide-2", "slide-3"])).toBe(3);
  });
});
