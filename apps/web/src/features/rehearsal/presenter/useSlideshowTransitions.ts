import type { Deck, DeckAnimation, Slide } from "@orbit/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementPresentationState } from "../../slides/rendering/ReadOnlySlideCanvas";
import {
  computeSettledElementStates,
  createSlideshowAnimationPlan
} from "./slideshowStepModel";
import {
  getSequencedEntryTransitionDurationMs,
  getSlideshowTransitionDurationMs,
  maxTransitionDurationMs,
  sequenceEntryAnimationsByOrder
} from "./slideshowTransitionTiming";

export function useSlideshowTransitions(args: {
  deck: Deck;
  reducedMotion: boolean;
  slide: Slide;
  stepIndex: number;
  triggerAnimationIds?: Iterable<string>;
}) {
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
  const [displayStates, setDisplayStates] = useState(targetStates);
  const previousAddressRef = useRef({
    slideId: args.slide.slideId,
    stepIndex: args.stepIndex
  });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const previousAddress = previousAddressRef.current;
    previousAddressRef.current = {
      slideId: args.slide.slideId,
      stepIndex: args.stepIndex
    };

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const isSlideChange = previousAddress.slideId !== args.slide.slideId;
    const stepDelta = args.stepIndex - previousAddress.stepIndex;
    const transitionAnimations = isSlideChange
      ? sequenceEntryAnimationsByOrder(plan.entryAnimations)
      : stepDelta === 1
        ? plan.triggerSteps[args.stepIndex - 1]?.animations ?? []
        : [];

    if (
      args.reducedMotion ||
      transitionAnimations.length === 0 ||
      (!isSlideChange && stepDelta !== 1)
    ) {
      setDisplayStates(targetStates);
      return;
    }

    const startStates = createSlideshowTransitionStartStates(
      targetStates,
      transitionAnimations
    );
    const durationMs = isSlideChange
      ? getSequencedEntryTransitionDurationMs(transitionAnimations)
      : getSlideshowTransitionDurationMs(transitionAnimations);
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
  }, [args.reducedMotion, args.slide.slideId, args.stepIndex, plan, targetStates]);

  return {
    animationPlan: plan,
    elementStates: displayStates,
    settledElementStates: targetStates
  };
}

export function createSlideshowTransitionStartStates(
  targetStates: Record<string, ElementPresentationState>,
  animations: DeckAnimation[]
) {
  const states = cloneElementStates(targetStates);

  for (const animation of animations) {
    const state = states[animation.elementId];

    if (!state) {
      continue;
    }

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
        state.opacity = 1;
        state.scaleX = 1;
        state.scaleY = 1;
        break;
      case "rotate":
        state.rotation = targetStates[animation.elementId]?.rotation ?? 0;
        break;
    }
  }

  return states;
}

export function interpolateSlideshowTransitionStates(args: {
  animations: DeckAnimation[];
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
  animation: DeckAnimation,
  progress: number,
  transitionDurationMs: number
) {
  const safeTransitionDurationMs = Math.max(1, transitionDurationMs);
  const elapsedMs = progress * safeTransitionDurationMs;
  const effectiveDelayMs = Math.min(
    animation.delayMs,
    Math.max(0, safeTransitionDurationMs - 1)
  );
  const effectiveDurationMs = Math.max(
    1,
    Math.min(
      animation.durationMs,
      maxTransitionDurationMs,
      safeTransitionDurationMs - effectiveDelayMs
    )
  );
  const delayedProgress =
    (elapsedMs - effectiveDelayMs) / effectiveDurationMs;

  return Math.min(1, Math.max(0, delayedProgress));
}

function cloneElementStates(states: Record<string, ElementPresentationState>) {
  return Object.fromEntries(
    Object.entries(states).map(([elementId, state]) => [elementId, { ...state }])
  );
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}
