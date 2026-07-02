import type { Deck, DeckAnimation, Slide } from "@orbit/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementPresentationState } from "../../slides/rendering/ReadOnlySlideCanvas";
import {
  computeSettledElementStates,
  createBaseElementStates,
  createSlideshowAnimationPlan
} from "./slideshowStepModel";

const maxTransitionDurationMs = 500;

export function useSlideshowTransitions(args: {
  deck: Deck;
  playInitialEntryAnimations?: boolean;
  reducedMotion: boolean;
  slide: Slide;
  stepIndex: number;
  triggerAnimationIds?: Iterable<string>;
}) {
  const playInitialEntryAnimations = args.playInitialEntryAnimations ?? true;
  const triggerAnimationIds = useMemo(
    () => [...(args.triggerAnimationIds ?? [])],
    [args.triggerAnimationIds]
  );
  const plan = useMemo(
    () =>
      createSlideshowAnimationPlan({
        slide: args.slide,
        triggerAnimationIds
      }),
    [args.slide, triggerAnimationIds]
  );
  const targetStates = useMemo(
    () =>
      computeSettledElementStates({
        deck: args.deck,
        slide: args.slide,
        stepIndex: args.stepIndex,
        triggerAnimationIds
      }),
    [args.deck, args.slide, args.stepIndex, triggerAnimationIds]
  );
  const baseStates = useMemo(
    () => createBaseElementStates(args.deck, args.slide),
    [args.deck, args.slide]
  );
  const [displayStates, setDisplayStates] = useState(() =>
    !args.reducedMotion &&
    playInitialEntryAnimations &&
    args.stepIndex === 0 &&
    plan.entryAnimations.length > 0
      ? createSlideshowTransitionStartStates(
          targetStates,
          createSlideshowEntryTransitionTimeline(plan.entryAnimations),
          baseStates
        )
      : targetStates
  );
  const previousAddressRef = useRef<{
    slideId: string;
    stepIndex: number;
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  const settledStatesRef = useRef(targetStates);

  useEffect(() => {
    const previousAddress = previousAddressRef.current;
    const previousSettledStates = settledStatesRef.current;
    previousAddressRef.current = {
      slideId: args.slide.slideId,
      stepIndex: args.stepIndex
    };
    settledStatesRef.current = targetStates;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const isInitialEntry =
      previousAddress === null &&
      playInitialEntryAnimations &&
      args.stepIndex === 0;
    const isSlideChange =
      previousAddress !== null && previousAddress.slideId !== args.slide.slideId;
    const shouldPlaySlideEntry = isSlideChange && args.stepIndex === 0;
    const stepDelta =
      previousAddress === null ? 0 : args.stepIndex - previousAddress.stepIndex;
    const transitionAnimations = isInitialEntry || shouldPlaySlideEntry
      ? createSlideshowEntryTransitionTimeline(plan.entryAnimations)
      : stepDelta === 1
        ? plan.triggerSteps[args.stepIndex - 1]?.animations ?? []
        : [];
    const shouldPlayTransition = isInitialEntry || shouldPlaySlideEntry || stepDelta === 1;

    if (
      args.reducedMotion ||
      transitionAnimations.length === 0 ||
      !shouldPlayTransition
    ) {
      setDisplayStates(targetStates);
      return;
    }

    const startStates = createSlideshowTransitionStartStates(
      targetStates,
      transitionAnimations,
      isInitialEntry || shouldPlaySlideEntry ? baseStates : previousSettledStates
    );
    const durationMs = getSlideshowTransitionDurationMs(transitionAnimations);
    const startedAt = performance.now();

    setDisplayStates(startStates);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);

      setDisplayStates(
        interpolateSlideshowTransitionStates({
          animations: transitionAnimations,
          progress,
          startStates,
          targetStates,
          transitionDurationMs: durationMs
        })
      );

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        setDisplayStates(targetStates);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    args.reducedMotion,
    args.slide.slideId,
    args.stepIndex,
    baseStates,
    plan,
    playInitialEntryAnimations,
    targetStates
  ]);

  return {
    animationPlan: plan,
    elementStates: displayStates,
    settledElementStates: targetStates
  };
}

type SlideshowTransitionAnimation = DeckAnimation & {
  transitionDelayMs?: number;
};

