import type {
  Deck,
  DeckElement,
  DeckPatch,
  GroupElementProps
} from "@orbit/shared";

export type ElementOrderDirection = "backward" | "forward";

export function getTopLevelElementStack(
  elements: readonly DeckElement[]
): DeckElement[] {
  const groupedChildElementIds = new Set<string>();

  for (const element of elements) {
    if (element.type !== "group") {
      continue;
    }

    for (const childElementId of (element.props as GroupElementProps)
      .childElementIds) {
      groupedChildElementIds.add(childElementId);
    }
  }

  return elements
    .map((element, sourceIndex) => ({ element, sourceIndex }))
    .filter(({ element }) => !groupedChildElementIds.has(element.elementId))
    .sort(
      (left, right) =>
        left.element.zIndex - right.element.zIndex ||
        left.sourceIndex - right.sourceIndex
    )
    .map(({ element }) => element);
}

export function createElementOrderPatch(args: {
  deck: Deck;
  direction: ElementOrderDirection;
  selectedElementIds: readonly string[];
  slideId: string;
}): DeckPatch | null {
  const slide = args.deck.slides.find(
    (candidate) => candidate.slideId === args.slideId
  );

  if (!slide) {
    return null;
  }

  const orderedElements = getTopLevelElementStack(slide.elements);
  const topLevelElementIdSet = new Set(
    orderedElements.map((element) => element.elementId)
  );
  const selectedElementIdSet = new Set(
    args.selectedElementIds.filter((elementId) =>
      topLevelElementIdSet.has(elementId)
    )
  );

  if (selectedElementIdSet.size === 0) {
    return null;
  }

  const reorderedElements = [...orderedElements];

  if (args.direction === "forward") {
    for (let index = reorderedElements.length - 2; index >= 0; index -= 1) {
      const element = reorderedElements[index];
      const nextElement = reorderedElements[index + 1];

      if (
        element &&
        nextElement &&
        selectedElementIdSet.has(element.elementId) &&
        !selectedElementIdSet.has(nextElement.elementId)
      ) {
        reorderedElements[index] = nextElement;
        reorderedElements[index + 1] = element;
      }
    }
  } else {
    for (let index = 1; index < reorderedElements.length; index += 1) {
      const element = reorderedElements[index];
      const previousElement = reorderedElements[index - 1];

      if (
        element &&
        previousElement &&
        selectedElementIdSet.has(element.elementId) &&
        !selectedElementIdSet.has(previousElement.elementId)
      ) {
        reorderedElements[index - 1] = element;
        reorderedElements[index] = previousElement;
      }
    }
  }

  const operations: DeckPatch["operations"] = reorderedElements.flatMap(
    (element, zIndex) =>
      element.zIndex === zIndex
        ? []
        : [
            {
              type: "update_element_frame" as const,
              slideId: slide.slideId,
              elementId: element.elementId,
              frame: { zIndex }
            }
          ]
  );

  if (operations.length === 0) {
    return null;
  }

  return {
    deckId: args.deck.deckId,
    baseVersion: args.deck.version,
    source: "user",
    operations
  };
}
