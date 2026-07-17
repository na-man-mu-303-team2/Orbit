import {
  createActivityResultsSlide,
  createActivitySlide,
  createDemoDeck
} from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { getDesignPanelLabel } from "../utils/slideEditingPolicy";

describe("editor right panel label", () => {
  it("uses settings language for both special slide kinds", () => {
    const deck = createDemoDeck();
    const activitySlide = createActivitySlide(deck, "pre-question");
    const resultSlide = createActivityResultsSlide(
      { ...deck, slides: [...deck.slides, activitySlide] },
      activitySlide.activity.activityId
    );

    expect(getDesignPanelLabel(deck.slides[0] ?? null)).toBe("디자인");
    expect(getDesignPanelLabel(activitySlide)).toBe("장표 설정");
    expect(getDesignPanelLabel(resultSlide)).toBe("장표 설정");
  });
});
