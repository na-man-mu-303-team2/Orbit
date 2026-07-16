import { describe, expect, it } from "vitest";

import { createDemoDeck } from "../index";
import { applyDeckPatch } from "./applyPatch";
import { createAddSlidePatch, createSlideId } from "./slideOperations";

describe("slide operation helpers", () => {
  it("creates a unique slide id", () => {
    const deck = createDemoDeck();
    expect(createSlideId(deck)).toBe("slide_3");
  });

  it("creates an add_slide patch", () => {
    const deck = createDemoDeck();
    const patch = createAddSlidePatch(deck, {
      kind: "content",
      slideId: "slide_3",
      order: 3,
      title: "New Slide",
      thumbnailUrl: "",
      style: {},
      speakerNotes: "",
      elements: [],
      keywords: [],
      semanticCues: [],
      animations: [],
      actions: []
    });
    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);
  });

  it("adds a twenty-first slide to an editor-managed deck", () => {
    const deck = createDemoDeck();
    const templateSlide = deck.slides[0];
    const twentySlideDeck = {
      ...deck,
      slides: Array.from({ length: 20 }, (_, index) => ({
        ...templateSlide,
        slideId: `slide_${index + 1}`,
        order: index + 1,
        title: `Slide ${index + 1}`,
        elements: [],
        animations: [],
        actions: []
      }))
    };
    const patch = createAddSlidePatch(twentySlideDeck, {
      ...templateSlide,
      slideId: "slide_21",
      order: 21,
      title: "Slide 21",
      elements: [],
      animations: [],
      actions: []
    });

    const result = applyDeckPatch(twentySlideDeck, patch);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.slides).toHaveLength(21);
      expect(result.deck.slides[20]?.slideId).toBe("slide_21");
    }
  });
});
