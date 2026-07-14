import {
  splitFocusedPracticeSentences,
  type Deck,
  type FocusedPracticeAttempt,
  type FocusedPracticeTargetScope,
} from "@orbit/shared";

export type FocusedPracticeRangeTransition = {
  enteredAtMs: number;
  slideId: string;
};

export function resolveFocusedPracticeSlideIds(
  deck: Deck,
  targetScope: FocusedPracticeTargetScope,
): string[] {
  const slideIds = [...deck.slides]
    .sort((left, right) => left.order - right.order)
    .map((slide) => slide.slideId);
  if (targetScope.type === "opening") return slideIds.slice(0, 1);
  if (targetScope.type === "closing") return slideIds.slice(-1);
  if (targetScope.type === "slide" || targetScope.type === "sentence") {
    return slideIds.includes(targetScope.slideId) ? [targetScope.slideId] : [];
  }

  const startIndex = slideIds.indexOf(targetScope.startSlideId);
  const endIndex = slideIds.indexOf(targetScope.endSlideId);
  return startIndex >= 0 && endIndex >= startIndex
    ? slideIds.slice(startIndex, endIndex + 1)
    : [];
}

export function resolveFocusedPracticeSentence(
  deck: Deck,
  targetScope: FocusedPracticeTargetScope,
): string | null {
  if (targetScope.type !== "sentence") return null;
  const slide = deck.slides.find((candidate) => candidate.slideId === targetScope.slideId);
  return slide
    ? splitFocusedPracticeSentences(slide.speakerNotes)[targetScope.sentenceIndex] ?? null
    : null;
}

export function buildFocusedPracticeTimeline(
  targetScope: FocusedPracticeTargetScope,
  resolvedSlideIds: string[],
  durationMs: number,
  rangeTransitions: FocusedPracticeRangeTransition[] = [],
): FocusedPracticeAttempt["slideTimeline"] {
  if (targetScope.type === "opening" || targetScope.type === "closing") return [];
  if (targetScope.type !== "slide-range") {
    return resolvedSlideIds[0]
      ? [{ slideId: resolvedSlideIds[0], enteredAtMs: 0, exitedAtMs: durationMs }]
      : [];
  }

  return rangeTransitions.map((transition, index) => ({
    slideId: transition.slideId,
    enteredAtMs: Math.min(durationMs, Math.max(0, transition.enteredAtMs)),
    exitedAtMs: Math.min(
      durationMs,
      Math.max(transition.enteredAtMs, rangeTransitions[index + 1]?.enteredAtMs ?? durationMs),
    ),
  }));
}
