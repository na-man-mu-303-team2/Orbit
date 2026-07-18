import { describe, expect, it } from "vitest";

import {
  beginSlideRailDrag,
  cancelSlideRailDrag,
  resolveSlideRailDrop,
  updateSlideRailDragTarget,
} from "./slideRailDragModel";

describe("slideRailDragModel", () => {
  const slideIds = ["slide_1", "slide_2", "slide_3"];

  it("resolves before and after insertions as a full permutation", () => {
    expect(
      resolveSlideRailDrop(
        updateSlideRailDragTarget(beginSlideRailDrag(1, "slide_3"), "slide_2", "before"),
        slideIds,
      ),
    ).toEqual(["slide_1", "slide_3", "slide_2"]);
    expect(
      resolveSlideRailDrop(
        updateSlideRailDragTarget(beginSlideRailDrag(1, "slide_1"), "slide_2", "after"),
        slideIds,
      ),
    ).toEqual(["slide_2", "slide_1", "slide_3"]);
  });

  it("returns no commit data for self and no-op drops", () => {
    expect(
      resolveSlideRailDrop(
        updateSlideRailDragTarget(beginSlideRailDrag(1, "slide_2"), "slide_2", "before"),
        slideIds,
      ),
    ).toBeNull();
    expect(
      resolveSlideRailDrop(
        updateSlideRailDragTarget(beginSlideRailDrag(1, "slide_2"), "slide_3", "before"),
        slideIds,
      ),
    ).toBeNull();
  });

  it("cancels without producing mutation data", () => {
    expect(cancelSlideRailDrag()).toBeNull();
  });
});
