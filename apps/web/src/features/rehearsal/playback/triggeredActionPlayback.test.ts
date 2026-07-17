import { describe, expect, it } from "vitest";
import { createSlidePlaybackState } from "@orbit/editor-core";

import type { Slide } from "@orbit/shared";

import {
  getTriggerAnimationIdsForSlide,
  getKeywordOccurrenceTriggerIdsForSlide,
  resolveKeywordOccurrenceTriggeredActions,
  resolveKeywordTriggeredActions,
  resolveTriggeredActionPlaybackUpdate
} from "./triggeredActionPlayback";
import { createSlideshowAnimationPlan } from "../presenter/slideshowStepModel";

describe("triggeredActionPlayback", () => {
  it("keeps legacy keyword and keyword occurrence trigger resolution separate", () => {
    const slide = createSlide();

    expect(
      resolveKeywordTriggeredActions(slide, "kw_other").map((action) => action.actionId)
    ).toEqual(["act_legacy_other"]);
    expect(
      resolveKeywordOccurrenceTriggeredActions(
        slide,
        "kw_ai",
        "kwo_slide_1_kw_ai_47_49"
      ).map((action) => action.actionId)
    ).toEqual(["act_occurrence"]);
    expect(getKeywordOccurrenceTriggerIdsForSlide(slide)).toEqual([
      "kwo_slide_1_kw_ai_47_49"
    ]);
  });

  it("does not resolve broad legacy keyword actions for a keyword controlled by occurrences", () => {
    const slide = createSlide();

    expect(resolveKeywordTriggeredActions(slide, "kw_ai")).toEqual([]);
  });

  it("runs a follower action as one root chain and settles the step monotonically", () => {
    const slide = createSlide();
    slide.animations[0]!.startMode = "on-click";
    slide.animations[1]!.startMode = "with-previous";
    const plan = createSlideshowAnimationPlan({ slide });
    const actions = resolveKeywordOccurrenceTriggeredActions(
      slide,
      "kw_ai",
      "kwo_slide_1_kw_ai_47_49"
    );
    const first = resolveTriggeredActionPlaybackUpdate({
      actions,
      playbackState: createSlidePlaybackState(),
      presenterStepIndex: 0,
      slide,
      slideAnimationPlan: plan
    });
    const repeated = resolveTriggeredActionPlaybackUpdate({
      actions,
      playbackState: first.playbackState,
      presenterStepIndex: first.presenterStepIndex,
      slide,
      slideAnimationPlan: plan
    });

    expect(first.presenterStepIndex).toBe(1);
    expect(first.playbackState.playedAnimationIds).toEqual([
      "anim_legacy",
      "anim_occurrence"
    ]);
    expect(repeated).toEqual(first);
  });

  it("keeps an invalid legacy action as an overlay without changing explicit entry timing", () => {
    const slide = createSlide();
    slide.animations[0]!.startMode = "on-slide-enter";
    slide.animations[1]!.startMode = "with-previous";
    const triggerAnimationIds = getTriggerAnimationIdsForSlide(slide);
    const plan = createSlideshowAnimationPlan({ slide, triggerAnimationIds });
    const actions = resolveKeywordOccurrenceTriggeredActions(
      slide,
      "kw_ai",
      "kwo_slide_1_kw_ai_47_49"
    );
    const update = resolveTriggeredActionPlaybackUpdate({
      actions,
      playbackState: createSlidePlaybackState(),
      presenterStepIndex: 0,
      slide,
      slideAnimationPlan: plan
    });

    expect(plan.entryAnimations.map(({ animationId }) => animationId)).toEqual([
      "anim_legacy",
      "anim_occurrence"
    ]);
    expect(plan.triggerSteps).toEqual([]);
    expect(update.presenterStepIndex).toBe(0);
    expect(update.playbackState.playedAnimationIds).toEqual([
      "anim_legacy",
      "anim_occurrence"
    ]);
  });
});

function createSlide(): Slide {
  return {
    slideId: "slide_1",
    order: 1,
    title: "AI",
    thumbnailUrl: "",
    style: {},
    speakerNotes:
      "오늘은 AI 덱 생성 파이프라인을 소개합니다. 중간에도 AI를 언급합니다. 마지막에 AI를 말하면 이미지가 나타납니다.",
    keywords: [
      {
        keywordId: "kw_ai",
        text: "AI",
        synonyms: [],
        abbreviations: [],
        required: true
      },
      {
        keywordId: "kw_other",
        text: "ORBIT",
        synonyms: [],
        abbreviations: [],
        required: false
      }
    ],
    semanticCues: [],
    elements: [],
    animations: [
      {
        animationId: "anim_legacy",
        elementId: "el_1",
        type: "fade-in",
        order: 1,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out"
      },
      {
        animationId: "anim_occurrence",
        elementId: "el_2",
        type: "fade-in",
        order: 2,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out"
      }
    ],
    actions: [
      {
        actionId: "act_legacy_ai",
        trigger: {
          kind: "keyword",
          keywordId: "kw_ai"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_legacy"
        }
      },
      {
        actionId: "act_legacy_other",
        trigger: {
          kind: "keyword",
          keywordId: "kw_other"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_legacy"
        }
      },
      {
        actionId: "act_occurrence",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_ai",
          occurrenceId: "kwo_slide_1_kw_ai_47_49"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_occurrence"
        }
      }
    ],
    aiNotes: {
      emphasisPoints: [],
      sourceEvidence: []
    }
  };
}
