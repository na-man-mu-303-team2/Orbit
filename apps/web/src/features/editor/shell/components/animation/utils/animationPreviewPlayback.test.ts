import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { createEditorAnimationPreviewPlan } from "./animationPreviewPlayback";

describe("createEditorAnimationPreviewPlan", () => {
  it("creates visible start states for fade-in and settled hidden states for fade-out", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      animations: [
        {
          animationId: "anim_fade_in",
          elementId: "el_1",
          type: "fade-in" as const,
          order: 1,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out" as const
        },
        {
          animationId: "anim_fade_out",
          elementId: "el_2",
          type: "fade-out" as const,
          order: 2,
          durationMs: 300,
          delayMs: 100,
          easing: "ease-out" as const
        }
      ]
    };

    const plan = createEditorAnimationPreviewPlan(deck, slide);

    expect(plan).not.toBeNull();
    expect(plan?.timeline.map((animation) => animation.animationId)).toEqual([
      "anim_fade_in",
      "anim_fade_out"
    ]);
    expect(plan?.startStates.el_1?.visible).toBe(true);
    expect(plan?.startStates.el_1?.opacity).toBe(0);
    expect(plan?.startStates.el_2?.visible).toBe(true);
    expect(plan?.startStates.el_2?.opacity).toBe(1);
    expect(plan?.targetStates.el_1?.visible).toBe(true);
    expect(plan?.targetStates.el_1?.opacity).toBe(1);
    expect(plan?.targetStates.el_2?.visible).toBe(false);
    expect(plan?.targetStates.el_2?.opacity).toBe(0);
    expect(plan?.durationMs).toBeGreaterThan(400);
  });

  it("returns null when the slide has no animations", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      animations: []
    };

    expect(createEditorAnimationPreviewPlan(deck, slide)).toBeNull();
  });
});
