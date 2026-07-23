import type { Slide } from "@orbit/shared";
import { deriveKeywordOccurrences } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  buildSlidePresentationSequence,
  getPresentationSequenceReviewSlideIds,
} from "./presentationSequence";

describe("buildSlidePresentationSequence", () => {
  it("keeps manual slots while ordering keyword steps by speaker note occurrence", () => {
    const baseSlide = createSlide();
    const occurrences = deriveKeywordOccurrences(baseSlide);
    const first = occurrences.find((occurrence) => occurrence.keywordId === "kw_first");
    const second = occurrences.find((occurrence) => occurrence.keywordId === "kw_second");
    if (!first || !second) throw new Error("expected keyword occurrences");
    const slide: Slide = {
      ...baseSlide,
      actions: [
        occurrenceAction("act_second", "kw_second", second.occurrenceId, "anim_second"),
        occurrenceAction("act_first", "kw_first", first.occurrenceId, "anim_first"),
      ],
    };

    const sequence = buildSlidePresentationSequence(slide);

    expect(sequence.steps.map((step) => step.animationIds)).toEqual([
      ["anim_manual"],
      ["anim_first"],
      ["anim_second"],
    ]);
    expect(sequence.keywordOrderMatchesTimeline).toBe(false);
    expect(sequence.animationOrderById.get("anim_first")).toBeLessThan(
      sequence.animationOrderById.get("anim_second") ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("groups all effects linked to one occurrence into one speech step", () => {
    const baseSlide = createSlide();
    const occurrence = deriveKeywordOccurrences(baseSlide).find(
      (candidate) => candidate.keywordId === "kw_first",
    );
    if (!occurrence) throw new Error("expected keyword occurrence");
    const slide: Slide = {
      ...baseSlide,
      animations: [
        ...baseSlide.animations,
        {
          ...baseSlide.animations[1]!,
          animationId: "anim_first_companion",
          elementId: "el_4",
          order: 4,
        },
      ],
      actions: [
        occurrenceAction("act_first", "kw_first", occurrence.occurrenceId, "anim_first"),
        occurrenceAction(
          "act_first_companion",
          "kw_first",
          occurrence.occurrenceId,
          "anim_first_companion",
        ),
      ],
    };

    const sequence = buildSlidePresentationSequence(slide);

    expect(sequence.steps.find((step) => step.occurrenceId === occurrence.occurrenceId)?.animationIds)
      .toEqual(["anim_first", "anim_first_companion"]);
  });

  it("requires review when persisted keyword steps no longer follow notes", () => {
    const baseSlide = createSlide();
    const occurrences = deriveKeywordOccurrences(baseSlide);
    const first = occurrences.find((occurrence) => occurrence.keywordId === "kw_first");
    const second = occurrences.find((occurrence) => occurrence.keywordId === "kw_second");
    if (!first || !second) throw new Error("expected keyword occurrences");
    const slide: Slide = {
      ...baseSlide,
      actions: [
        occurrenceAction("act_second", "kw_second", second.occurrenceId, "anim_second"),
        occurrenceAction("act_first", "kw_first", first.occurrenceId, "anim_first"),
      ],
    };

    expect(getPresentationSequenceReviewSlideIds({ slides: [slide] })).toEqual([
      slide.slideId,
    ]);
  });
});

function occurrenceAction(
  actionId: string,
  keywordId: string,
  occurrenceId: string,
  animationId: string,
) {
  return {
    actionId,
    trigger: { kind: "keyword-occurrence" as const, keywordId, occurrenceId },
    effect: { kind: "play-animation" as const, animationId },
  };
}

function createSlide(): Slide {
  return {
    actions: [],
    animations: [
      {
        animationId: "anim_manual",
        delayMs: 0,
        durationMs: 400,
        easing: "ease-out",
        elementId: "el_1",
        order: 1,
        startMode: "on-click",
        type: "fade-in",
      },
      {
        animationId: "anim_second",
        delayMs: 0,
        durationMs: 400,
        easing: "ease-out",
        elementId: "el_2",
        order: 2,
        startMode: "on-click",
        type: "fade-in",
      },
      {
        animationId: "anim_first",
        delayMs: 0,
        durationMs: 400,
        easing: "ease-out",
        elementId: "el_3",
        order: 3,
        startMode: "on-click",
        type: "fade-in",
      },
    ],
    elements: [],
    keywords: [
      { abbreviations: [], keywordId: "kw_first", required: true, synonyms: [], text: "앞" },
      { abbreviations: [], keywordId: "kw_second", required: true, synonyms: [], text: "뒤" },
    ],
    kind: "content",
    order: 1,
    semanticCues: [],
    slideId: "slide_1",
    speakerNotes: "앞 키워드 다음 뒤 키워드",
    style: {},
    thumbnailUrl: "",
    title: "순서",
  };
}
