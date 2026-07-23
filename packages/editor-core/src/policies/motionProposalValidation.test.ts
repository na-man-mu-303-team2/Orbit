import type { DeckPatchOperation } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { applyDeckPatch } from "../patches/applyPatch";
import { createDemoDeck } from "../index";
import { validateMotionProposal } from "./motionProposalValidation";

function fixture() {
  const deck = createDemoDeck();
  const slide = deck.slides[0]!;
  const [first, second] = slide.elements;
  slide.animations = [
    {
      animationId: "anim_existing",
      elementId: first!.elementId,
      type: "rotate",
      order: 1,
      startMode: "on-click",
      durationMs: 500,
      delayMs: 0,
      easing: "ease-out",
    },
  ];
  slide.actions = [
    {
      actionId: "act_existing",
      trigger: { kind: "cue", cue: "강조" },
      effect: { kind: "play-animation", animationId: "anim_existing" },
    },
  ];
  return { deck, slide, first: first!, second: second! };
}

function addOperation(slideId: string, elementId: string): DeckPatchOperation {
  return {
    type: "add_animation",
    slideId,
    animation: {
      animationId: "anim_motion_safe",
      elementId,
      type: "fade-in",
      order: 2,
      startMode: "on-click",
      durationMs: 400,
      delayMs: 0,
      easing: "ease-out",
    },
  };
}

