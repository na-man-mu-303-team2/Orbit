import type { Deck, DeckAnimation, DeckElement, Slide } from "@orbit/shared";
import type { ElementPresentationState } from "../../slides/rendering/ReadOnlySlideCanvas";
import { normalizeRenderableElement } from "../../slides/rendering/elementNormalization";

export type SlideshowModelInput = {
  slide: Slide;
  triggerAnimationIds?: Iterable<string>;
};

export type SlideshowStepAddress = {
  slideId: string;
  stepIndex: number;
};

export type PlannedSlideshowAnimation = DeckAnimation & {
  animationIndex: number;
  hasTargetElement: boolean;
};

export type SlideshowTriggerStep = {
  order: number;
  animations: PlannedSlideshowAnimation[];
};

export type SlideshowAnimationPlan = {
  danglingAnimationIds: string[];
  entryAnimations: PlannedSlideshowAnimation[];
  maxStepIndex: number;
  triggerSteps: SlideshowTriggerStep[];
};

export function createSlideshowAnimationPlan(
  input: SlideshowModelInput
): SlideshowAnimationPlan {
  const triggerAnimationIds = new Set(input.triggerAnimationIds ?? []);
  const elementIds = new Set(input.slide.elements.map((element) => element.elementId));
  const plannedAnimations = input.slide.animations.map((animation, animationIndex) => ({
    ...animation,
    animationIndex,
    hasTargetElement: elementIds.has(animation.elementId)
  }));
  const entryAnimations = plannedAnimations
    .filter((animation) => !triggerAnimationIds.has(animation.animationId))
    .sort(compareEntryAnimations);
  const triggerAnimations = plannedAnimations.filter((animation) =>
    triggerAnimationIds.has(animation.animationId)
  );
  const orderGroups = new Map<number, PlannedSlideshowAnimation[]>();

  for (const animation of triggerAnimations) {
    const animations = orderGroups.get(animation.order) ?? [];
    animations.push(animation);
    orderGroups.set(animation.order, animations);
  }

  const triggerSteps = [...orderGroups.entries()]
    .sort(([leftOrder], [rightOrder]) => leftOrder - rightOrder)
    .map(([order, animations]) => ({
      order,
      animations: animations.sort(
        (left, right) => left.animationIndex - right.animationIndex
      )
    }));

  return {
    danglingAnimationIds: plannedAnimations
      .filter((animation) => !animation.hasTargetElement)
      .map((animation) => animation.animationId),
    entryAnimations,
    maxStepIndex: triggerSteps.length,
    triggerSteps
  };
}

export function computeSettledElementStates(args: {
  deck: Deck;
  executedAnimationIds?: Iterable<string>;
  slide: Slide;
  stepIndex: number;
  triggerAnimationIds?: Iterable<string>;
}): Record<string, ElementPresentationState> {
  const plan = createSlideshowAnimationPlan({
    slide: args.slide,
    triggerAnimationIds: args.triggerAnimationIds
  });
  const baseStates = createBaseElementStates(args.deck, args.slide);
  const states = cloneElementStates(baseStates);
  const executedAnimationIds = args.executedAnimationIds
    ? new Set(args.executedAnimationIds)
    : null;

  // 복원 경로에서는 진입 자동 재생을 이미 끝난 상태로 취급해 창 재열기 때 반복 재생을 막는다.
  for (const animation of plan.entryAnimations) {
    applySettledAnimation(states, animation, baseStates[animation.elementId]);
  }

  let hasBlockedPendingStep = false;
  plan.triggerSteps.forEach((step, stepIndex) => {
    const isCompletedStep = stepIndex + 1 <= args.stepIndex;
    const executedAnimations = executedAnimationIds
      ? step.animations.filter((animation) =>
          executedAnimationIds.has(animation.animationId)
        )
      : [];
    const hasExplicitExecution = executedAnimations.length > 0;
    const shouldApplyStep = isCompletedStep || hasExplicitExecution;

    if (!shouldApplyStep) {
      if (!hasBlockedPendingStep) {
        for (const animation of step.animations) {
          applyPendingAnimation(states, animation);
        }
        hasBlockedPendingStep = true;
      }

      return;
    }

    for (const animation of step.animations) {
      if (
        !isCompletedStep &&
        executedAnimationIds &&
        !executedAnimationIds.has(animation.animationId)
      ) {
        continue;
      }

      applySettledAnimation(states, animation, baseStates[animation.elementId]);
    }
  });

  return states;
}

export function deriveCompletedSlideshowStepIndex(
  plan: SlideshowAnimationPlan,
  executedAnimationIds: Iterable<string>
) {
  const executedIds = new Set(executedAnimationIds);
  let completedStepCount = 0;

  for (const step of plan.triggerSteps) {
    if (!step.animations.every((animation) => executedIds.has(animation.animationId))) {
      break;
    }

    completedStepCount += 1;
  }

  return completedStepCount;
}

export function clampSlideshowStepIndex(stepIndex: number, maxStepIndex: number) {
  if (!Number.isFinite(stepIndex)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.trunc(stepIndex)), Math.max(0, maxStepIndex));
}

export function createBaseElementStates(deck: Deck, slide: Slide) {
  const states: Record<string, ElementPresentationState> = {};

  for (const element of slide.elements) {
    const normalizedElement = normalizeRenderableElement(deck.canvas, element);
    states[normalizedElement.elementId] = createBaseElementState(normalizedElement);
  }

  return states;
}

function createBaseElementState(element: DeckElement): ElementPresentationState {
  return {
    height: element.height,
    opacity: element.opacity,
    rotation: element.rotation,
    scaleX: 1,
    scaleY: 1,
    visible: element.visible,
    width: element.width,
    x: element.x,
    y: element.y
  };
}

function applySettledAnimation(
  states: Record<string, ElementPresentationState>,
  animation: DeckAnimation,
  baseState: ElementPresentationState | undefined
) {
  const state = states[animation.elementId];

  if (!state) {
    return;
  }

  switch (animation.type) {
    case "appear":
    case "fade-in":
    case "zoom-in":
      state.visible = true;
      state.opacity = baseState?.opacity ?? 1;
      state.scaleX = 1;
      state.scaleY = 1;
      break;
    case "disappear":
    case "fade-out":
      state.visible = false;
      state.opacity = 0;
      break;
    case "zoom-out":
      state.visible = false;
      state.opacity = 0;
      state.scaleX = 0;
      state.scaleY = 0;
      break;
    case "rotate":
      state.rotation = baseState?.rotation ?? 0;
      break;
  }
}

function applyPendingAnimation(
  states: Record<string, ElementPresentationState>,
  animation: DeckAnimation
) {
  const state = states[animation.elementId];

  if (!state) {
    return;
  }

  switch (animation.type) {
    case "appear":
    case "fade-in":
      state.visible = false;
      state.opacity = 0;
      break;
    case "zoom-in":
      state.visible = false;
      state.opacity = 0;
      state.scaleX = 0;
      state.scaleY = 0;
      break;
    case "disappear":
    case "fade-out":
    case "zoom-out":
    case "rotate":
      break;
  }
}

function cloneElementStates(states: Record<string, ElementPresentationState>) {
  return Object.fromEntries(
    Object.entries(states).map(([elementId, state]) => [elementId, { ...state }])
  );
}

function compareEntryAnimations(
  left: PlannedSlideshowAnimation,
  right: PlannedSlideshowAnimation
) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  if (left.delayMs !== right.delayMs) {
    return left.delayMs - right.delayMs;
  }

  return left.animationIndex - right.animationIndex;
}
