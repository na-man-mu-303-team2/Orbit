import type { DeckAnimation } from "@orbit/shared";

export const maxTransitionDurationMs = 500;

export type SlideshowTransitionAnimation = DeckAnimation & {
  transitionDelayMs?: number;
};

export function createSlideshowEntryTransitionTimeline(
  animations: DeckAnimation[]
): SlideshowTransitionAnimation[] {
  const orderGroups = new Map<
    number,
    Array<{ animation: DeckAnimation; animationIndex: number }>
  >();

  for (const [animationIndex, animation] of animations.entries()) {
    const group = orderGroups.get(animation.order) ?? [];
    group.push({ animation, animationIndex });
    orderGroups.set(animation.order, group);
  }

  let groupStartMs = 0;
  const timeline: SlideshowTransitionAnimation[] = [];

  for (const [, groupAnimations] of [...orderGroups.entries()].sort(
    ([leftOrder], [rightOrder]) => leftOrder - rightOrder
  )) {
    const sortedGroupAnimations = [...groupAnimations].sort((left, right) => {
      if (left.animation.delayMs !== right.animation.delayMs) {
        return left.animation.delayMs - right.animation.delayMs;
      }

      return left.animationIndex - right.animationIndex;
    });

    for (const { animation } of sortedGroupAnimations) {
      timeline.push({
        ...animation,
        transitionDelayMs: groupStartMs + animation.delayMs
      });
    }

    groupStartMs += getSlideshowTransitionDurationMs(
      sortedGroupAnimations.map(({ animation }) => animation)
    );
  }

  return timeline;
}

export function sequenceEntryAnimationsByOrder(animations: DeckAnimation[]) {
  return createSlideshowEntryTransitionTimeline(animations);
}

export function getSequencedEntryTransitionDurationMs(
  animations: SlideshowTransitionAnimation[]
) {
  return getSlideshowTransitionDurationMs(animations);
}

export function getSlideshowTransitionDurationMs(
  animations: SlideshowTransitionAnimation[]
) {
  return Math.max(
    1,
    ...animations.map((animation) =>
      (animation.transitionDelayMs ?? animation.delayMs) +
      Math.max(1, Math.min(animation.durationMs, maxTransitionDurationMs))
    )
  );
}
