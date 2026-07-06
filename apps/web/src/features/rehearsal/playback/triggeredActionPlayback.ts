import {
  resolveTriggeredActions,
  executeSlideAction,
  type SlidePlaybackState
} from "@orbit/editor-core";
import type { DeckSlideAction, Slide } from "@orbit/shared";

import type { SlideshowAnimationPlan } from "../presenter/slideshowStepModel";

export type TriggeredActionPlaybackUpdate = {
  playbackState: SlidePlaybackState;
  presenterStepIndex: number;
  shouldAdvanceSlide: boolean;
};

export function getTriggerAnimationIdsForSlide(slide: Slide) {
  const validAnimationIds = new Set(
    slide.animations.map((animation) => animation.animationId)
  );

  return Array.from(
    new Set(
      slide.actions
        .flatMap((action) =>
          action.effect.kind === "play-animation"
            ? [action.effect.animationId]
            : []
        )
        .filter((animationId) => validAnimationIds.has(animationId))
    )
  );
}

export function resolveKeywordTriggeredActions(slide: Slide, keywordId: string) {
  return resolveTriggeredActions(slide, { keywordId }).filter(
    (action) => action.trigger.kind === "keyword"
  );
}

export function resolveKeywordOccurrenceTriggeredActions(
  slide: Slide,
  keywordId: string,
  occurrenceId: string
) {
  return slide.actions.filter(
    (action) =>
      action.trigger.kind === "keyword-occurrence" &&
      action.trigger.keywordId === keywordId &&
      action.trigger.occurrenceId === occurrenceId
  );
}

export function getKeywordOccurrenceTriggerIdsForSlide(slide: Slide) {
  return slide.actions.flatMap((action) =>
    action.trigger.kind === "keyword-occurrence"
      ? [action.trigger.occurrenceId]
      : []
  );
}

export function resolveCueTriggeredActions(slide: Slide, cue: string) {
  return resolveTriggeredActions(slide, { cue });
}

export function resolveTriggeredActionPlaybackUpdate(args: {
  actions: DeckSlideAction[];
  playbackState: SlidePlaybackState;
  presenterStepIndex: number;
  slide: Slide;
  slideAnimationPlan: SlideshowAnimationPlan;
}): TriggeredActionPlaybackUpdate {
  let nextPlaybackState = args.playbackState;
  let nextPresenterStepIndex = args.presenterStepIndex;
  let shouldAdvanceSlide = false;

  for (const action of args.actions) {
    const result = executeSlideAction(args.slide, nextPlaybackState, action);

    if (!result) {
      continue;
    }

    nextPlaybackState = result.state;

    if (result.kind === "play-animation") {
      const triggerStepIndex = args.slideAnimationPlan.triggerSteps.findIndex((step) =>
        step.animations.some(
          (animation) =>
            animation.animationId === result.animation.animationId
        )
      );

      if (triggerStepIndex >= 0) {
        nextPresenterStepIndex = Math.max(
          nextPresenterStepIndex,
          triggerStepIndex + 1
        );
      }

      continue;
    }

    shouldAdvanceSlide = true;
    break;
  }

  return {
    playbackState: nextPlaybackState,
    presenterStepIndex: nextPresenterStepIndex,
    shouldAdvanceSlide
  };
}
