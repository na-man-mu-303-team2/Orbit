import { describe, expect, it } from "vitest";

import type { Slide } from "@orbit/shared";

import { createSlideRuntimeAdapter } from "./slideRuntime";

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
        type: "fade-in",
        order: 1,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out"
      },
      {
        animationId: "anim_2",
        elementId: "el_1",
        type: "fade-out",
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
          kind: "keyword",
          keywordId: "kw_1"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_2"
        }
      },
      {
        actionId: "act_2",
        trigger: {
          kind: "keyword",
          keywordId: "kw_1"
        },
        effect: {
          kind: "go-to-next-slide"
        }
      },
      {
        actionId: "act_3",
        trigger: {
          kind: "cue",
          cue: "강조"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_2"
        }
      }
    ]
  };
}

describe("slideRuntime", () => {
  it("creates a slide-scoped adapter that resolves trigger-controlled animations", () => {
    const adapter = createSlideRuntimeAdapter(createSlide());

    expect(adapter.getTriggerAnimationIds()).toEqual(["anim_2"]);
    expect(adapter.resolveTrigger({ keywordId: "kw_1" }).map((action) => action.actionId)).toEqual([
      "act_1",
      "act_2"
    ]);
  });

  it("executes a trigger without exposing slide internals to callers", () => {
    const adapter = createSlideRuntimeAdapter(createSlide());
    const initialState = adapter.createState();
    const result = adapter.executeTrigger(initialState, { keywordId: "kw_1" });

    expect(result.actions.map((action) => action.actionId)).toEqual(["act_1", "act_2"]);
    expect(result.animationIds).toEqual(["anim_2"]);
    expect(result.shouldAdvanceSlide).toBe(true);
    expect(result.state.executedStepIds).toEqual(["action:act_1", "action:act_2"]);
    expect(adapter.getExecutedAnimationIds(result.state)).toEqual(["anim_2"]);
  });

  it("shares playback state between trigger execution and click playback", () => {
    const adapter = createSlideRuntimeAdapter(createSlide());
    const initialState = adapter.createState();
    const triggerResult = adapter.executeTrigger(initialState, { cue: "강조" });
    const clickResult = adapter.playNextClickAnimation(triggerResult.state);

    expect(triggerResult.animationIds).toEqual(["anim_2"]);
    expect(clickResult?.animation.animationId).toBe("anim_1");
    expect(adapter.getExecutedAnimationIds(clickResult!.state)).toEqual([
      "anim_1",
      "anim_2"
    ]);
    expect(adapter.getNextClickAnimation(clickResult!.state)).toBeNull();
  });

  it("derives runtime snapshots only from executed step ids", () => {
    const adapter = createSlideRuntimeAdapter(createSlide());

    expect(adapter.getSnapshot(adapter.createState())).toEqual({
      executedAnimationIds: [],
      isComplete: false,
      stepIndex: 0,
      triggerAnimationIds: ["anim_2"]
    });

    const triggered = adapter.executeTrigger(adapter.createState(), {
      keywordId: "kw_1"
    });

    expect(adapter.getSnapshot(triggered.state)).toEqual({
      executedAnimationIds: ["anim_2"],
      isComplete: true,
      stepIndex: 1,
      triggerAnimationIds: ["anim_2"]
    });
  });

  it("advances keyword-triggered animation steps on click without a separate step index", () => {
    const adapter = createSlideRuntimeAdapter(createSlide());
    const advanced = adapter.advanceOnClick(adapter.createState());

    expect(advanced).toEqual({
      animationIds: ["anim_2"],
      state: {
        executedStepIds: ["click:anim_2"]
      }
    });
    expect(adapter.getSnapshot(advanced!.state)).toMatchObject({
      executedAnimationIds: ["anim_2"],
      isComplete: true,
      stepIndex: 1
    });
    expect(adapter.advanceOnClick(advanced!.state)).toBeNull();
  });
});
