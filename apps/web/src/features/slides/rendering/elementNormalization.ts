import {
  deckElementSchema,
  type DeckCanvas,
  type DeckElement,
  type GroupElementProps,
  type Slide
} from "@orbit/shared";
import { normalizeElementFrameDraft } from "@orbit/editor-core";

export function getRenderableSlideElements(slide: Slide, canvas: DeckCanvas) {
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

export function normalizeRenderableElement(
  canvas: DeckCanvas,
  element: unknown
): DeckElement {
  const elementDraft = element as DeckElement;
  const frame = normalizeElementFrameDraft(canvas, elementDraft, {
    role: elementDraft.role,
    x: elementDraft.x,
    y: elementDraft.y,
    width: elementDraft.width,
    height: elementDraft.height,
    rotation: elementDraft.rotation,
    opacity: elementDraft.opacity,
    zIndex: elementDraft.zIndex,
    locked: elementDraft.locked,
    visible: elementDraft.visible
  });

  return deckElementSchema.parse({
    ...elementDraft,
    role: frame.role ?? undefined,
    x: frame.x ?? elementDraft.x,
    y: frame.y ?? elementDraft.y,
    width: frame.width ?? elementDraft.width,
    height: frame.height ?? elementDraft.height,
    rotation: frame.rotation ?? elementDraft.rotation,
    opacity: frame.opacity ?? elementDraft.opacity,
    zIndex: frame.zIndex ?? elementDraft.zIndex,
    locked: frame.locked ?? elementDraft.locked,
    visible: frame.visible ?? elementDraft.visible
  });
}
