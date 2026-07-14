import { deckSchema, rehearsalEvaluationSnapshotSchema } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  assertFocusedPracticeTimeline,
  focusedPracticeSentenceSnapshotHash,
  FocusedPracticeTargetValidationError,
  resolveFocusedPracticeTarget,
} from "./focused-practice-target";

const sourceSnapshot = rehearsalEvaluationSnapshotSchema.parse({
  deckId: "deck_a",
  deckVersion: 1,
  deckContentHash: null,
  evaluationPlan: null,
  focusProfileSnapshot: null,
  capturedAt: "2026-07-13T00:00:00.000Z",
  slides: ["slide_a", "slide_b", "slide_c", "slide_d"].map((slideId, index) => ({
    slideId,
    order: index + 1,
    title: `Slide ${index + 1}`,
    estimatedSeconds: 30,
    keywords: [],
    semanticCues: [],
  })),
});

function currentDeck(secondSentence = "두 번째 문장") {
  return deckSchema.parse({
    deckId: "deck_a",
    projectId: "project-a",
    title: "Focused practice deck",
    version: 1,
    canvas: { preset: "wide-16-9", width: 1920, height: 1080, aspectRatio: "16:9" },
    slides: ["slide_a", "slide_b", "slide_c", "slide_d"].map((slideId, index) => ({
      slideId,
      order: index + 1,
      title: `Slide ${index + 1}`,
      style: {},
      speakerNotes: index === 0 ? `첫 번째 문장. ${secondSentence}!` : "연습 문장입니다.",
    })),
  });
}

describe("focused-practice target resolution", () => {
  it.each([
    { type: "slide", scopeId: "scope-slide", slideId: "slide_b" } as const,
    { type: "slide-range", scopeId: "scope-range", startSlideId: "slide_b", endSlideId: "slide_c" } as const,
    { type: "opening", scopeId: "scope-opening" } as const,
    { type: "closing", scopeId: "scope-closing" } as const,
  ])("supports $type targets", (targetScope) => {
    expect(resolveFocusedPracticeTarget({ currentDeck: currentDeck(), sourceSnapshot, targetScope }))
      .toMatchObject({ compatibilityState: "current" });
  });

  it("keeps a sentence target current only while its indexed text hash matches", () => {
    const targetScope = {
      type: "sentence" as const,
      scopeId: "scope-sentence",
      slideId: "slide_a",
      sentenceIndex: 1,
      textSnapshotHash: focusedPracticeSentenceSnapshotHash("두 번째 문장"),
    };

    expect(resolveFocusedPracticeTarget({ currentDeck: currentDeck(), sourceSnapshot, targetScope }))
      .toMatchObject({ compatibilityState: "current", resolvedSlideIds: ["slide_a"] });
    expect(resolveFocusedPracticeTarget({ currentDeck: currentDeck("수정된 문장"), sourceSnapshot, targetScope }))
      .toMatchObject({ compatibilityState: "stale", staleReason: "SENTENCE_CHANGED" });
  });

  it("rejects a source slide range longer than the P0 two-to-three-slide limit", () => {
    expect(() => resolveFocusedPracticeTarget({
      currentDeck: currentDeck(),
      sourceSnapshot,
      targetScope: {
        type: "slide-range",
        scopeId: "scope-range",
        startSlideId: "slide_a",
        endSlideId: "slide_d",
      },
    })).toThrow(FocusedPracticeTargetValidationError);
  });

  it("requires the submitted timeline to exactly match the resolved target", () => {
    const targetScope = {
      type: "slide-range" as const,
      scopeId: "scope-range",
      startSlideId: "slide_b",
      endSlideId: "slide_c",
    };
    const resolution = resolveFocusedPracticeTarget({ currentDeck: currentDeck(), sourceSnapshot, targetScope });
    expect(() => assertFocusedPracticeTimeline(targetScope, resolution, [
      { slideId: "slide_b" },
      { slideId: "slide_c" },
    ])).not.toThrow();
    expect(() => assertFocusedPracticeTimeline(targetScope, resolution, [
      { slideId: "slide_b" },
    ])).toThrow(FocusedPracticeTargetValidationError);
  });
});
