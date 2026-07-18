import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { canAddActivitySlide, isSlideDeleteKey } from "./SlideNavigatorPane";

describe("activity slide add guard", () => {
  it("allows activity slides only for a wide 16:9 deck", () => {
    const wideDeck = createDemoDeck();

    expect(canAddActivitySlide(wideDeck)).toBe(true);
    expect(canAddActivitySlide({
      canvas: {
        preset: "standard-4-3",
        width: 1024,
        height: 768,
        aspectRatio: "4:3"
      }
    })).toBe(false);
  });
});

describe("slide keyboard deletion", () => {
  it.each(["Delete", "Backspace"])("accepts the %s key", (key) => {
    expect(isSlideDeleteKey(key)).toBe(true);
  });

  it("ignores unrelated keys", () => {
    expect(isSlideDeleteKey("Enter")).toBe(false);
  });
});
