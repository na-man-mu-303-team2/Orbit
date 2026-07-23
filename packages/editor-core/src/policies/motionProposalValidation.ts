import type { Deck, DeckPatchOperation, Slide } from "@orbit/shared";

import { applyDeckPatch } from "../patches/applyPatch";
import { validateSlideAnimations } from "../patches/animationOperations";
import { createAnimationTimeline } from "../playback/animationTimeline";

const safeGeneratedEffects = new Set(["appear", "fade-in", "zoom-in"]);

type MotionOperation = Extract<
  DeckPatchOperation,
  { type: "add_animation" | "update_animation" | "delete_animation" }
>;

export type MotionProposalValidationReason =
  | "NON_MOTION_OPERATION"
  | "SLIDE_NOT_FOUND"
  | "SLIDE_ID_MISMATCH"
  | "DUPLICATE_ANIMATION_ID"
  | "MISSING_ANIMATION_TARGET"
  | "DANGLING_ACTION_REFERENCE"
  | "DELETE_NOT_EXPLICIT"
  | "REFERENCED_ANIMATION_DELETE"
  | "ANIMATION_NOT_FOUND"
  | "ANIMATION_TARGET_CHANGE"
  | "TARGET_NOT_ALLOWED"
  | "EFFECT_NOT_ALLOWED"
  | "PATCH_VALIDATION_FAILED"
  | "TIMELINE_DIAGNOSTIC"
  | "DUPLICATE_ANIMATION_ORDER"
  | "ENTRY_BUDGET_EXCEEDED"
  | "CLICK_BUDGET_EXCEEDED"
  | "CLICK_COUNT_EXCEEDED"
  | "CLICK_COUNT_MISMATCH"
  | "TOTAL_BUDGET_EXCEEDED"
  | "UNIT_TARGET_MISMATCH"
  | "ANIMATION_ID_NOT_PRESERVED"
  | "ACTION_REFERENCE_NOT_PRESERVED";

export type MotionProposalValidationResult =
  | {
      ok: true;
      candidateDeck: Deck;
      candidateSlide: Slide;
      operations: MotionOperation[];
    }
  | { ok: false; reasonCode: MotionProposalValidationReason };

export function validateMotionProposal(input: {
  allowedTargetElementIds: readonly string[];
  deck: Deck;
  explicitReplace?: boolean;
  expectedClickCount?: number;
  operations: readonly DeckPatchOperation[];
  requiredTargetElementIds?: readonly string[];
  slideId: string;
}): MotionProposalValidationResult {
  const slide = input.deck.slides.find((candidate) => candidate.slideId === input.slideId);
  if (!slide) return refused("SLIDE_NOT_FOUND");
  const operations = input.operations.filter(isMotionOperation);
  if (operations.length !== input.operations.length) {
    return refused("NON_MOTION_OPERATION");
  }
  const originalGraphReason = validateGraph(slide);
  if (originalGraphReason) return refused(originalGraphReason);

  const allowedTargets = new Set(input.allowedTargetElementIds);
  const requiredTargets =
    input.requiredTargetElementIds === undefined
      ? null
      : new Set(input.requiredTargetElementIds);
  const slideElementIds = new Set(
    slide.elements.map((element) => element.elementId),
  );
  if (
    requiredTargets &&
    (requiredTargets.size !== input.requiredTargetElementIds!.length ||
      [...requiredTargets].some((elementId) => !slideElementIds.has(elementId)))
  ) {
    return refused("UNIT_TARGET_MISMATCH");
  }
  for (const elementId of requiredTargets ?? []) {
    allowedTargets.add(elementId);
  }
  const animationsById = new Map(
    slide.animations.map((animation) => [animation.animationId, animation]),
  );
  const referencedAnimationIds = new Set(
    slide.actions.flatMap((action) =>
      action.effect.kind === "play-animation" ? [action.effect.animationId] : [],
    ),
  );
  for (const operation of operations) {
    if (operation.slideId !== slide.slideId) return refused("SLIDE_ID_MISMATCH");
    if (operation.type === "add_animation") {
      if (animationsById.has(operation.animation.animationId)) {
        return refused("DUPLICATE_ANIMATION_ID");
      }
      if (!allowedTargets.has(operation.animation.elementId)) {
        return refused("TARGET_NOT_ALLOWED");
      }
      if (!safeGeneratedEffects.has(operation.animation.type)) {
        return refused("EFFECT_NOT_ALLOWED");
      }
      continue;
    }
    const existing = animationsById.get(operation.animationId);
    if (!existing) return refused("ANIMATION_NOT_FOUND");
    if (operation.type === "delete_animation") {
      if (!input.explicitReplace) return refused("DELETE_NOT_EXPLICIT");
      if (referencedAnimationIds.has(operation.animationId)) {
        return refused("REFERENCED_ANIMATION_DELETE");
      }
      continue;
    }
    if (operation.animation.elementId !== undefined) {
      return refused("ANIMATION_TARGET_CHANGE");
    }
    if (!allowedTargets.has(existing.elementId)) {
      return refused("TARGET_NOT_ALLOWED");
    }
    if (
      operation.animation.type !== undefined &&
      !safeGeneratedEffects.has(operation.animation.type)
    ) {
      return refused("EFFECT_NOT_ALLOWED");
    }
  }
  if (requiredTargets) {
    const operationTargets = operations.flatMap((operation) => {
      if (operation.type === "add_animation") {
        return [operation.animation.elementId];
      }
      if (operation.type === "update_animation") {
        const existing = animationsById.get(operation.animationId);
        return existing ? [existing.elementId] : [];
      }
      return [];
    });
    if (
      operationTargets.length !== requiredTargets.size ||
      new Set(operationTargets).size !== operationTargets.length ||
      operationTargets.some((elementId) => !requiredTargets.has(elementId))
    ) {
      return refused("UNIT_TARGET_MISMATCH");
    }
  }
  if (operations.length === 0) {
    const originalTimelineReason = validateTimeline(
      slide,
      input.expectedClickCount,
    );
    if (originalTimelineReason) return refused(originalTimelineReason);
    return { ok: true, candidateDeck: input.deck, candidateSlide: slide, operations };
  }

  const applied = applyDeckPatch(input.deck, {
    deckId: input.deck.deckId,
    baseVersion: input.deck.version,
    source: "ai",
    operations,
  });
  if (!applied.ok) return refused("PATCH_VALIDATION_FAILED");
  const candidateSlide = applied.deck.slides.find(
    (candidate) => candidate.slideId === slide.slideId,
  );
  if (!candidateSlide) return refused("SLIDE_NOT_FOUND");
  const candidateGraphReason = validateGraph(candidateSlide);
  if (candidateGraphReason) return refused(candidateGraphReason);

  const candidateIds = new Set(
    candidateSlide.animations.map((animation) => animation.animationId),
  );
  for (const animation of slide.animations) {
    if (
      !candidateIds.has(animation.animationId) &&
      (!input.explicitReplace || referencedAnimationIds.has(animation.animationId))
    ) {
      return refused("ANIMATION_ID_NOT_PRESERVED");
    }
  }
  if (!sameStrings(actionReferences(slide), actionReferences(candidateSlide))) {
    return refused("ACTION_REFERENCE_NOT_PRESERVED");
  }
  const timelineReason = validateTimeline(
    candidateSlide,
    input.expectedClickCount,
  );
  if (timelineReason) return refused(timelineReason);
  return {
    ok: true,
    candidateDeck: applied.deck,
    candidateSlide,
    operations,
  };
}

