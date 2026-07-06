import { describe, expect, it } from "vitest";

import type { Slide } from "@orbit/shared";

import {
  getKeywordOccurrenceTriggerIdsForSlide,
  resolveKeywordOccurrenceTriggeredActions,
  resolveKeywordTriggeredActions
} from "./triggeredActionPlayback";

describe("triggeredActionPlayback", () => {
  it("keeps legacy keyword and keyword occurrence trigger resolution separate", () => {
    const slide = createSlide();

    expect(resolveKeywordTriggeredActions(slide, "kw_ai").map((action) => action.actionId)).toEqual([
      "act_legacy"
    ]);
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
      }
    ],
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
        actionId: "act_legacy",
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
