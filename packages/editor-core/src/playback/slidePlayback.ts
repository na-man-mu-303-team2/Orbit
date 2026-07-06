import type { DeckAnimation, DeckSlideAction, Slide } from "@orbit/shared";

export type SlidePlaybackState = {
  playedAnimationIds: string[];
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

export function createSlidePlaybackState(): SlidePlaybackState {
  return {
    playedAnimationIds: []
  };
}

export function getNextClickAnimation(
  slide: Slide,
  state: SlidePlaybackState
): DeckAnimation | null {
  const playedAnimationIds = new Set(state.playedAnimationIds);

  return (
    [...slide.animations]
      .sort((left, right) => left.order - right.order)
      .find((animation) => !playedAnimationIds.has(animation.animationId)) ?? null
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
    state: markAnimationPlayed(state, animation.animationId)
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
  trigger: {
    cue?: string;
    keywordId?: string;
    occurrenceId?: string;
  }
): DeckSlideAction[] {
  const normalizedCue = trigger.cue ? normalizeCue(trigger.cue) : "";

  if (!normalizedCue && !trigger.keywordId && !trigger.occurrenceId) {
    return [];
  }

  if (trigger.occurrenceId !== undefined) {
    return slide.actions.filter((action) => {
      return (
        action.trigger.kind === "keyword-occurrence" &&
        action.trigger.occurrenceId === trigger.occurrenceId &&
        (trigger.keywordId === undefined ||
          action.trigger.keywordId === trigger.keywordId)
      );
    });
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

      if (!animation || hasPlayedAnimation(state, animation.animationId)) {
        return null;
      }

      return {
        kind: "play-animation",
        action,
        animation,
        state: markAnimationPlayed(state, animation.animationId)
      };
    }

    case "go-to-next-slide":
      return {
        kind: "go-to-next-slide",
        action,
        state
      };
  }
}

function hasPlayedAnimation(
  state: SlidePlaybackState,
  animationId: string
): boolean {
  return state.playedAnimationIds.includes(animationId);
}

function markAnimationPlayed(
  state: SlidePlaybackState,
  animationId: string
): SlidePlaybackState {
  if (hasPlayedAnimation(state, animationId)) {
    return state;
  }

  return {
    playedAnimationIds: [...state.playedAnimationIds, animationId]
  };
}

function normalizeCue(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}
