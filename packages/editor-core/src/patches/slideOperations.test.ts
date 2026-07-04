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
      slideId: "slide_3",
      order: 3,
      title: "New Slide",
      thumbnailUrl: "",
      style: {},
      speakerNotes: "",
      elements: [],
      keywords: [],
      animations: [],
      actions: []
    });
    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);
  });
});
