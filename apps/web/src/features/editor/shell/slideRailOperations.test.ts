import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import {
  createDeleteSlidePatch,
  createSlideRailReorderPatch,
  getAddedSlideId,
  moveSlideId
} from "./slideRailOperations";

describe("slide rail operations", () => {
  it("creates an exact slide permutation patch", () => {
    const deck = createDemoDeck();
    const ids = deck.slides.map((slide) => slide.slideId).reverse();

    expect(createSlideRailReorderPatch(deck, ids).operations).toEqual([
      {
        type: "reorder_slides",
        slideOrders: ids.map((slideId, index) => ({ slideId, order: index + 1 }))
      }
    ]);
  });

  it("creates a single delete operation", () => {
    const deck = createDemoDeck();
    expect(createDeleteSlidePatch(deck, deck.slides[0]!.slideId).operations).toEqual([
      { type: "delete_slide", slideId: deck.slides[0]!.slideId }
    ]);
  });

  it("moves only adjacent in-range slides", () => {
    expect(moveSlideId(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveSlideId(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveSlideId(["a", "b", "c"], "a", "up")).toBeNull();
  });

  it("reads the duplicated slide ID from an add operation", () => {
    const deck = createDemoDeck();
    expect(
      getAddedSlideId({
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [{ type: "add_slide", slide: deck.slides[0]! }]
      })
    ).toBe(deck.slides[0]!.slideId);
  });
});
