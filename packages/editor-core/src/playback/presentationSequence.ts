import type { DeckAnimation, DeckSlideAction, Slide } from "@orbit/shared";
import { deriveKeywordOccurrences } from "@orbit/shared";

import {
  createAnimationTimeline,
  type AnimationTimelineRoot
} from "./animationTimeline";

export type PresentationSequenceStepKind =
  | "keyword-occurrence"
  | "legacy-keyword"
  | "manual"
  | "slide-enter";

export type PresentationSequenceStep = {
  animationIds: string[];
  kind: PresentationSequenceStepKind;
  occurrenceId: string | null;
  occurrenceStart: number | null;
  rootAnimationId: string;
  stepIndex: number;
};

export type SlidePresentationSequence = {
  animationOrderById: ReadonlyMap<string, number>;
  keywordOrderMatchesTimeline: boolean;
  steps: PresentationSequenceStep[];
};

export function getPresentationSequenceReviewSlideIds(deck: {
  slides: readonly Slide[];
}) {
  return deck.slides.flatMap((slide) =>
    slide.kind === "activity" || slide.kind === "activity-results"
      ? []
      : buildSlidePresentationSequence(slide).keywordOrderMatchesTimeline
        ? []
        : [slide.slideId]
  );
}

/**
 * Produces the presentation order shared by editor, rehearsal, and live mode.
 * Keyword occurrence steps are immutable in note order. Manual roots keep their
 * authored slots; a mismatch is surfaced so the editor can request review.
 */
export function buildSlidePresentationSequence(slide: Slide): SlidePresentationSequence {
  const triggerKeys = getAnimationActionTriggerKeys(slide);
  const timeline = createAnimationTimeline({
    actionTriggerKeys: triggerKeys,
    animations: slide.animations,
    legacyOnClickAnimationIds: getActionAnimationIds(slide)
  });
  const occurrenceStarts = new Map(
    deriveKeywordOccurrences(slide).map((occurrence) => [
      occurrence.occurrenceId,
      occurrence.start
    ])
  );
  const roots = [...timeline.entryRoots, ...timeline.clickSteps];
  const rawSteps = mergeKeywordOccurrenceSteps(
    roots.map((root, index) =>
      toSequenceStep(root, index, slide.actions, occurrenceStarts)
    )
  );
  const keywordSlots = rawSteps
    .map((step, index) => ({ index, step }))
    .filter(({ step }) => step.kind === "keyword-occurrence");
  const noteOrderedKeywordSteps = keywordSlots
    .map(({ step }) => step)
    .sort(compareKeywordSteps);
  const keywordOrderMatchesTimeline = keywordSlots.every(
    ({ step }, index) => step.rootAnimationId === noteOrderedKeywordSteps[index]?.rootAnimationId
  );
  const steps = [...rawSteps];
  keywordSlots.forEach(({ index }, keywordIndex) => {
    const keywordStep = noteOrderedKeywordSteps[keywordIndex];
    if (keywordStep) steps[index] = keywordStep;
  });
  const animationOrderById = new Map<string, number>();
  steps.forEach((step, index) => {
    step.stepIndex = index + 1;
    step.animationIds.forEach((animationId, effectIndex) => {
      animationOrderById.set(animationId, index * 100 + effectIndex + 1);
    });
  });

  return { animationOrderById, keywordOrderMatchesTimeline, steps };
}

export function getAnimationActionTriggerKeys(slide: Slide) {
  const keysByAnimationId = new Map<string, Set<string>>();
  for (const action of slide.actions) {
      if (
        action.trigger.kind !== "keyword-occurrence" ||
        action.effect.kind !== "play-animation"
      ) {
        continue;
      }
      const keys = keysByAnimationId.get(action.effect.animationId) ?? new Set<string>();
      keys.add(`keyword-occurrence:${action.trigger.keywordId}:${action.trigger.occurrenceId}`);
      keysByAnimationId.set(action.effect.animationId, keys);
  }
  return new Map(
    Array.from(keysByAnimationId, ([animationId, keys]) => [
      animationId,
      Array.from(keys).sort().join("|")
    ])
  );
}

function getActionAnimationIds(slide: Slide) {
  return slide.actions.flatMap((action) =>
    action.effect.kind === "play-animation" ? [action.effect.animationId] : []
  );
}

function toSequenceStep(
  root: AnimationTimelineRoot,
  index: number,
  actions: readonly DeckSlideAction[],
  occurrenceStarts: ReadonlyMap<string, number>
): PresentationSequenceStep {
  const animationIds = root.effects.map((effect) => effect.animationId);
  const linkedActions = actions.filter(
    (action) =>
      action.effect.kind === "play-animation" &&
      animationIds.includes(action.effect.animationId)
  );
  const occurrenceAction = linkedActions.find(
    (action) => action.trigger.kind === "keyword-occurrence"
  );
  if (occurrenceAction?.trigger.kind === "keyword-occurrence") {
    return {
      animationIds,
      kind: "keyword-occurrence",
      occurrenceId: occurrenceAction.trigger.occurrenceId,
      occurrenceStart: occurrenceStarts.get(occurrenceAction.trigger.occurrenceId) ?? null,
      rootAnimationId: root.rootAnimationId,
      stepIndex: index + 1
    };
  }
  const legacyAction = linkedActions.find((action) => action.trigger.kind === "keyword");
  return {
    animationIds,
    kind: legacyAction
      ? "legacy-keyword"
      : root.effects[0]?.startMode === "on-slide-enter"
        ? "slide-enter"
        : "manual",
    occurrenceId: null,
    occurrenceStart: null,
    rootAnimationId: root.rootAnimationId,
    stepIndex: index + 1
  };
}

function compareKeywordSteps(left: PresentationSequenceStep, right: PresentationSequenceStep) {
  return (
    (left.occurrenceStart ?? Number.MAX_SAFE_INTEGER) -
      (right.occurrenceStart ?? Number.MAX_SAFE_INTEGER) ||
    left.rootAnimationId.localeCompare(right.rootAnimationId)
  );
}

function mergeKeywordOccurrenceSteps(
  steps: readonly PresentationSequenceStep[]
): PresentationSequenceStep[] {
  const stepByOccurrenceId = new Map<string, PresentationSequenceStep>();
  const merged: PresentationSequenceStep[] = [];

  for (const step of steps) {
    if (step.kind !== "keyword-occurrence" || !step.occurrenceId) {
      merged.push({ ...step, animationIds: [...step.animationIds] });
      continue;
    }
    const existing = stepByOccurrenceId.get(step.occurrenceId);
    if (existing) {
      existing.animationIds.push(...step.animationIds);
      continue;
    }
    const next = { ...step, animationIds: [...step.animationIds] };
    stepByOccurrenceId.set(step.occurrenceId, next);
    merged.push(next);
  }

  return merged;
}

export function getSlideAnimationById(slide: Slide, animationId: string): DeckAnimation | null {
  return slide.animations.find((animation) => animation.animationId === animationId) ?? null;
}
