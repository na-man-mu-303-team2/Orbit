import type {
  DeckCanvas,
  DeckElement,
  GroupElementProps,
  Slide,
} from "@orbit/shared";
import { normalizeElementFrameDraft } from "@orbit/editor-core";

export function getRenderableSlideElements(
  slide: Slide,
  canvas: DeckCanvas,
): DeckElement[] {
  const groupedChildElementIds = new Set<string>();

  for (const element of slide.elements) {
    if (element.type !== "group") {
      continue;
    }

    const groupProps = element.props as GroupElementProps;

    for (const childElementId of groupProps.childElementIds) {
      groupedChildElementIds.add(childElementId);
    }
  }

  return [...slide.elements]
    .filter((element) => !groupedChildElementIds.has(element.elementId))
    .map((element) => normalizeRenderableElement(canvas, element))
    .sort((left, right) => left.zIndex - right.zIndex);
}

function normalizeRenderableElement(
  canvas: DeckCanvas,
  element: DeckElement,
): DeckElement {
  const frame = normalizeElementFrameDraft(canvas, element, {});

  return {
    ...element,
    role: frame.role ?? undefined,
    x: frame.x ?? element.x,
    y: frame.y ?? element.y,
    width: frame.width ?? element.width,
    height: frame.height ?? element.height,
    rotation: frame.rotation ?? element.rotation,
    opacity: frame.opacity ?? element.opacity,
    zIndex: frame.zIndex ?? element.zIndex,
    locked: frame.locked ?? element.locked,
    visible: frame.visible ?? element.visible,
  };
}
