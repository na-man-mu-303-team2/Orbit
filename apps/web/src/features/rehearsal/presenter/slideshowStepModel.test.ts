import { describe, expect, it } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import {
  clampSlideshowStepIndex,
  computeSettledElementStates,
  createSlideshowAnimationPlan
} from "./slideshowStepModel";

const slide = p0AnimationDeck.slides[0]!;

describe("slideshowStepModel", () => {
  it("classifies cue-referenced animations as trigger steps only", () => {
    const plan = createSlideshowAnimationPlan({
      slide,
      triggerAnimationIds: [
        "anim_image_zoom_in",
        "anim_group_fade_out",
        "anim_chart_zoom_out"
      ]
    });

    expect(plan.maxStepIndex).toBe(2);
    expect(plan.entryAnimations.map((animation) => animation.animationId)).toEqual([
      "anim_title_entry",
      "anim_body_appear",
      "anim_highlight_disappear",
      "anim_custom_rotate",
      "anim_missing"
    ]);
    expect(plan.triggerSteps.map((step) => step.order)).toEqual([5, 8]);
    expect(plan.triggerSteps[0]?.animations.map((animation) => animation.animationId)).toEqual([
      "anim_image_zoom_in",
      "anim_group_fade_out"
    ]);
    expect(plan.danglingAnimationIds).toEqual(["anim_missing"]);
  });

  it("computes deterministic settled state for every completed step", () => {
    const triggerAnimationIds = [
      "anim_image_zoom_in",
      "anim_group_fade_out",
      "anim_chart_zoom_out",
      "anim_custom_rotate"
    ];
    const step0 = computeSettledElementStates({
      deck: p0AnimationDeck,
      slide,
      stepIndex: 0,
      triggerAnimationIds
    });
    const step1 = computeSettledElementStates({
      deck: p0AnimationDeck,
      slide,
      stepIndex: 1,
      triggerAnimationIds
    });
    const step3 = computeSettledElementStates({
      deck: p0AnimationDeck,
      slide,
      stepIndex: 3,
      triggerAnimationIds
    });

    expect(step0.el_title?.visible).toBe(true);
    expect(step0.el_body?.visible).toBe(true);
    expect(step0.el_highlight?.visible).toBe(false);
    expect(step0.el_group?.visible).toBe(true);
    expect(step0.el_chart?.visible).toBe(true);

    expect(step1.el_image).toMatchObject({ visible: true, scaleX: 1, scaleY: 1 });
    expect(step1.el_group).toMatchObject({ visible: false, opacity: 0 });

    expect(step3.el_chart).toMatchObject({
      visible: false,
      opacity: 0,
      scaleX: 0,
      scaleY: 0
    });
    expect(step3.el_custom?.rotation).toBe(0);
  });

  it("keeps grouped children out of top-level render state", () => {
    const states = computeSettledElementStates({
      deck: p0AnimationDeck,
      slide,
      stepIndex: 0,
      triggerAnimationIds: []
    });

    expect(states.el_group).toBeDefined();
    expect(states.el_group_rect).toBeUndefined();
    expect(states.el_group_label).toBeUndefined();
  });

  it("clamps step indexes at command boundaries", () => {
    expect(clampSlideshowStepIndex(-3, 2)).toBe(0);
    expect(clampSlideshowStepIndex(1.8, 2)).toBe(1);
    expect(clampSlideshowStepIndex(9, 2)).toBe(2);
    expect(clampSlideshowStepIndex(Number.NaN, 2)).toBe(0);
  });
});
