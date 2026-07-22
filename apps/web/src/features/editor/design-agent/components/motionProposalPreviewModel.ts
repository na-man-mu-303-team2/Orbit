import { createAnimationTimeline } from "@orbit/editor-core";
import type { DeckPatchOperation, Slide } from "@orbit/shared";
import {
  createSlideshowAnimationPlan,
  type SlideshowAnimationPlan,
} from "../../../rehearsal/presenter/slideshowStepModel";

const animationOperationTypes = new Set([
  "add_animation",
  "update_animation",
  "delete_animation",
]);

export type MotionProposalPreviewModel = {
  clickCount: number;
  entryCount: number;
  targetCount: number;
  totalDurationMs: number;
  triggerAnimationIds: string[];
  slideshowPlan: SlideshowAnimationPlan;
};

export function isMotionOnlyProposal(
  operations: readonly DeckPatchOperation[],
): boolean {
  return (
    operations.length > 0 &&
    operations.every((operation) => animationOperationTypes.has(operation.type))
  );
}

export function createMotionProposalPreviewModel(
  slide: Slide,
): MotionProposalPreviewModel {
  const triggerAnimationIds = slide.actions.flatMap((action) =>
    action.effect.kind === "play-animation"
      ? [action.effect.animationId]
      : [],
  );
  const timeline = createAnimationTimeline({
    animations: slide.animations,
    legacyOnClickAnimationIds: triggerAnimationIds,
    targetElementIds: slide.elements.map((element) => element.elementId),
    transitionDurationMs: slide.transition?.durationMs,
  });
  const slideshowPlan = createSlideshowAnimationPlan({
    slide,
    triggerAnimationIds,
  });

  return {
    clickCount: timeline.clickSteps.length,
    entryCount: timeline.entryRoots.length,
    targetCount: new Set(
      timeline.effects
        .filter((effect) => effect.hasTargetElement)
        .map((effect) => effect.elementId),
    ).size,
    totalDurationMs: timeline.totalDurationMs,
    triggerAnimationIds,
    slideshowPlan,
  };
}

export function formatMotionProposalSummary(
  model: MotionProposalPreviewModel,
): string {
  return `자동 진입 ${model.entryCount} · 클릭 ${model.clickCount} · 대상 ${model.targetCount}개 · 예상 ${(model.totalDurationMs / 1_000).toFixed(1)}초`;
}
