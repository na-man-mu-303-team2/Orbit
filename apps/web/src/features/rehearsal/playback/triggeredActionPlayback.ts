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

export type ManualAnimationPlaybackUpdate = TriggeredActionPlaybackUpdate & {
  consumedOccurrenceIds: string[];
};

export type RestoredSlidePlayback = {
  consumedOccurrenceIds: string[];
  playbackState: SlidePlaybackState;
  presenterStepIndex: number;
};

export type QueuedKeywordOccurrencePlaybackUpdate = {
  consumedOccurrenceIds: string[];
  pendingOccurrenceIds: string[];
  update: TriggeredActionPlaybackUpdate | null;
};

/**
 * Only the current animation step may run from speech; later matches wait for
 * click fallback. A next-slide action is terminal for its occurrence, so it
 * remains pending until that occurrence's animation actions have settled.
 */
export function resolveQueuedKeywordOccurrencePlayback(args: {
  actionsByOccurrenceId: ReadonlyMap<string, DeckSlideAction[]>;
  pendingOccurrenceIds: readonly string[];
  matchedOccurrenceIds: readonly string[];
  playbackState: SlidePlaybackState;
  presenterStepIndex: number;
  slide: Slide;
  slideAnimationPlan: SlideshowAnimationPlan;
}): QueuedKeywordOccurrencePlaybackUpdate {
  const currentStep = args.slideAnimationPlan.triggerSteps[args.presenterStepIndex];
  const currentAnimationIds = new Set(
    currentStep?.animations.map((animation) => animation.animationId) ?? []
  );
  const pendingOccurrenceIds = new Set(args.pendingOccurrenceIds);
  args.matchedOccurrenceIds.forEach((occurrenceId) => pendingOccurrenceIds.add(occurrenceId));
  const actionsByOccurrenceId = new Map(
    [...pendingOccurrenceIds].map((occurrenceId) => [
      occurrenceId,
      args.actionsByOccurrenceId.get(occurrenceId) ??
        getOccurrenceActions(args.slide, occurrenceId),
    ]),
  );
  const executablePlayActions = [...actionsByOccurrenceId.values()].flatMap(
    (actions) =>
      actions.filter(
        (action) =>
          action.effect.kind === "play-animation" &&
          currentAnimationIds.has(action.effect.animationId) &&
          !args.playbackState.playedAnimationIds.includes(action.effect.animationId),
      ),
  );

  if (executablePlayActions.length > 0) {
    const update = resolveTriggeredActionPlaybackUpdate({
      actions: executablePlayActions,
      playbackState: args.playbackState,
      presenterStepIndex: args.presenterStepIndex,
      slide: args.slide,
      slideAnimationPlan: args.slideAnimationPlan,
    });
    const consumedOccurrenceIds = getOccurrenceIdsForActions(
      actionsByOccurrenceId,
      executablePlayActions,
    );

    updatePendingOccurrenceIds({
      actionsByOccurrenceId,
      pendingOccurrenceIds,
      playbackState: update.playbackState,
      shouldAdvanceSlide: false,
    });

    return {
      consumedOccurrenceIds,
      pendingOccurrenceIds: [...pendingOccurrenceIds],
      update,
    };
  }

  const canAdvanceSlide =
    args.presenterStepIndex >= args.slideAnimationPlan.maxStepIndex;
  const executableAdvanceActions = canAdvanceSlide
    ? [...actionsByOccurrenceId.values()].flatMap((actions) =>
        actions.filter(
          (action) =>
            action.effect.kind === "go-to-next-slide" &&
            areOccurrenceAnimationsSettled(actions, args.playbackState),
        ),
      )
    : [];

  if (executableAdvanceActions.length === 0) {
    updatePendingOccurrenceIds({
      actionsByOccurrenceId,
      pendingOccurrenceIds,
      playbackState: args.playbackState,
      shouldAdvanceSlide: false,
    });
    return {
      consumedOccurrenceIds: [],
      pendingOccurrenceIds: [...pendingOccurrenceIds],
      update: null,
    };
  }

  const update = resolveTriggeredActionPlaybackUpdate({
    actions: executableAdvanceActions,
    playbackState: args.playbackState,
    presenterStepIndex: args.presenterStepIndex,
    slide: args.slide,
    slideAnimationPlan: args.slideAnimationPlan
  });
  updatePendingOccurrenceIds({
    actionsByOccurrenceId,
    pendingOccurrenceIds,
    playbackState: update.playbackState,
    shouldAdvanceSlide: update.shouldAdvanceSlide,
  });
  return {
    consumedOccurrenceIds: getOccurrenceIdsForActions(
      actionsByOccurrenceId,
      executableAdvanceActions,
    ),
    pendingOccurrenceIds: [...pendingOccurrenceIds],
    update,
  };
}

function getOccurrenceActions(slide: Slide, occurrenceId: string) {
  return slide.actions.filter(
    (action) =>
      action.trigger.kind === "keyword-occurrence" &&
      action.trigger.occurrenceId === occurrenceId,
  );
}

function getOccurrenceIdsForActions(
  actionsByOccurrenceId: ReadonlyMap<string, DeckSlideAction[]>,
  actions: readonly DeckSlideAction[] | ReadonlySet<string>,
) {
  const actionIds =
    "has" in actions
      ? actions
      : new Set(actions.map((action) => action.actionId));
  return [...actionsByOccurrenceId.entries()].flatMap(([occurrenceId, occurrenceActions]) =>
    occurrenceActions.some((action) => actionIds.has(action.actionId))
      ? [occurrenceId]
      : [],
  );
}

