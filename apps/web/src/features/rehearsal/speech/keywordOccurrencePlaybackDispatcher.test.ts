import { describe, expect, it } from "vitest";
import type { Slide } from "@orbit/shared";

import { dispatchKeywordOccurrencePlayback } from "./keywordOccurrencePlaybackDispatcher";

const slide = {
  actions: [
    { actionId: "a", trigger: { kind: "keyword-occurrence", keywordId: "a", occurrenceId: "oa" }, effect: { kind: "play-animation", animationId: "anim-a" } },
    { actionId: "b", trigger: { kind: "keyword-occurrence", keywordId: "b", occurrenceId: "ob" }, effect: { kind: "play-animation", animationId: "anim-b" } },
  ],
  elements: [],
  animations: [
    { animationId: "anim-a", elementId: "el-a", type: "fade-in", order: 1, durationMs: 1, delayMs: 0, easing: "ease-out" },
    { animationId: "anim-b", elementId: "el-b", type: "fade-in", order: 2, durationMs: 1, delayMs: 0, easing: "ease-out" },
  ],
  keywords: [
    { keywordId: "a", text: "알파", synonyms: [], abbreviations: [], required: true },
    { keywordId: "b", text: "베타", synonyms: [], abbreviations: [], required: true },
  ],
  slideId: "slide-1",
  speakerNotes: "알파 다음 베타",
} as unknown as Slide;

const plan = {
  maxStepIndex: 2,
  triggerSteps: [
    { animations: [{ animationId: "anim-a" }], durationMs: 1, order: 1, rootAnimationId: "anim-a" },
    { animations: [{ animationId: "anim-b" }], durationMs: 1, order: 2, rootAnimationId: "anim-b" },
  ],
} as never;

describe("keyword occurrence playback dispatcher", () => {
  it("executes each independent STT increment using the latest runtime step", () => {
    const first = dispatchKeywordOccurrencePlayback({
      confidence: 1,
      consumedOccurrenceIds: [],
      newSegment: "알파",
      pendingOccurrenceIds: [],
      playbackState: { playedAnimationIds: [] },
      presenterStepIndex: 0,
      slide,
      slideAnimationPlan: plan,
    });
    expect(first.queuedPlayback.update).toMatchObject({ presenterStepIndex: 1 });
    expect(first.queuedPlayback.consumedOccurrenceIds).toEqual(["oa"]);

    const second = dispatchKeywordOccurrencePlayback({
      confidence: 1,
      consumedOccurrenceIds: first.queuedPlayback.consumedOccurrenceIds,
      newSegment: "베타",
      pendingOccurrenceIds: first.queuedPlayback.pendingOccurrenceIds,
      playbackState: first.queuedPlayback.update!.playbackState,
      presenterStepIndex: first.queuedPlayback.update!.presenterStepIndex,
      slide,
      slideAnimationPlan: plan,
    });
    expect(second.queuedPlayback.update).toMatchObject({ presenterStepIndex: 2 });
    expect(second.queuedPlayback.consumedOccurrenceIds).toEqual(["ob"]);
  });

  it("queues a future keyword without consuming it before its step", () => {
    const dispatched = dispatchKeywordOccurrencePlayback({
      confidence: 1,
      consumedOccurrenceIds: [],
      newSegment: "베타",
      pendingOccurrenceIds: [],
      playbackState: { playedAnimationIds: [] },
      presenterStepIndex: 0,
      slide,
      slideAnimationPlan: plan,
    });
    expect(dispatched.queuedPlayback.update).toBeNull();
    expect(dispatched.queuedPlayback.pendingOccurrenceIds).toEqual(["ob"]);
  });

  it("executes a terminal occurrence next-slide action", () => {
    const terminalSlide = {
      ...slide,
      actions: [
        ...slide.actions,
        {
          actionId: "next",
          effect: { kind: "go-to-next-slide" },
          trigger: { kind: "keyword-occurrence", keywordId: "b", occurrenceId: "onext" },
        },
      ],
    } as Slide;
    const dispatched = dispatchKeywordOccurrencePlayback({
      confidence: 1,
      consumedOccurrenceIds: ["oa", "ob"],
      newSegment: "베타",
      pendingOccurrenceIds: [],
      playbackState: { playedAnimationIds: ["anim-a", "anim-b"] },
      presenterStepIndex: 2,
      slide: terminalSlide,
      slideAnimationPlan: plan,
    });

    expect(dispatched.queuedPlayback.consumedOccurrenceIds).toEqual(["onext"]);
    expect(dispatched.queuedPlayback.update?.shouldAdvanceSlide).toBe(true);
  });
});
