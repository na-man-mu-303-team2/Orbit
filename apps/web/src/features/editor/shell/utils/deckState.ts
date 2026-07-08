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

  if (shouldMarkCanvasThumbnailSource(baseDeck)) {
    operations.push({
      metadata: {
        thumbnailSource: "canvas"
      },
      type: "update_deck"
    });
  }

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

export function getImportedSlideThumbnailRefreshSlideIds(deck: Deck) {
  if (deck.metadata.thumbnailSource === "canvas") {
    return [];
  }

  if (
    deck.metadata.thumbnailSource === "import-render" ||
    isLegacyOoxmlImportedThumbnailDeck(deck)
  ) {
    return deck.slides
      .filter((slide) => Boolean(slide.thumbnailUrl))
      .map((slide) => slide.slideId);
  }

  return deck.slides
    .filter((slide) => slide.thumbnailUrl?.startsWith("asset:"))
    .map((slide) => slide.slideId);
}

export function shouldRefreshImportedSlideThumbnails(deck: Deck) {
  return getImportedSlideThumbnailRefreshSlideIds(deck).length > 0;
}

function shouldMarkCanvasThumbnailSource(deck: Deck) {
  return getImportedSlideThumbnailRefreshSlideIds(deck).length > 0;
}

function isLegacyOoxmlImportedThumbnailDeck(deck: Deck) {
  return (
    deck.metadata.sourceType === "import" &&
    deck.deckId.startsWith("deck_ooxml_") &&
    deck.slides.some((slide) => Boolean(slide.thumbnailUrl))
  );
}

export function getPatchThumbnailRefreshSlideIds(deck: Deck, patch: DeckPatch) {
  let refreshAll = false;
  const slideIds = new Set<string>();

  for (const operation of patch.operations) {
    switch (operation.type) {
      case "add_slide":
        slideIds.add(operation.slide.slideId);
        break;
      case "update_slide_style":
      case "add_element":
      case "update_element_frame":
      case "update_element_props":
      case "delete_element":
        slideIds.add(operation.slideId);
        break;
      case "update_theme":
        refreshAll = true;
        break;
    }
  }

  return refreshAll ? deck.slides.map((slide) => slide.slideId) : [...slideIds];
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
