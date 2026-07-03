import { describe, expect, it } from "vitest";

import type { Slide } from "@orbit/shared";

import { createPresenterSlideshowRuntime } from "./slideshowRuntime";

function createSlide(): Slide {
  return {
    slideId: "slide_1",
    order: 1,
    title: "Runtime",
    thumbnailUrl: "",
    style: {},
    speakerNotes: "",
    elements: [
      {
        elementId: "el_1",
        type: "text",
        role: "body",
        x: 0,
        y: 0,
        width: 320,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        locked: false,
        visible: true,
        props: {
          text: "Hello",
          fontSize: 24,
          fontWeight: "normal",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      }
    ],
    keywords: [
      {
        keywordId: "kw_1",
        text: "강조",
        synonyms: [],
        abbreviations: [],
        required: false
      }
    ],
    animations: [
      {
        animationId: "anim_1",
        elementId: "el_1",
        type: "fade-in",
        order: 1,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out"
      }
    ],
    actions: [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword",
          keywordId: "kw_1"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ]
  };
}

describe("slideshowRuntime", () => {
  it("creates a render snapshot from playback state without leaking slide internals", () => {
    const runtime = createPresenterSlideshowRuntime(createSlide());
    const initialPlayback = runtime.createPlaybackState();
    const initialSnapshot = runtime.createSnapshot(initialPlayback);
    const triggerResult = runtime.executeTrigger(initialPlayback, { keywordId: "kw_1" });
    const triggeredSnapshot = runtime.createSnapshot(triggerResult.state);

    expect(initialSnapshot).toEqual({
      executedAnimationIds: [],
      isComplete: false,
      stepIndex: 0,
      triggerAnimationIds: ["anim_1"]
    });
    expect(triggeredSnapshot).toEqual({
      executedAnimationIds: ["anim_1"],
      isComplete: true,
      stepIndex: 1,
      triggerAnimationIds: ["anim_1"]
    });
  });

  it("advances keyword-triggered steps before moving to the next slide", () => {
    const runtime = createPresenterSlideshowRuntime(createSlide());
    const advanced = runtime.advanceOnClick({
      currentSlideIndex: 0,
      playbackState: runtime.createPlaybackState(),
      slideCount: 2
    });
    const moved = runtime.advanceOnClick({
      currentSlideIndex: 0,
      playbackState: advanced.playbackState,
      slideCount: 2
    });

    expect(advanced).toEqual({
      playbackState: { executedStepIds: ["click:anim_1"] },
      slideIndex: 0
    });
    expect(moved).toEqual({
      playbackState: { executedStepIds: [] },
      slideIndex: 1
    });
  });
});
