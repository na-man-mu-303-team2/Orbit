import type { Deck, DeckElement, DeckPatch } from "@orbit/shared";

type ElementIdKind = "element";

export function createAddElementPatch(
  deck: Deck,
  slideId: string,
  element: DeckElement
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "add_element",
        slideId,
        element
      }
    ]
  };
}

export function createUpdateElementPropsPatch(
  deck: Deck,
  slideId: string,
  elementId: string,
  props: Record<string, unknown>
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "update_element_props",
        slideId,
        elementId,
        props
      }
    ]
  };
}

export function createDeleteElementPatch(
  deck: Deck,
  slideId: string,
  elementId: string
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "delete_element",
        slideId,
        elementId
      }
    ]
  };
}

export function createElementId(deck: Deck, kind: ElementIdKind = "element") {
  const prefix = kind === "element" ? "el_" : "id_";
  const existingIds = new Set(
    deck.slides.flatMap((slide) => slide.elements.map((element) => element.elementId))
  );

  for (let index = 1; index <= 9999; index += 1) {
    const candidate = `${prefix}${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `${prefix}${Date.now()}`;
}