export function createSlideshowEntryTransitionTimeline(
  animations: DeckAnimation[]
): SlideshowTransitionAnimation[] {
  const orderGroups = new Map<number, DeckAnimation[]>();

  for (const animation of animations) {
    const group = orderGroups.get(animation.order) ?? [];
    group.push(animation);
    orderGroups.set(animation.order, group);
  }

  let groupStartMs = 0;
  const timeline: SlideshowTransitionAnimation[] = [];

  for (const [, groupAnimations] of [...orderGroups.entries()].sort(
    ([leftOrder], [rightOrder]) => leftOrder - rightOrder
  )) {
    const sortedGroupAnimations = [...groupAnimations].sort(
      (left, right) => left.delayMs - right.delayMs
    );

    for (const animation of sortedGroupAnimations) {
      timeline.push({
        ...animation,
        transitionDelayMs: groupStartMs + animation.delayMs
      });
    }

    groupStartMs += getSlideshowTransitionDurationMs(sortedGroupAnimations);
  }

  return timeline;
}

export function createSlideshowTransitionStartStates(
  targetStates: Record<string, ElementPresentationState>,
  animations: SlideshowTransitionAnimation[],
  referenceStates: Record<string, ElementPresentationState> = targetStates
) {
  const states = cloneElementStates(targetStates);

  for (const animation of animations) {
    const state = states[animation.elementId];

    if (!state) {
      continue;
    }
    const referenceState = referenceStates[animation.elementId] ?? state;

    switch (animation.type) {
      case "appear":
      case "fade-in":
        state.visible = true;
        state.opacity = 0;
        break;
      case "zoom-in":
        state.visible = true;
        state.opacity = state.opacity ?? 1;
        state.scaleX = 0;
        state.scaleY = 0;
        break;
      case "disappear":
      case "fade-out":
      case "zoom-out":
        state.visible = true;
        state.opacity = referenceState.opacity ?? state.opacity ?? 1;
        state.scaleX = referenceState.scaleX ?? 1;
        state.scaleY = referenceState.scaleY ?? 1;
        break;
      case "rotate":
        state.rotation =
          referenceState.rotation ?? targetStates[animation.elementId]?.rotation ?? 0;
        break;
    }
  }

  return states;
}

export function interpolateSlideshowTransitionStates(args: {
  animations: SlideshowTransitionAnimation[];
  progress: number;
  startStates: Record<string, ElementPresentationState>;
  targetStates: Record<string, ElementPresentationState>;
  transitionDurationMs?: number;
}) {
  const states = cloneElementStates(args.targetStates);
  const transitionDurationMs =
    args.transitionDurationMs ?? getSlideshowTransitionDurationMs(args.animations);

  for (const animation of args.animations) {
    const start = args.startStates[animation.elementId];
    const target = args.targetStates[animation.elementId];
    const state = states[animation.elementId];

    if (!start || !target || !state) {
      continue;
    }

    const progress = applyDelay(animation, args.progress, transitionDurationMs);

    switch (animation.type) {
      case "appear":
      case "fade-in":
      case "disappear":
      case "fade-out":
        state.visible = true;
        state.opacity = lerp(start.opacity ?? 1, target.opacity ?? 1, progress);
        if (progress >= 1) {
          state.visible = target.visible;
        }
        break;
      case "zoom-in":
      case "zoom-out":
        state.visible = true;
        state.opacity = lerp(start.opacity ?? 1, target.opacity ?? 1, progress);
        state.scaleX = lerp(start.scaleX ?? 1, target.scaleX ?? 1, progress);
        state.scaleY = lerp(start.scaleY ?? 1, target.scaleY ?? 1, progress);
        if (progress >= 1) {
          state.visible = target.visible;
        }
        break;
      case "rotate":
        state.rotation = (target.rotation ?? 0) + 360 * progress;
        if (progress >= 1) {
          state.rotation = target.rotation;
        }
        break;
    }
  }

  return states;
}

function applyDelay(
  animation: SlideshowTransitionAnimation,
  progress: number,
  transitionDurationMs: number
) {
  const safeTransitionDurationMs = Math.max(1, transitionDurationMs);
  const elapsedMs = progress * safeTransitionDurationMs;
  const effectiveDelayMs = Math.min(
    animation.transitionDelayMs ?? animation.delayMs,
    Math.max(0, safeTransitionDurationMs - 1)
  );
  const effectiveDurationMs = Math.max(
    1,
    Math.min(animation.durationMs, maxTransitionDurationMs)
  );
  const delayedProgress =
    (elapsedMs - effectiveDelayMs) / effectiveDurationMs;

  return Math.min(1, Math.max(0, delayedProgress));
}

export function getSlideshowTransitionDurationMs(
  animations: SlideshowTransitionAnimation[]
) {
  return Math.max(
    1,
    ...animations.map((animation) =>
      (animation.transitionDelayMs ?? animation.delayMs) +
      Math.min(animation.durationMs, maxTransitionDurationMs)
    )
  );
}

function cloneElementStates(states: Record<string, ElementPresentationState>) {
  return Object.fromEntries(
    Object.entries(states).map(([elementId, state]) => [elementId, { ...state }])
  );
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}
