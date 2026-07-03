import { describe, expect, it } from "vitest";

import type { Slide } from "@orbit/shared";

import {
  createSlidePlaybackState,
  executeSlideAction,
  getNextClickAnimation,
  playNextClickAnimation,
  resolveCueActions,
  resolveTriggeredActions
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

  it("resolves keyword-triggered actions by keywordId", () => {
    const slide = createSlide();
    slide.actions.push({
      actionId: "act_3",
      trigger: {
        kind: "keyword",
        keywordId: "kw_1"
      },
      effect: {
        kind: "go-to-next-slide"
      }
    });

    const actions = resolveTriggeredActions(slide, { keywordId: "kw_1" });

    expect(actions.map((action) => action.actionId)).toEqual(["act_3"]);
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

  it("skips click fallback for animations already executed by an action", () => {
    const slide = createSlide();
    const initialState = createSlidePlaybackState();
    const cueResult = executeSlideAction(slide, initialState, slide.actions[0]!);
    const nextAnimation = getNextClickAnimation(slide, cueResult!.state);

    expect(nextAnimation?.animationId).toBe("anim_1");

    const clickResult = playNextClickAnimation(slide, cueResult!.state);

    expect(clickResult?.animation.animationId).toBe("anim_1");
    expect(playNextClickAnimation(slide, clickResult!.state)).toBeNull();
  });

  it("executes slide advance actions once and records runtime progress", () => {
    const slide = createSlide();
    const action = slide.actions[1];
    const initialState = createSlidePlaybackState();
    const result = executeSlideAction(slide, initialState, action);

    expect(result).toMatchObject({
      kind: "go-to-next-slide",
      action,
      state: {
        executedStepIds: ["action:act_2"]
      }
    });

    expect(executeSlideAction(slide, result!.state, action)).toBeNull();
  });
});
