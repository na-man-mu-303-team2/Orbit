import type { DeckAnimation } from "@orbit/shared";
import { describe, expect, it } from "vitest";
import {
  createSlideshowTransitionStartStates,
  getSlideshowTransitionDurationMs,
  interpolateSlideshowTransitionStates
} from "./useSlideshowTransitions";

const fadeOutAnimation: DeckAnimation = {
  animationId: "anim_fade_out",
  elementId: "el_target",
  type: "fade-out",
  order: 1,
  durationMs: 800,
  delayMs: 200,
  easing: "ease-out"
};

describe("useSlideshowTransitions helpers", () => {
  it("caps effective transition duration at 500ms", () => {
    expect(getSlideshowTransitionDurationMs([fadeOutAnimation])).toBe(500);
  });

  it("creates visible start states for exit animations", () => {
    const startStates = createSlideshowTransitionStartStates(
      {
        el_target: {
          opacity: 0,
          scaleX: 1,
          scaleY: 1,
          visible: false
        }
      },
      [fadeOutAnimation]
    );

    expect(startStates.el_target).toMatchObject({
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
      visible: true
    });
  });

  it("keeps rotate transient and restores final rotation", () => {
    const animation: DeckAnimation = {
      animationId: "anim_rotate",
      elementId: "el_target",
      type: "rotate",
      order: 1,
      durationMs: 400,
      delayMs: 0,
      easing: "ease-out"
    };
    const targetStates = {
      el_target: {
        rotation: 15,
        visible: true
      }
    };
    const startStates = createSlideshowTransitionStartStates(targetStates, [
      animation
    ]);
    const half = interpolateSlideshowTransitionStates({
      animations: [animation],
      progress: 0.5,
      startStates,
      targetStates
    });
    const done = interpolateSlideshowTransitionStates({
      animations: [animation],
      progress: 1,
      startStates,
      targetStates
    });

    expect(half.el_target?.rotation).toBe(195);
    expect(done.el_target?.rotation).toBe(15);
  });
});