function areOccurrenceAnimationsSettled(
  actions: readonly DeckSlideAction[],
  playbackState: SlidePlaybackState,
) {
  return actions.every(
    (action) =>
      action.effect.kind !== "play-animation" ||
      playbackState.playedAnimationIds.includes(action.effect.animationId),
  );
}

function updatePendingOccurrenceIds(args: {
  actionsByOccurrenceId: ReadonlyMap<string, DeckSlideAction[]>;
  pendingOccurrenceIds: Set<string>;
  playbackState: SlidePlaybackState;
  shouldAdvanceSlide: boolean;
}) {
  for (const [occurrenceId, actions] of args.actionsByOccurrenceId) {
    const hasAdvanceAction = actions.some(
      (action) => action.effect.kind === "go-to-next-slide",
    );
    const animationsSettled = areOccurrenceAnimationsSettled(
      actions,
      args.playbackState,
    );

    if (!hasAdvanceAction && animationsSettled) {
      args.pendingOccurrenceIds.delete(occurrenceId);
      continue;
    }

    if (hasAdvanceAction && args.shouldAdvanceSlide && animationsSettled) {
      args.pendingOccurrenceIds.delete(occurrenceId);
    }
  }
}

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
  const hasOccurrenceTriggerForKeyword = slide.actions.some(
    (action) =>
      action.trigger.kind === "keyword-occurrence" &&
      action.trigger.keywordId === keywordId
  );

  return resolveTriggeredActions(slide, { keywordId }).filter(
    (action) =>
      action.trigger.kind === "keyword" &&
      (!hasOccurrenceTriggerForKeyword || action.effect.kind !== "play-animation")
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

export function resolveManualAnimationPlaybackUpdate(args: {
  playbackState: SlidePlaybackState;
  presenterStepIndex: number;
  slide: Slide;
  slideAnimationPlan: SlideshowAnimationPlan;
}): ManualAnimationPlaybackUpdate {
  const triggerStep = args.slideAnimationPlan.triggerSteps[
    args.presenterStepIndex
  ];

  if (!triggerStep) {
    return {
      consumedOccurrenceIds: [],
      playbackState: args.playbackState,
      presenterStepIndex: args.presenterStepIndex,
      shouldAdvanceSlide: true
    };
  }

  const animationIds = new Set(
    triggerStep.animations.map((animation) => animation.animationId)
  );
  const stepActions = args.slide.actions.filter(
    (action) =>
      action.effect.kind === "play-animation" &&
      animationIds.has(action.effect.animationId)
  );
  const actionUpdate = resolveTriggeredActionPlaybackUpdate({
    actions: stepActions,
    playbackState: args.playbackState,
    presenterStepIndex: args.presenterStepIndex,
    slide: args.slide,
    slideAnimationPlan: args.slideAnimationPlan
  });
  const playedAnimationIds = new Set(actionUpdate.playbackState.playedAnimationIds);

  for (const animationId of animationIds) {
    playedAnimationIds.add(animationId);
  }

  return {
    consumedOccurrenceIds: Array.from(
      new Set(
        stepActions.flatMap((action) =>
          action.trigger.kind === "keyword-occurrence" &&
          action.effect.kind === "play-animation" &&
          animationIds.has(action.effect.animationId)
            ? [action.trigger.occurrenceId]
            : []
        )
      )
    ),
    playbackState: {
      playedAnimationIds: [...playedAnimationIds]
    },
    presenterStepIndex: Math.max(
      args.presenterStepIndex + 1,
      actionUpdate.presenterStepIndex
    ),
    shouldAdvanceSlide: false
  };
}

/**
 * Rebuilds the action runtime state for a settled slideshow step. This is used
 * by presenter recovery controls, where setting only the visual step would
 * otherwise leave keyword occurrences and playback bookkeeping out of sync.
 */
export function restoreSlidePlaybackAtStep(args: {
  slide: Slide;
  slideAnimationPlan: SlideshowAnimationPlan;
  stepIndex: number;
}): RestoredSlidePlayback {
  const presenterStepIndex = Math.min(
    Math.max(0, Math.trunc(args.stepIndex)),
    args.slideAnimationPlan.maxStepIndex,
  );
  const playedAnimationIds = new Set<string>();
  const consumedOccurrenceIds = new Set<string>();

  for (const triggerStep of args.slideAnimationPlan.triggerSteps.slice(
    0,
    presenterStepIndex,
  )) {
    const animationIds = new Set(
      triggerStep.animations.map((animation) => animation.animationId),
    );

    for (const animationId of animationIds) {
      playedAnimationIds.add(animationId);
    }

    for (const action of args.slide.actions) {
      if (
        action.trigger.kind === "keyword-occurrence" &&
        action.effect.kind === "play-animation" &&
        animationIds.has(action.effect.animationId)
      ) {
        consumedOccurrenceIds.add(action.trigger.occurrenceId);
      }
    }
  }

  return {
    consumedOccurrenceIds: [...consumedOccurrenceIds],
    playbackState: { playedAnimationIds: [...playedAnimationIds] },
    presenterStepIndex,
  };
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
