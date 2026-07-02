import type { DeckAnimation } from "@orbit/shared";

export const maxTransitionDurationMs = 500;

export function sequenceEntryAnimationsByOrder(
  animations: DeckAnimation[]
): DeckAnimation[] {
  const sortedAnimations = animations
    .map((animation, animationIndex) => ({ animation, animationIndex }))
    .sort((left, right) => {
      if (left.animation.order !== right.animation.order) {
        return left.animation.order - right.animation.order;
      }

      if (left.animation.delayMs !== right.animation.delayMs) {
        return left.animation.delayMs - right.animation.delayMs;
      }

      return left.animationIndex - right.animationIndex;
    });
  const sequencedAnimations: DeckAnimation[] = [];
  let elapsedMs = 0;

  for (let index = 0; index < sortedAnimations.length; ) {
    const order = sortedAnimations[index]!.animation.order;
    const group: DeckAnimation[] = [];

    while (
      index < sortedAnimations.length &&
      sortedAnimations[index]!.animation.order === order
    ) {
      group.push(sortedAnimations[index]!.animation);
      index += 1;
    }

    for (const animation of group) {
      sequencedAnimations.push({
        ...animation,
        delayMs: elapsedMs + animation.delayMs
      });
    }

    elapsedMs += getSlideshowTransitionDurationMs(group);
  }

  return sequencedAnimations;
}

export function getSequencedEntryTransitionDurationMs(
  animations: DeckAnimation[]
) {
  return Math.max(
    1,
    ...animations.map(
      (animation) =>
        animation.delayMs +
        Math.max(1, Math.min(animation.durationMs, maxTransitionDurationMs))
    )
  );
}

export function getSlideshowTransitionDurationMs(animations: DeckAnimation[]) {
  return Math.max(
    1,
    ...animations.map((animation) =>
      Math.min(animation.durationMs + animation.delayMs, maxTransitionDurationMs)
    )
  );
}
