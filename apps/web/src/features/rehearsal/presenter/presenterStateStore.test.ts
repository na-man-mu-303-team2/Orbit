import { describe, expect, it } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { applyPresenterSlideshowCommand, createPresenterSlideshowState } from "./presenterStateStore";

describe("presenterStateStore", () => {
  it("creates a restorable initial presenter state", () => {
    expect(createPresenterSlideshowState(p0AnimationDeck)).toMatchObject({
      slideId: "slide_p0_1",
      slideIndex: 0,
      highlights: []
    });
  });

  it("moves to the previous slide without carrying playback step state", () => {
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      slideId: "slide_p0_2",
      slideIndex: 1
    };

    expect(
      applyPresenterSlideshowCommand(state, {
        type: "previous-slide",
        slides: p0AnimationDeck.slides
      })
    ).toMatchObject({
      slideId: "slide_p0_1",
      slideIndex: 0
    });
  });

  it("updates persistent highlight state by element", () => {
    const state = createPresenterSlideshowState(p0AnimationDeck);
    const active = applyPresenterSlideshowCommand(state, {
      type: "set-highlight",
      elementId: "el_body",
      active: true
    });
    const inactive = applyPresenterSlideshowCommand(active, {
      type: "set-highlight",
      elementId: "el_body",
      active: false
    });

    expect(active.highlights).toEqual([{ elementId: "el_body", active: true }]);
    expect(inactive.highlights).toEqual([{ elementId: "el_body", active: false }]);
  });
});
