import type { Deck } from "@orbit/shared";

export type HistoryEntry = {
  deck: Deck;
  slideIndex: number;
};

export function resolveHistoryNavigation(args: {
  currentDeck: Deck;
  currentSlideIndex: number;
  stack: HistoryEntry[];
}) {
  const targetEntry = args.stack.at(-1);

  if (!targetEntry) {
    return null;
  }

  return {
    currentEntry: {
      deck: args.currentDeck,
      slideIndex: args.currentSlideIndex
    },
    nextStack: args.stack.slice(0, -1),
    targetEntry,
    targetSlideIndex: Math.max(
      0,
      Math.min(targetEntry.slideIndex, targetEntry.deck.slides.length - 1)
    )
  };
}

export function appendAppliedDesignProposalHistory(args: {
  currentDeck: Deck;
  currentSlideIndex: number;
  undoStack: HistoryEntry[];
}) {
  return [
    ...args.undoStack.slice(-49),
    { deck: args.currentDeck, slideIndex: args.currentSlideIndex }
  ];
}
