import {
  createActivityResultsSlide,
  createActivitySlide,
  createDemoDeck
} from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { getInitialEditorRightPanelMode } from "../utils/rightPanelMode";
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

  it("prioritizes the icon library when the toolbar opens it", () => {
    expect(
      getInitialEditorRightPanelMode({
        isAnimationPropertiesOpen: false,
        isIconPanelOpen: true,
      }),
    ).toBe("icons");
    expect(
      getInitialEditorRightPanelMode({
        isAnimationPropertiesOpen: true,
        isIconPanelOpen: true,
      }),
    ).toBe("icons");
  });
});
