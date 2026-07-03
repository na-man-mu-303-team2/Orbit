import type { DeckAnimation, DeckSlideAction, Slide } from "@orbit/shared";

import {
  createSlidePlaybackState,
  executeSlideAction,
  executeTriggeredActions,
  getExecutedAnimationIds,
  getNextClickAnimation,
  getTriggeredAnimationIds,
  playNextClickAnimation,
  resolveTriggeredActions,
  type ClickPlaybackResult,
  type SlideActionExecutionResult,
  type SlidePlaybackState,
  type SlideRuntimeTrigger,
  type TriggeredActionExecutionResult
} from "./slidePlayback";

export type SlideRuntimeAdapter = {
  advanceOnClick: (
    state: SlidePlaybackState
  ) => SlideRuntimeAdvanceResult | null;
  createState: () => SlidePlaybackState;
  executeAction: (
    state: SlidePlaybackState,
    action: DeckSlideAction
  ) => SlideActionExecutionResult | null;
  executeTrigger: (
    state: SlidePlaybackState,
    trigger: SlideRuntimeTrigger
  ) => TriggeredActionExecutionResult;
  getExecutedAnimationIds: (state: SlidePlaybackState) => string[];
  getNextClickAnimation: (state: SlidePlaybackState) => DeckAnimation | null;
  getSnapshot: (state: SlidePlaybackState) => SlideRuntimeSnapshot;
  getTriggerAnimationIds: () => string[];
  playNextClickAnimation: (
    state: SlidePlaybackState
  ) => ClickPlaybackResult | null;
  resolveTrigger: (trigger: SlideRuntimeTrigger) => DeckSlideAction[];
};

export type SlideRuntimeAdvanceResult = {
  animationIds: string[];
  state: SlidePlaybackState;
};

export type SlideRuntimeSnapshot = {
  executedAnimationIds: string[];
  isComplete: boolean;
  stepIndex: number;
  triggerAnimationIds: string[];
};

export function createSlideRuntimeAdapter(slide: Slide): SlideRuntimeAdapter {
  const triggerAnimationIds = getTriggeredAnimationIds(slide);
  const triggerSteps = createTriggerSteps(slide, triggerAnimationIds);

  return {
    advanceOnClick: (state) =>
      advanceSlideRuntimeOnClick(slide, state, triggerAnimationIds, triggerSteps),
    createState: createSlidePlaybackState,
    executeAction: (state, action) => executeSlideAction(slide, state, action),
    executeTrigger: (state, trigger) => executeTriggeredActions(slide, state, trigger),
    getExecutedAnimationIds: (state) => getExecutedAnimationIds(slide, state),
    getNextClickAnimation: (state) => getNextClickAnimation(slide, state),
    getSnapshot: (state) =>
      createSlideRuntimeSnapshot(slide, state, triggerAnimationIds, triggerSteps),
    getTriggerAnimationIds: () => [...triggerAnimationIds],
    playNextClickAnimation: (state) => playNextClickAnimation(slide, state),
    resolveTrigger: (trigger) => resolveTriggeredActions(slide, trigger)
  };
}

function advanceSlideRuntimeOnClick(
  slide: Slide,
  state: SlidePlaybackState,
  triggerAnimationIds: string[],
  triggerSteps: string[][]
): SlideRuntimeAdvanceResult | null {
  const snapshot = createSlideRuntimeSnapshot(
    slide,
    state,
    triggerAnimationIds,
    triggerSteps
  );
  const nextStep = triggerSteps[snapshot.stepIndex];

  if (!nextStep) {
    return null;
  }

  const executedAnimationIds = new Set(snapshot.executedAnimationIds);
  const animationIds = nextStep.filter(
    (animationId) => !executedAnimationIds.has(animationId)
  );

  if (animationIds.length === 0) {
    return null;
  }

  return {
    animationIds,
    state: {
      executedStepIds: [
        ...state.executedStepIds,
        ...animationIds.map(createClickStepId)
      ]
    }
  };
}

function createSlideRuntimeSnapshot(
  slide: Slide,
  state: SlidePlaybackState,
  triggerAnimationIds: string[],
  triggerSteps: string[][]
): SlideRuntimeSnapshot {
  const executedAnimationIds = getExecutedAnimationIds(slide, state);
  const executedAnimationIdSet = new Set(executedAnimationIds);
  let stepIndex = 0;

  for (const animationIds of triggerSteps) {
    if (!animationIds.every((animationId) => executedAnimationIdSet.has(animationId))) {
      break;
    }

    stepIndex += 1;
  }

  return {
    executedAnimationIds,
    isComplete: stepIndex >= triggerSteps.length,
    stepIndex,
    triggerAnimationIds: [...triggerAnimationIds]
  };
}

function createTriggerSteps(slide: Slide, triggerAnimationIds: string[]) {
  const triggerAnimationIdSet = new Set(triggerAnimationIds);
  const stepsByOrder = new Map<number, string[]>();

  for (const animation of [...slide.animations].sort(compareAnimations)) {
    if (!triggerAnimationIdSet.has(animation.animationId)) {
      continue;
    }

    const animationIds = stepsByOrder.get(animation.order) ?? [];
    animationIds.push(animation.animationId);
    stepsByOrder.set(animation.order, animationIds);
  }

  return [...stepsByOrder.entries()]
    .sort(([leftOrder], [rightOrder]) => leftOrder - rightOrder)
    .map(([, animationIds]) => animationIds);
}

function compareAnimations(left: DeckAnimation, right: DeckAnimation) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  if (left.delayMs !== right.delayMs) {
    return left.delayMs - right.delayMs;
  }

  return left.animationId.localeCompare(right.animationId);
}

function createClickStepId(animationId: string) {
  return `click:${animationId}`;
}
