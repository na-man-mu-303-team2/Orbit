import type { Deck, Slide } from "@orbit/shared";

import {
  createBaseElementStates,
  computeSettledElementStates
} from "../../../../../rehearsal/presenter/slideshowStepModel";
import {
  createSlideshowTransitionStartStates,
  createSlideshowEntryTransitionTimeline,
  getSlideshowTransitionDurationMs
} from "../../../../../rehearsal/presenter/useSlideshowTransitions";
import type { SlideshowTransitionAnimation } from "../../../../../rehearsal/presenter/slideshowTransitionTiming";
import type { ElementPresentationState } from "../../../../../slides/rendering";

export type EditorAnimationPreviewPlan = {
  durationMs: number;
  startStates: Record<string, ElementPresentationState>;
  targetStates: Record<string, ElementPresentationState>;
  timeline: SlideshowTransitionAnimation[];
};

export function createEditorAnimationPreviewPlan(
  deck: Deck,
  slide: Slide
): EditorAnimationPreviewPlan | null {
  if (slide.animations.length === 0) {
    return null;
  }

  const timeline = createSlideshowEntryTransitionTimeline(slide.animations);

  if (timeline.length === 0) {
    return null;
  }

  const targetStates = computeSettledElementStates({
    deck,
    slide,
    stepIndex: 0
  });
  const startStates = createSlideshowTransitionStartStates(
    targetStates,
    timeline,
    createBaseElementStates(deck, slide)
  );

  return {
    durationMs: getSlideshowTransitionDurationMs(timeline),
    startStates,
    targetStates,
    timeline
  };
}
