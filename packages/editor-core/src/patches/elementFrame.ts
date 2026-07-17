import type {
  Deck,
  DeckCanvas,
  DeckElement,
  DeckPatch,
  ElementFramePatch
} from "@orbit/shared";

const minimumElementSize = 1;

export type ElementFrameDraft = Partial<
  Pick<
    DeckElement,
    | "x"
    | "y"
    | "width"
    | "height"
    | "rotation"
    | "opacity"
    | "zIndex"
    | "locked"
    | "visible"
  >
> & {
  role?: DeckElement["role"] | null;
};

export function normalizeElementFrameDraft(
  canvas: DeckCanvas,
  currentElement: DeckElement,
  draft: ElementFrameDraft
): ElementFramePatch {
  const frame: ElementFramePatch = {};
  const hasOwn = (key: keyof ElementFrameDraft) =>
    Object.prototype.hasOwnProperty.call(draft, key);
  const hasGeometryChange =
    hasOwn("x") ||
    hasOwn("y") ||
    hasOwn("width") ||
    hasOwn("height") ||
    hasOwn("rotation");

  if (hasGeometryChange) {
    frame.x = clampCoordinate(draft.x ?? currentElement.x, canvas.width);
    frame.y = clampCoordinate(draft.y ?? currentElement.y, canvas.height);
    frame.width = clampSize(draft.width ?? currentElement.width);
    frame.height = clampSize(draft.height ?? currentElement.height);
    frame.rotation = normalizeRotation(draft.rotation ?? currentElement.rotation);
  }

  if (hasOwn("role")) {
    frame.role = draft.role;
  }
  if (hasOwn("opacity")) {
    frame.opacity = clampOpacity(draft.opacity ?? currentElement.opacity);
  }
  if (hasOwn("zIndex")) {
    frame.zIndex = clampZIndex(draft.zIndex ?? currentElement.zIndex);
  }
  if (hasOwn("locked")) {
    frame.locked = draft.locked ?? currentElement.locked;
  }
  if (hasOwn("visible")) {
    frame.visible = draft.visible ?? currentElement.visible;
  }

  return frame;
}

export function createElementFramePatch(
  deck: Deck,
  slideId: string,
  elementId: string,
  frame: ElementFrameDraft
): DeckPatch {
  const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
  const element = slide?.elements.find(
    (candidate) => candidate.elementId === elementId
  );

  if (!slide || !element) {
    throw new Error(`Element ${elementId} was not found in slide ${slideId}`);
  }

  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "update_element_frame",
        slideId,
        elementId,
        frame: normalizeElementFrameDraft(deck.canvas, element, frame)
      }
    ]
  };
}

function clampCoordinate(value: number, max: number) {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
}

function clampSize(value: number) {
  return Math.max(minimumElementSize, Number.isFinite(value) ? value : minimumElementSize);
}

function clampOpacity(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}

function clampZIndex(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeRotation(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const remainder = value % 360;
  return remainder < 0 ? remainder + 360 : remainder;
}
