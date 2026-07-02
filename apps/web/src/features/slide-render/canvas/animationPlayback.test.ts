import {
  advanceAnimationRuntimeState,
  buildAnimationSequence,
  createInitialAnimationRuntimeState,
  resolveAnimationRenderState,
  type AnimationSequenceStep
} from "@orbit/editor-core";
import type { Slide } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  getSlideAnimationAdvanceAction
} from "./animationPlayback";
import { resolveSlideCanvasElementState } from "./slideCanvasElementState";

function createPlaybackTestSlide(): Slide {
  return {
    slideId: "slide_1",
    order: 1,
    title: "Playback",
    thumbnailUrl: "",
    style: {
      layout: "title-content",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      accentColor: "#2563eb"
    },
    speakerNotes: "",
    keywords: [],
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
          lineHeight: 1.2
        }
      }
    ],
    animations: [
      {
        animationId: "anim_1",
        elementId: "el_1",
        type: "fade-in",
        order: 1,
        durationMs: 400,
        delayMs: 100,
        easing: "ease-out"
      }
    ]
  };
}

describe("slide animation playback", () => {
  it("prefers completing the current animation before any further advance", () => {
    const sequence = buildAnimationSequence(createPlaybackTestSlide());
    const runtimeState = createInitialAnimationRuntimeState(sequence);

    expect(
      getSlideAnimationAdvanceAction({
        isPlaying: true,
        runtimeState,
        sequence
      })
    ).toBe("complete-playing-step");
  });

  it("advances animation steps before moving to the next slide", () => {
    const sequence = buildAnimationSequence(createPlaybackTestSlide());
    const runtimeState = createInitialAnimationRuntimeState(sequence);

    expect(
      getSlideAnimationAdvanceAction({
        isPlaying: false,
        runtimeState,
        sequence
      })
    ).toBe("advance-animation-step");

    const completedState = advanceAnimationRuntimeState(sequence, runtimeState);

    expect(
      getSlideAnimationAdvanceAction({
        isPlaying: false,
        runtimeState: completedState,
        sequence
      })
    ).toBe("advance-slide");
  });

  it("applies active fade-in playback to the rendered element state", () => {
    const slide = createPlaybackTestSlide();
    const sequence = buildAnimationSequence(slide);
    const runtimeState = advanceAnimationRuntimeState(
      sequence,
      createInitialAnimationRuntimeState(sequence)
    );
    const renderState = resolveAnimationRenderState(slide, sequence, runtimeState);
    const step = sequence.steps[0] as AnimationSequenceStep;
    const elementState = resolveSlideCanvasElementState({
      activePlaybackStep: step,
      animationRenderState: renderState,
      element: slide.elements[0]!,
      playbackProgress: 0.6
    });

    expect(elementState.visible).toBe(true);
    expect(elementState.opacity).toBeGreaterThan(0);
    expect(elementState.opacity).toBeLessThan(1);
    expect(elementState.scale).toBe(1);
  });
});
