import { describe, expect, it } from "vitest";

import type { Slide } from "@orbit/shared";

import { createDemoDeck } from "../index";
import {
  advanceAnimationRuntimeState,
  buildAnimationSequence,
  completeAnimationRuntimeState,
  createInitialAnimationRuntimeState,
  resetAnimationRuntimeState,
  resolveAnimationRenderState,
} from "./runtime";

function createAnimationTestSlide(): Slide {
  const deck = createDemoDeck();

  return {
    ...deck.slides[0],
    elements: [
      {
        elementId: "el_1",
        type: "text",
        role: "title",
        x: 120,
        y: 96,
        width: 400,
        height: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        locked: false,
        visible: true,
        props: {
          text: "Intro",
          fontSize: 44,
          fontWeight: "bold",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2,
        },
      },
      {
        elementId: "el_2",
        type: "rect",
        role: "highlight",
        x: 680,
        y: 180,
        width: 360,
        height: 200,
        rotation: 0,
        opacity: 0.9,
        zIndex: 2,
        locked: false,
        visible: true,
        props: {
          fill: "#dbeafe",
          stroke: "#93c5fd",
          strokeWidth: 2,
          borderRadius: 16,
        },
      },
    ],
    animations: [
      {
        animationId: "anim_2",
        elementId: "el_2",
        type: "fade-out",
        order: 2,
        durationMs: 300,
        delayMs: 0,
        easing: "ease-in",
      },
      {
        animationId: "anim_1",
        elementId: "el_1",
        type: "fade-in",
        order: 1,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out",
      },
      {
        animationId: "anim_3",
        elementId: "el_1",
        type: "rotate",
        order: 3,
        durationMs: 500,
        delayMs: 120,
        easing: "ease-in-out",
      },
    ],
  };
}

describe("animation runtime", () => {
  it("builds a sorted sequence with derived step kinds", () => {
    const slide = createAnimationTestSlide();
    const sequence = buildAnimationSequence(slide);

    expect(sequence.steps.map((step) => step.animationId)).toEqual([
      "anim_1",
      "anim_2",
      "anim_3",
    ]);
    expect(sequence.steps.map((step) => step.kind)).toEqual([
      "enter",
      "exit",
      "emphasis",
    ]);
  });

  it("computes initial render state from the first animation on each element", () => {
    const slide = createAnimationTestSlide();
    const sequence = buildAnimationSequence(slide);
    const runtimeState = createInitialAnimationRuntimeState(sequence);
    const renderState = resolveAnimationRenderState(slide, sequence, runtimeState);

    expect(renderState.elements.el_1.visible).toBe(false);
    expect(renderState.elements.el_1.opacity).toBe(0);
    expect(renderState.elements.el_2.visible).toBe(true);
    expect(renderState.elements.el_2.opacity).toBe(0.9);
  });

  it("advances step-by-step and exposes the active step", () => {
    const slide = createAnimationTestSlide();
    const sequence = buildAnimationSequence(slide);
    const initialState = createInitialAnimationRuntimeState(sequence);
    const nextState = advanceAnimationRuntimeState(sequence, initialState);
    const renderState = resolveAnimationRenderState(slide, sequence, nextState);

    expect(nextState.currentStepIndex).toBe(1);
    expect(nextState.executedAnimationIds).toEqual(["anim_1"]);
    expect(renderState.activeStep?.animationId).toBe("anim_1");
    expect(renderState.elements.el_1.visible).toBe(true);
    expect(renderState.elements.el_1.opacity).toBe(1);
  });

  it("applies exit animations after their step is executed", () => {
    const slide = createAnimationTestSlide();
    const sequence = buildAnimationSequence(slide);
    const stateAfterFirstStep = advanceAnimationRuntimeState(
      sequence,
      createInitialAnimationRuntimeState(sequence),
    );
    const stateAfterSecondStep = advanceAnimationRuntimeState(
      sequence,
      stateAfterFirstStep,
    );
    const renderState = resolveAnimationRenderState(
      slide,
      sequence,
      stateAfterSecondStep,
    );

    expect(renderState.elements.el_2.visible).toBe(false);
    expect(renderState.elements.el_2.opacity).toBe(0);
  });

  it("can jump to complete state and reset back to initial state", () => {
    const slide = createAnimationTestSlide();
    const sequence = buildAnimationSequence(slide);
    const completedState = completeAnimationRuntimeState(sequence);
    const completedRenderState = resolveAnimationRenderState(
      slide,
      sequence,
      completedState,
    );
    const resetState = resetAnimationRuntimeState(sequence);

    expect(completedState.status).toBe("completed");
    expect(completedState.executedAnimationIds).toEqual([
      "anim_1",
      "anim_2",
      "anim_3",
    ]);
    expect(completedRenderState.activeStep).toBeNull();
    expect(completedRenderState.elements.el_1.visible).toBe(true);
    expect(completedRenderState.elements.el_2.visible).toBe(false);

    expect(resetState.currentStepIndex).toBe(0);
    expect(resetState.executedAnimationIds).toEqual([]);
    expect(resetState.lastTriggeredAnimationId).toBeNull();
  });
});
