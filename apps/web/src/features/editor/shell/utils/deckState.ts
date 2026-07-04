import type { Deck, DeckPatch } from "@orbit/shared";

function isSameDeckIdentity(left: Deck, right: Deck) {
  return left.deckId === right.deckId && left.projectId === right.projectId;
}

export function shouldApplyManualSaveResult(args: {
  snapshotDeck: Deck;
  currentDeck: Deck;
}) {
  const { snapshotDeck, currentDeck } = args;

  return (
    currentDeck.version === snapshotDeck.version &&
    isSameDeckIdentity(currentDeck, snapshotDeck)
  );
}

export function buildSlideThumbnailPatch(
  baseDeck: Deck,
  renderedDeck: Deck
): DeckPatch | null {
  const operations: DeckPatch["operations"] = renderedDeck.slides
    .filter((slide) => {
      const baseSlide = baseDeck.slides.find(
        (candidate) => candidate.slideId === slide.slideId
      );
      return Boolean(baseSlide && baseSlide.thumbnailUrl !== slide.thumbnailUrl);
    })
    .map((slide) => ({
      slideId: slide.slideId,
      thumbnailUrl: slide.thumbnailUrl,
      type: "update_slide" as const
    }));

  if (operations.length === 0) {
    return null;
  }

  return {
    baseVersion: baseDeck.version,
    deckId: baseDeck.deckId,
    operations,
    source: "system"
  };
}

export function mergeDeckIntoQueryCache(
  currentDeck: Deck | undefined,
  nextDeck: Deck
) {
  if (!currentDeck) {
    return nextDeck;
  }

  if (!isSameDeckIdentity(currentDeck, nextDeck)) {
    return nextDeck;
  }

  return nextDeck.version > currentDeck.version ? nextDeck : currentDeck;
}

export function shouldHydrateDeckFromQuery(args: {
  currentDeck: Deck;
  nextDeck: Deck;
  hasHydratedPersistedDeck: boolean;
  hasLocalOptimisticChanges: boolean;
}) {
  const {
    currentDeck,
    nextDeck,
    hasHydratedPersistedDeck,
    hasLocalOptimisticChanges
  } = args;

  if (!hasHydratedPersistedDeck) {
    if (!hasLocalOptimisticChanges) {
      return true;
    }

    return nextDeck.version > currentDeck.version;
  }

  if (!isSameDeckIdentity(currentDeck, nextDeck)) {
    return true;
  }

  if (hasLocalOptimisticChanges) {
    return nextDeck.version > currentDeck.version;
  }

  return nextDeck.version >= currentDeck.version;
}
