import { describe, expect, it } from "vitest";

import type { Slide } from "@orbit/shared";

import {
  createSlidePlaybackState,
  executeSlideAction,
  getNextClickAnimation,
  playNextClickAnimation,
  resolveCueActions
} from "./slidePlayback";

function createSlide(): Slide {
  return {
    slideId: "slide_1",
    order: 1,
    title: "Slide",
    thumbnailUrl: "",
    style: {},
    speakerNotes: "",
    elements: [
      {
        elementId: "el_1",
        type: "text",
        role: "body",
        x: 120,
        y: 80,
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
    keywords: [],
    animations: [
      {
        animationId: "anim_1",
        elementId: "el_1",
        type: "appear",
        order: 1,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out"
      },
      {
        animationId: "anim_2",
        elementId: "el_1",
        type: "disappear",
        order: 2,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out"
      }
    ],
    actions: [
      {
        actionId: "act_1",
        trigger: {
          kind: "cue",
          cue: "강조"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_2"
        }
      },
      {
        actionId: "act_2",
        trigger: {
          kind: "cue",
          cue: "다음"
        },
        effect: {
          kind: "go-to-next-slide"
        }
      }
    ]
  };
}

describe("slidePlayback", () => {
  it("returns click animations in order", () => {
    const slide = createSlide();
    const initialState = createSlidePlaybackState();
    const nextAnimation = getNextClickAnimation(slide, initialState);

    expect(nextAnimation?.animationId).toBe("anim_1");

    const firstPlay = playNextClickAnimation(slide, initialState);
    const secondPlay = playNextClickAnimation(slide, firstPlay!.state);

    expect(firstPlay?.animation.animationId).toBe("anim_1");
    expect(secondPlay?.animation.animationId).toBe("anim_2");
  });

  it("resolves cue actions case-insensitively", () => {
    const slide = createSlide();

    const actions = resolveCueActions(slide, "  강조 ");

    expect(actions.map((action) => action.actionId)).toEqual(["act_1"]);
  });

  it("executes cue-driven animation actions once", () => {
    const slide = createSlide();
    const action = slide.actions[0];
    const initialState = createSlidePlaybackState();
    const result = executeSlideAction(slide, initialState, action);

    expect(result).toMatchObject({
      kind: "play-animation",
      animation: {
        animationId: "anim_2"
      }
    });

    const repeated = executeSlideAction(slide, result!.state, action);

    expect(repeated).toBeNull();
  });

  it("returns slide advance actions without mutating playback state", () => {
    const slide = createSlide();
    const action = slide.actions[1];
    const state = createSlidePlaybackState();
    const result = executeSlideAction(slide, state, action);

    expect(result).toEqual({
      kind: "go-to-next-slide",
      action,
      state
    });
  });
});
