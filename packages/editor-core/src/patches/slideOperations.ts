import { deckPatchSchema } from "@orbit/shared";
import type { Deck, DeckPatch, SlideInput } from "@orbit/shared";

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
  slide: SlideInput
): DeckPatch {
  // SlideInput은 default 적용 전 입력이라 speechCues를 생략할 수 있고, 반환 patch는 parse 후 정규화한다.
  return deckPatchSchema.parse({
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "add_slide",
        slide
      }
    ]
  });
}