describe("validateMotionProposal", () => {
  it("preserves existing user effect, animation ID, and action reference", () => {
    const { deck, slide, first, second } = fixture();
    const result = validateMotionProposal({
      deck,
      slideId: slide.slideId,
      operations: [addOperation(slide.slideId, second.elementId)],
      allowedTargetElementIds: [first.elementId, second.elementId],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidateSlide.animations[0]).toMatchObject({
      animationId: "anim_existing",
      type: "rotate",
    });
    expect(result.candidateSlide.actions[0]?.effect).toEqual({
      kind: "play-animation",
      animationId: "anim_existing",
    });
  });

  it("allows a safe update while preserving the referenced animation ID", () => {
    const { deck, slide, first } = fixture();
    const result = validateMotionProposal({
      deck,
      slideId: slide.slideId,
      operations: [
        {
          type: "update_animation",
          slideId: slide.slideId,
          animationId: "anim_existing",
          animation: { type: "fade-in", durationMs: 400 },
        },
      ],
      allowedTargetElementIds: [first.elementId],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidateSlide.animations[0]).toMatchObject({
      animationId: "anim_existing",
      type: "fade-in",
      durationMs: 400,
    });
    expect(result.candidateSlide.actions[0]?.effect).toMatchObject({
      animationId: "anim_existing",
    });
  });

  it("allows updates that repair an existing over-budget click step", () => {
    const { deck, slide, first, second } = fixture();
    const third = slide.elements[2]!;
    slide.actions = [];
    slide.animations = [
      {
        animationId: "anim_click_root",
        elementId: first.elementId,
        type: "fade-in",
        order: 1,
        startMode: "on-click",
        durationMs: 500,
        delayMs: 0,
        easing: "ease-out",
      },
      {
        animationId: "anim_click_second",
        elementId: second.elementId,
        type: "appear",
        order: 2,
        startMode: "after-previous",
        durationMs: 500,
        delayMs: 0,
        easing: "ease-out",
      },
      {
        animationId: "anim_click_third",
        elementId: third.elementId,
        type: "appear",
        order: 3,
        startMode: "after-previous",
        durationMs: 500,
        delayMs: 0,
        easing: "ease-out",
      },
    ];

    const result = validateMotionProposal({
      deck,
      slideId: slide.slideId,
      operations: slide.animations.map((animation) => ({
        type: "update_animation" as const,
        slideId: slide.slideId,
        animationId: animation.animationId,
        animation: { durationMs: 300 },
      })),
      allowedTargetElementIds: [
        first.elementId,
        second.elementId,
        third.elementId,
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidateSlide.animations.map(({ durationMs }) => durationMs)).toEqual([
      300,
      300,
      300,
    ]);
  });

  it("rejects referenced delete even for explicit replace", () => {
    const { deck, slide, first } = fixture();
    const result = validateMotionProposal({
      deck,
      slideId: slide.slideId,
      explicitReplace: true,
      operations: [
        {
          type: "delete_animation",
          slideId: slide.slideId,
          animationId: "anim_existing",
        },
      ],
      allowedTargetElementIds: [first.elementId],
    });

    expect(result).toEqual({
      ok: false,
      reasonCode: "REFERENCED_ANIMATION_DELETE",
    });
  });

  it("rejects delete without explicit replacement", () => {
    const { deck, slide, first } = fixture();
    slide.actions = [];
    const result = validateMotionProposal({
      deck,
      slideId: slide.slideId,
      operations: [
        {
          type: "delete_animation",
          slideId: slide.slideId,
          animationId: "anim_existing",
        },
      ],
      allowedTargetElementIds: [first.elementId],
    });

    expect(result).toEqual({ ok: false, reasonCode: "DELETE_NOT_EXPLICIT" });
  });

  it("rejects duplicate IDs, missing targets, orphan timing, and cap overflow", () => {
    const duplicate = fixture();
    duplicate.slide.animations.push({
      ...duplicate.slide.animations[0]!,
      order: 2,
    });
    expect(
      validateMotionProposal({
        deck: duplicate.deck,
        slideId: duplicate.slide.slideId,
        operations: [],
        allowedTargetElementIds: [duplicate.first.elementId],
      }),
    ).toEqual({ ok: false, reasonCode: "DUPLICATE_ANIMATION_ID" });

    const missing = fixture();
    missing.slide.animations[0]!.elementId = "el_missing";
    expect(
      validateMotionProposal({
        deck: missing.deck,
        slideId: missing.slide.slideId,
        operations: [],
        allowedTargetElementIds: [missing.first.elementId],
      }),
    ).toEqual({ ok: false, reasonCode: "MISSING_ANIMATION_TARGET" });

    const orphan = fixture();
    orphan.slide.actions = [];
    orphan.slide.animations[0]!.startMode = "after-previous";
    expect(
      validateMotionProposal({
        deck: orphan.deck,
        slideId: orphan.slide.slideId,
        operations: [],
        allowedTargetElementIds: [orphan.first.elementId],
      }),
    ).toEqual({ ok: false, reasonCode: "TIMELINE_DIAGNOSTIC" });

    const overBudget = fixture();
    expect(
      validateMotionProposal({
        deck: overBudget.deck,
        slideId: overBudget.slide.slideId,
        operations: [
          {
            type: "update_animation",
            slideId: overBudget.slide.slideId,
            animationId: "anim_existing",
            animation: { durationMs: 1_201 },
          },
        ],
        allowedTargetElementIds: [overBudget.first.elementId],
      }),
    ).toEqual({ ok: false, reasonCode: "CLICK_BUDGET_EXCEEDED" });
  });

  it("allows five click steps and rejects six", () => {
    const { deck, slide, first } = fixture();
    slide.animations = [];
    slide.actions = [];
    const clickOperations = Array.from({ length: 6 }, (_, index) => ({
      type: "add_animation" as const,
      slideId: slide.slideId,
      animation: {
        animationId: `anim_click_${index + 1}`,
        elementId: first.elementId,
        type: "appear" as const,
        order: index + 1,
        startMode: "on-click" as const,
        durationMs: 200,
        delayMs: 0,
        easing: "ease-out" as const,
      },
    }));

    expect(
      validateMotionProposal({
        deck,
        slideId: slide.slideId,
        operations: clickOperations.slice(0, 5),
        allowedTargetElementIds: [first.elementId],
        expectedClickCount: 5,
      }).ok,
    ).toBe(true);
    expect(
      validateMotionProposal({
        deck,
        slideId: slide.slideId,
        operations: clickOperations,
        allowedTargetElementIds: [first.elementId],
      }),
    ).toEqual({ ok: false, reasonCode: "CLICK_COUNT_EXCEEDED" });
  });

  it("requires the complete v3 unit expansion exactly once", () => {
    const { deck, slide, first, second } = fixture();
    const operation = addOperation(slide.slideId, second.elementId);

    expect(
      validateMotionProposal({
        deck,
        slideId: slide.slideId,
        operations: [operation],
        allowedTargetElementIds: [first.elementId],
        requiredTargetElementIds: [second.elementId],
      }).ok,
    ).toBe(true);
    expect(
      validateMotionProposal({
        deck,
        slideId: slide.slideId,
        operations: [operation],
        allowedTargetElementIds: [first.elementId],
        requiredTargetElementIds: [first.elementId, second.elementId],
      }),
    ).toEqual({ ok: false, reasonCode: "UNIT_TARGET_MISMATCH" });
  });

  it("round-trips animation and action state through one-step undo and redo patches", () => {
    const { deck, slide, first, second } = fixture();
    const operation = addOperation(slide.slideId, second.elementId);
    const validated = validateMotionProposal({
      deck,
      slideId: slide.slideId,
      operations: [operation],
      allowedTargetElementIds: [first.elementId, second.elementId],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok || operation.type !== "add_animation") return;

    const undone = applyDeckPatch(validated.candidateDeck, {
      deckId: deck.deckId,
      baseVersion: validated.candidateDeck.version,
      source: "user",
      operations: [
        {
          type: "delete_animation",
          slideId: slide.slideId,
          animationId: operation.animation.animationId,
        },
      ],
    });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.deck.slides[0]!.animations).toEqual(slide.animations);
    expect(undone.deck.slides[0]!.actions).toEqual(slide.actions);

    const redone = applyDeckPatch(undone.deck, {
      deckId: deck.deckId,
      baseVersion: undone.deck.version,
      source: "user",
      operations: [operation],
    });
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.deck.slides[0]!.animations).toEqual(
      validated.candidateSlide.animations,
    );
    expect(redone.deck.slides[0]!.actions).toEqual(
      validated.candidateSlide.actions,
    );
  });
});
