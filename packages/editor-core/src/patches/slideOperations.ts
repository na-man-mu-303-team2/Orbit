import type { Deck, Slide, DeckPatch } from "@orbit/shared";

export function createSlideId(deck: Deck) {
  const existingIds = new Set(deck.slides.map((slide) => slide.slideId));

  for (let index = 1; index <= 9999; index += 1) {
    const candidate = `slide_${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `slide_${Date.now()}`;
}

export function createAddSlidePatch(
  deck: Deck,
  slide: Slide
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "add_slide",
        slide
      }
    ]
  };
}
