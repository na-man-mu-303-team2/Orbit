import type { Deck, DeckElement, DeckPatch } from "@orbit/shared";

type ElementIdKind = "element";

export function createAddElementPatch(
  deck: Deck,
  slideId: string,
  element: DeckElement
): DeckPatch {
  const nextElement =
    deck.metadata.sourceType === "import"
      ? asAuthoredOoxmlElement(element)
      : element;
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "add_element",
        slideId,
        element: nextElement
      }
    ]
  };
}

export type DuplicateElementPatchResult = {
  duplicateElementId: string;
  patch: DeckPatch;
};

export function createDuplicateElementPatch(
  deck: Deck,
  slideId: string,
  sourceElementId: string,
  offset = 24
): DuplicateElementPatchResult | null {
  const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
  const sourceElement = slide?.elements.find(
    (candidate) => candidate.elementId === sourceElementId
  );
  if (!slide || !sourceElement) return null;

  const elementsById = new Map(
    slide.elements.map((element) => [element.elementId, element])
  );
  const sourceElements: DeckElement[] = [];
  const visited = new Set<string>();
  let hasMissingChild = false;

  function visit(element: DeckElement) {
    if (visited.has(element.elementId)) return;
    visited.add(element.elementId);
    sourceElements.push(element);
    if (element.type !== "group") return;
    for (const childElementId of element.props.childElementIds) {
      const child = elementsById.get(childElementId);
      if (child) {
        visit(child);
      } else {
        hasMissingChild = true;
      }
    }
  }

  visit(sourceElement);
  if (hasMissingChild) return null;
  const allocateElementId = createElementIdAllocator(deck);
  const duplicateIds = new Map(
    sourceElements.map((element) => [element.elementId, allocateElementId()])
  );
  const nextTopLevelZIndex =
    slide.elements.reduce(
      (highest, element) => Math.max(highest, element.zIndex),
      0
    ) + 1;
  const duplicatedElements = sourceElements.map((element) => {
    const duplicated = structuredClone(element);
    duplicated.elementId = duplicateIds.get(element.elementId)!;
    duplicated.x += offset;
    duplicated.y += offset;
    if (element.elementId === sourceElementId) {
      duplicated.zIndex = nextTopLevelZIndex;
    }
    if (duplicated.type === "group") {
      duplicated.props.childElementIds = duplicated.props.childElementIds.map(
        (childElementId) => duplicateIds.get(childElementId)!
      );
    }
    return deck.metadata.sourceType === "import"
      ? asAuthoredOoxmlElement(duplicated)
      : duplicated;
  });

  return {
    duplicateElementId: duplicateIds.get(sourceElementId)!,
    patch: {
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: duplicatedElements.map((element) => ({
        type: "add_element" as const,
        slideId,
        element
      }))
    }
  };
}

function asAuthoredOoxmlElement(element: DeckElement): DeckElement {
  const authored = {
    ...structuredClone(element),
    ooxmlOrigin: "authored" as const
  };
  delete authored.ooxmlEditCapabilities;
  return authored;
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

function createElementIdAllocator(deck: Deck) {
  const existingIds = new Set(
    deck.slides.flatMap((slide) =>
      slide.elements.map((element) => element.elementId)
    )
  );
  let nextIndex = 1;

  return () => {
    while (existingIds.has(`el_${nextIndex}`)) nextIndex += 1;
    const elementId = `el_${nextIndex}`;
    existingIds.add(elementId);
    nextIndex += 1;
    return elementId;
  };
}
