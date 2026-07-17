import {
  createActivityResultsSlide,
  createActivitySlide,
  createDemoDeck
} from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { canEditSlideCanvas } from "./slideEditingPolicy";

describe("slide editing policy", () => {
  it("allows canvas editing only for content slides", () => {
    const deck = createDemoDeck();
    const activitySlide = createActivitySlide(deck, "poll");
    const resultSlide = createActivityResultsSlide(
      { ...deck, slides: [...deck.slides, activitySlide] },
      activitySlide.activity.activityId
    );

    expect(canEditSlideCanvas(deck.slides[0])).toBe(true);
    expect(canEditSlideCanvas(activitySlide)).toBe(false);
    expect(canEditSlideCanvas(resultSlide)).toBe(false);
    expect(canEditSlideCanvas(null)).toBe(false);
  });
});
