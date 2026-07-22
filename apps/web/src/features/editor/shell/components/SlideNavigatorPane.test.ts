import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { canAddActivitySlide, isSlideDeleteKey } from "./SlideNavigatorPane";
import { buildSlideThumbBackground } from "../utils/editorLayout";

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

describe("slide render mode thumbnail", () => {
  it("keeps snapshot rails on the source render even when a canvas cache exists", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      importRenderMode: "snapshot" as const,
      thumbnailUrl: "/source-slide.png"
    };

    const background = buildSlideThumbBackground(slide, deck, "blob:canvas-cache");

    expect(background).toContain("/source-slide.png");
    expect(background).not.toContain("blob:canvas-cache");
  });

  it.each(["editable", "hybrid"] as const)(
    "uses the current canvas cache for %s rails",
    (importRenderMode) => {
      const deck = createDemoDeck();
      const slide = {
        ...deck.slides[0]!,
        importRenderMode,
        thumbnailUrl: "/source-slide.png"
      };

      const background = buildSlideThumbBackground(
        slide,
        deck,
        "blob:canvas-cache"
      );

      expect(background).toContain("blob:canvas-cache");
      expect(background).not.toContain("/source-slide.png");
    }
  );
});
