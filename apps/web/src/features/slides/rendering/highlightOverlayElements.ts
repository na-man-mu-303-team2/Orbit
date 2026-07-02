import type { Deck, Slide } from "@orbit/shared";
import { normalizeRenderableElement } from "./elementNormalization";

export function getHighlightOverlayElements(args: {
  activeHighlightElementIds: Set<string>;
  deck: Deck;
  slide: Slide;
}) {
  return args.slide.elements
    .filter((element) => args.activeHighlightElementIds.has(element.elementId))
    .map((element) => normalizeRenderableElement(args.deck.canvas, element))
    .sort((left, right) => left.zIndex - right.zIndex);
}
