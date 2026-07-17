import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { canAddActivitySlide } from "./SlideNavigatorPane";

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
