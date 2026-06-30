import type { Deck } from "@orbit/shared";

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