function validateTimeline(
  slide: Slide,
  expectedClickCount?: number,
): MotionProposalValidationReason | null {
  const diagnostics = validateSlideAnimations(slide);
  if (diagnostics.duplicateOrders.length > 0) {
    return "DUPLICATE_ANIMATION_ORDER";
  }
  const timeline = createAnimationTimeline({
    animations: slide.animations,
    legacyOnClickAnimationIds: actionReferences(slide),
    targetElementIds: slide.elements.map((element) => element.elementId),
    transitionDurationMs: slide.transition?.durationMs,
  });
  if (timeline.diagnostics.length > 0 || timeline.diagnosticsTruncatedCount > 0) {
    return "TIMELINE_DIAGNOSTIC";
  }
  if (timeline.entryDurationMs > 900) return "ENTRY_BUDGET_EXCEEDED";
  if (timeline.clickSteps.length > 5) return "CLICK_COUNT_EXCEEDED";
  if (
    expectedClickCount !== undefined &&
    timeline.clickSteps.length !== expectedClickCount
  ) {
    return "CLICK_COUNT_MISMATCH";
  }
  if (timeline.clickSteps.some((step) => step.durationMs > 1_200)) {
    return "CLICK_BUDGET_EXCEEDED";
  }
  if (timeline.totalDurationMs > 6_000) return "TOTAL_BUDGET_EXCEEDED";
  return null;
}

function validateGraph(slide: Slide): MotionProposalValidationReason | null {
  const ids = new Set<string>();
  const elementIds = new Set(slide.elements.map((element) => element.elementId));
  for (const animation of slide.animations) {
    if (ids.has(animation.animationId)) return "DUPLICATE_ANIMATION_ID";
    ids.add(animation.animationId);
    if (!elementIds.has(animation.elementId)) return "MISSING_ANIMATION_TARGET";
  }
  if (
    slide.actions.some(
      (action) =>
        action.effect.kind === "play-animation" &&
        !ids.has(action.effect.animationId),
    )
  ) {
    return "DANGLING_ACTION_REFERENCE";
  }
  return null;
}

function actionReferences(slide: Slide): string[] {
  return slide.actions.flatMap((action) =>
    action.effect.kind === "play-animation" ? [action.effect.animationId] : [],
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isMotionOperation(operation: DeckPatchOperation): operation is MotionOperation {
  return (
    operation.type === "add_animation" ||
    operation.type === "update_animation" ||
    operation.type === "delete_animation"
  );
}

function refused(
  reasonCode: MotionProposalValidationReason,
): MotionProposalValidationResult {
  return { ok: false, reasonCode };
}
