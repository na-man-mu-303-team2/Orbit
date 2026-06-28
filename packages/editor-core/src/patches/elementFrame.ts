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
  return {
    role: Object.prototype.hasOwnProperty.call(draft, "role")
      ? draft.role
      : currentElement.role,
    x: clampCoordinate(draft.x ?? currentElement.x, canvas.width),
    y: clampCoordinate(draft.y ?? currentElement.y, canvas.height),
    width: clampSize(draft.width ?? currentElement.width),
    height: clampSize(draft.height ?? currentElement.height),
    rotation: normalizeRotation(draft.rotation ?? currentElement.rotation),
    opacity: clampOpacity(draft.opacity ?? currentElement.opacity),
    zIndex: clampZIndex(draft.zIndex ?? currentElement.zIndex),
    locked: draft.locked ?? currentElement.locked,
    visible: draft.visible ?? currentElement.visible
  };
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
