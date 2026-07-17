import type { DeckElement, GroupElementProps } from "@orbit/shared";

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type CanvasSelectionModifiers = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export type CanvasSelectionMode = "replace" | "toggle" | "union";

export const canvasMarqueeScreenThreshold = 3;

export function getCanvasSelectionMode(
  modifiers: CanvasSelectionModifiers
): CanvasSelectionMode {
  if (modifiers.metaKey || modifiers.ctrlKey) {
    return "toggle";
  }

  return modifiers.shiftKey ? "union" : "replace";
}

export function getSelectableCanvasElements(
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

  return elements.filter(
    (element) =>
      element.visible && !groupedChildElementIds.has(element.elementId)
  );
}

export function applyCanvasSelection(args: {
  currentSelection: readonly string[];
  elements: readonly DeckElement[];
  hitElementIds: readonly string[];
  modifiers?: CanvasSelectionModifiers;
}): string[] {
  const selectableElements = getSelectableCanvasElements(args.elements);
  const selectableElementIds = selectableElements.map(
    (element) => element.elementId
  );
  const selectableElementIdSet = new Set(selectableElementIds);
  const currentSelectionSet = new Set(
    args.currentSelection.filter((elementId) =>
      selectableElementIdSet.has(elementId)
    )
  );
  const hitElementIdSet = new Set(
    args.hitElementIds.filter((elementId) =>
      selectableElementIdSet.has(elementId)
    )
  );
  const mode = getCanvasSelectionMode(args.modifiers ?? {});

  if (mode === "replace") {
    return selectableElementIds.filter((elementId) =>
      hitElementIdSet.has(elementId)
    );
  }

  if (mode === "union") {
    return selectableElementIds.filter(
      (elementId) =>
        currentSelectionSet.has(elementId) || hitElementIdSet.has(elementId)
    );
  }

  return selectableElementIds.filter(
    (elementId) =>
      currentSelectionSet.has(elementId) !== hitElementIdSet.has(elementId)
  );
}

export function normalizeCanvasSelectionRect(
  start: CanvasPoint,
  end: CanvasPoint
): CanvasRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

export function hasReachedCanvasMarqueeThreshold(args: {
  end: CanvasPoint;
  start: CanvasPoint;
  threshold?: number;
}): boolean {
  const threshold = args.threshold ?? canvasMarqueeScreenThreshold;

  return Math.hypot(
    args.end.x - args.start.x,
    args.end.y - args.start.y
  ) >= threshold;
}

export function getRotatedElementAabb(
  element: Pick<DeckElement, "height" | "rotation" | "width" | "x" | "y">
): CanvasRect {
  const radians = (element.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    { x: 0, y: 0 },
    { x: element.width, y: 0 },
    { x: element.width, y: element.height },
    { x: 0, y: element.height }
  ].map((corner) => ({
    x: element.x + corner.x * cosine - corner.y * sine,
    y: element.y + corner.x * sine + corner.y * cosine
  }));
  const xCoordinates = corners.map((corner) => corner.x);
  const yCoordinates = corners.map((corner) => corner.y);
  const left = Math.min(...xCoordinates);
  const top = Math.min(...yCoordinates);
  const right = Math.max(...xCoordinates);
  const bottom = Math.max(...yCoordinates);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function isCanvasRectFullyContained(
  container: CanvasRect,
  candidate: CanvasRect
): boolean {
  const floatingPointTolerance = 1e-7;

  return (
    candidate.x >= container.x - floatingPointTolerance &&
    candidate.y >= container.y - floatingPointTolerance &&
    candidate.x + candidate.width <=
      container.x + container.width + floatingPointTolerance &&
    candidate.y + candidate.height <=
      container.y + container.height + floatingPointTolerance
  );
}

export function getMarqueeSelectionElementIds(args: {
  elements: readonly DeckElement[];
  rect: CanvasRect;
}): string[] {
  return getSelectableCanvasElements(args.elements)
    .filter((element) =>
      isCanvasRectFullyContained(args.rect, getRotatedElementAabb(element))
    )
    .map((element) => element.elementId);
}
