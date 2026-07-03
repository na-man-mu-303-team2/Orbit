import type { DeckAnimation, DeckSlideAction, Slide } from "@orbit/shared";

export type SlidePlaybackState = {
  executedStepIds: string[];
};

export type SlideRuntimeTrigger = {
  cue?: string;
  keywordId?: string;
};

export type ClickPlaybackResult = {
  animation: DeckAnimation;
  state: SlidePlaybackState;
};

export type SlideActionExecutionResult =
  | {
      kind: "play-animation";
      action: DeckSlideAction;
      animation: DeckAnimation;
      state: SlidePlaybackState;
    }
  | {
      kind: "go-to-next-slide";
      action: DeckSlideAction;
      state: SlidePlaybackState;
    };

export type TriggeredActionExecutionResult = {
  actions: DeckSlideAction[];
  actionResults: SlideActionExecutionResult[];
  animationIds: string[];
  shouldAdvanceSlide: boolean;
  state: SlidePlaybackState;
};

export function createSlidePlaybackState(): SlidePlaybackState {
  return {
    executedStepIds: []
  };
}

export function getNextClickAnimation(
  slide: Slide,
  state: SlidePlaybackState
): DeckAnimation | null {
  return (
    [...slide.animations]
      .sort((left, right) => left.order - right.order)
      .find((animation) => !hasExecutedAnimation(slide, state, animation.animationId)) ??
    null
  );
}

export function playNextClickAnimation(
  slide: Slide,
  state: SlidePlaybackState
): ClickPlaybackResult | null {
  const animation = getNextClickAnimation(slide, state);

  if (!animation) {
    return null;
  }

  return {
    animation,
    state: markStepExecuted(state, createClickStepId(animation.animationId))
  };
}

export function resolveCueActions(
  slide: Slide,
  cue: string
): DeckSlideAction[] {
  return resolveTriggeredActions(slide, { cue });
}

export function resolveTriggeredActions(
  slide: Slide,
  trigger: SlideRuntimeTrigger
): DeckSlideAction[] {
  const normalizedCue = trigger.cue ? normalizeCue(trigger.cue) : "";

  if (!normalizedCue && !trigger.keywordId) {
    return [];
  }

  return slide.actions.filter((action) => {
    if (
      normalizedCue &&
      action.trigger.kind === "cue" &&
      normalizeCue(action.trigger.cue) === normalizedCue
    ) {
      return true;
    }

    return (
      trigger.keywordId !== undefined &&
      action.trigger.kind === "keyword" &&
      action.trigger.keywordId === trigger.keywordId
    );
  });
}

export function getTriggeredAnimationIds(slide: Slide): string[] {
  const seenAnimationIds = new Set<string>();
  const animationIds: string[] = [];

  for (const action of slide.actions) {
    if (action.effect.kind !== "play-animation") {
      continue;
    }

    if (seenAnimationIds.has(action.effect.animationId)) {
      continue;
    }

    seenAnimationIds.add(action.effect.animationId);
    animationIds.push(action.effect.animationId);
  }

  return animationIds;
}

export function executeSlideAction(
  slide: Slide,
  state: SlidePlaybackState,
  action: DeckSlideAction
): SlideActionExecutionResult | null {
  const { effect } = action;

  switch (effect.kind) {
    case "play-animation": {
      const { animationId } = effect;
      const animation = slide.animations.find(
        (candidate) => candidate.animationId === animationId
      );

      if (
        !animation ||
        hasExecutedAction(state, action.actionId) ||
        hasExecutedAnimation(slide, state, animation.animationId)
      ) {
        return null;
      }

      return {
        kind: "play-animation",
        action,
        animation,
        state: markStepExecuted(state, createActionStepId(action.actionId))
      };
    }

    case "go-to-next-slide":
      if (hasExecutedAction(state, action.actionId)) {
        return null;
      }

      return {
        kind: "go-to-next-slide",
        action,
        state: markStepExecuted(state, createActionStepId(action.actionId))
      };
  }
}

export function executeTriggeredActions(
  slide: Slide,
  state: SlidePlaybackState,
  trigger: SlideRuntimeTrigger
): TriggeredActionExecutionResult {
  const actions = resolveTriggeredActions(slide, trigger);
  const actionResults: SlideActionExecutionResult[] = [];
  let nextState = state;

  for (const action of actions) {
    const result = executeSlideAction(slide, nextState, action);

    if (!result) {
      continue;
    }

    actionResults.push(result);
    nextState = result.state;
  }

  return {
    actions,
    actionResults,
    animationIds: actionResults
      .filter((result): result is Extract<SlideActionExecutionResult, { kind: "play-animation" }> =>
        result.kind === "play-animation"
      )
      .map((result) => result.animation.animationId),
    shouldAdvanceSlide: actionResults.some(
      (result) => result.kind === "go-to-next-slide"
    ),
    state: nextState
  };
}

export function getExecutedAnimationIds(
  slide: Slide,
  state: SlidePlaybackState
): string[] {
  return slide.animations
    .filter((animation) => hasExecutedAnimation(slide, state, animation.animationId))
    .map((animation) => animation.animationId);
}

function hasExecutedAction(
  state: SlidePlaybackState,
  actionId: string
): boolean {
  return hasExecutedStep(state, createActionStepId(actionId));
}

function hasExecutedAnimation(
  slide: Slide,
  state: SlidePlaybackState,
  animationId: string
): boolean {
  if (hasExecutedStep(state, createClickStepId(animationId))) {
    return true;
  }

  return slide.actions.some(
    (action) =>
      action.effect.kind === "play-animation" &&
      action.effect.animationId === animationId &&
      hasExecutedAction(state, action.actionId)
  );
}

function hasExecutedStep(
  state: SlidePlaybackState,
  stepId: string
): boolean {
  return state.executedStepIds.includes(stepId);
}

function markStepExecuted(
  state: SlidePlaybackState,
  stepId: string
): SlidePlaybackState {
  if (hasExecutedStep(state, stepId)) {
    return state;
  }

  return {
    executedStepIds: [...state.executedStepIds, stepId]
  };
}

function createClickStepId(animationId: string) {
  return `click:${animationId}`;
}

function createActionStepId(actionId: string) {
  return `action:${actionId}`;
}

function normalizeCue(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}
