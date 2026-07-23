import { describe, expect, it } from "vitest";
import type { Slide } from "@orbit/shared";

import {
  findFutureKeywordOccurrenceMatches,
  getExpectedKeywordOccurrenceStep,
  matchExpectedKeywordOccurrenceStep
} from "./keywordOccurrenceStepResolver";

const slide = {
  actions: [
    { actionId: "a1", trigger: { kind: "keyword-occurrence", keywordId: "ka", occurrenceId: "oa" }, effect: { kind: "play-animation", animationId: "anim-a" } },
    { actionId: "a2", trigger: { kind: "keyword-occurrence", keywordId: "kb", occurrenceId: "ob" }, effect: { kind: "play-animation", animationId: "anim-b" } }
  ],
  animations: [],
  keywords: [
    { keywordId: "ka", text: "알파", synonyms: [], abbreviations: [], required: true },
    { keywordId: "kb", text: "베타", synonyms: [], abbreviations: [], required: true }
  ],
  slideId: "slide-1",
  speakerNotes: "알파 다음 베타"
} as unknown as Slide;

const plan = {
  triggerSteps: [
    { animations: [{ animationId: "anim-a" }], durationMs: 1, order: 1, rootAnimationId: "anim-a" },
    { animations: [{ animationId: "anim-b" }], durationMs: 1, order: 2, rootAnimationId: "anim-b" }
  ]
} as never;

describe("current-step keyword occurrence resolver", () => {
  it("matches only the occurrence expected by the current step", () => {
    const expectedStep = getExpectedKeywordOccurrenceStep({ presenterStepIndex: 1, slide, slideAnimationPlan: plan });
    expect(matchExpectedKeywordOccurrenceStep({ expectedStep, slide, newSegment: "알파와 베타", consumedOccurrenceIds: [], confidence: 1 })).toMatchObject({
      blocker: null,
      matches: [{ occurrenceId: "ob" }]
    });
  });

  it("does not use script offset or a previous occurrence to select a future step", () => {
    const expectedStep = getExpectedKeywordOccurrenceStep({ presenterStepIndex: 1, slide, slideAnimationPlan: plan });
    expect(matchExpectedKeywordOccurrenceStep({ expectedStep, slide, newSegment: "알파", consumedOccurrenceIds: ["oa"], confidence: 1 }).blocker).toBe("no-keyword-hit");
  });

  it("retains one current-step candidate for low-confidence manual approval", () => {
    const expectedStep = getExpectedKeywordOccurrenceStep({
      presenterStepIndex: 0,
      slide,
      slideAnimationPlan: plan
    });
    expect(
      matchExpectedKeywordOccurrenceStep({
        confidence: 0.5,
        consumedOccurrenceIds: [],
        expectedStep,
        newSegment: "알파",
        slide
      })
    ).toMatchObject({
      blocker: "confidence-low",
      candidates: [{ occurrenceId: "oa" }],
      matches: []
    });
  });

  it("queues future occurrences only in the order they appear in a single final", () => {
    expect(
      findFutureKeywordOccurrenceMatches({
        confidence: 1,
        consumedOccurrenceIds: [],
        newSegment: "알파 이후 베타",
        presenterStepIndex: 0,
        slide,
        slideAnimationPlan: plan
      })
    ).toMatchObject([{ occurrenceId: "ob" }]);

    expect(
      findFutureKeywordOccurrenceMatches({
        confidence: 1,
        consumedOccurrenceIds: [],
        newSegment: "베타 이후 알파",
        presenterStepIndex: 0,
        slide,
        slideAnimationPlan: plan
      })
    ).toEqual([]);

    expect(
      findFutureKeywordOccurrenceMatches({
        confidence: 1,
        consumedOccurrenceIds: [],
        newSegment: "베타만 먼저 발화",
        presenterStepIndex: 0,
        slide,
        slideAnimationPlan: plan
      })
    ).toMatchObject([{ occurrenceId: "ob" }]);
  });

  it("exposes an occurrence next-slide action as the terminal step", () => {
    const terminalSlide = {
      ...slide,
      actions: [
        ...slide.actions,
        {
          actionId: "next",
          effect: { kind: "go-to-next-slide" },
          trigger: { kind: "keyword-occurrence", keywordId: "kb", occurrenceId: "onext" },
        },
      ],
    } as Slide;
    const terminalPlan = {
      maxStepIndex: 2,
      triggerSteps: [
        { animations: [{ animationId: "anim-a" }], durationMs: 1, order: 1, rootAnimationId: "anim-a" },
        { animations: [{ animationId: "anim-b" }], durationMs: 1, order: 2, rootAnimationId: "anim-b" },
      ],
    } as never;

    expect(
      getExpectedKeywordOccurrenceStep({
        presenterStepIndex: 2,
        slide: terminalSlide,
        slideAnimationPlan: terminalPlan,
      }),
    ).toMatchObject({ occurrenceIds: ["onext"], stepIndex: 2 });
  });
});
