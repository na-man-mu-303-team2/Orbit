import type { DeckAnimation } from "@orbit/shared";
import { describe, expect, it } from "vitest";
import {
  getSequencedEntryTransitionDurationMs,
  getSlideshowTransitionDurationMs,
  sequenceEntryAnimationsByOrder
} from "./slideshowTransitionTiming";

describe("slideshowTransitionTiming", () => {
  it("caps effective transition duration at 500ms", () => {
    expect(
      getSlideshowTransitionDurationMs([
        createAnimation({
          animationId: "anim_fade_out",
          durationMs: 800,
          elementId: "el_target",
          order: 1,
          type: "fade-out",
          delayMs: 200
        })
      ])
    ).toBe(500);
  });

  it("sequences entry animations by order before applying per-animation delay", () => {
    const sequencedAnimations = sequenceEntryAnimationsByOrder([
      createAnimation({
        animationId: "anim_second",
        elementId: "el_second",
        order: 2
      }),
      createAnimation({
        animationId: "anim_first",
        elementId: "el_first",
        order: 1
      })
    ]);

    expect(sequencedAnimations.map((animation) => animation.animationId)).toEqual([
      "anim_first",
      "anim_second"
    ]);
    expect(sequencedAnimations.map((animation) => animation.delayMs)).toEqual([
      0, 200
    ]);
    expect(getSequencedEntryTransitionDurationMs(sequencedAnimations)).toBe(400);
  });
});

function createAnimation(
  animation: Partial<DeckAnimation> & Pick<DeckAnimation, "animationId" | "elementId">
): DeckAnimation {
  return {
    type: "fade-in",
    order: 1,
    durationMs: 200,
    delayMs: 0,
    easing: "ease-out",
    ...animation
  };
}
