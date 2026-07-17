import type { DeckCanvas, DeckElement } from "@orbit/shared";

import { getRotatedElementAabb, getSelectableCanvasElements } from "./canvasSelection";

export const canvasSnapScreenTolerance = 5;
export const canvasSafeMarginRatios = {
  horizontal: 0.05,
  vertical: 0.0667
} as const;

export type CanvasFrame = {
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

export type CanvasSnapGuide = {
  axis: "x" | "y";
  elementId?: string;
  kind: "element" | "safe-margin" | "slide-center" | "slide-edge";
  position: number;
};

type CanvasSnapCandidate = CanvasSnapGuide;

export type CanvasSnapResult = {
  frame: CanvasFrame;
  guides: CanvasSnapGuide[];
};

export type CanvasDragInteractionResult = {
  commitFrame: CanvasFrame | null;
  guides: CanvasSnapGuide[];
  previewFrame: CanvasFrame | null;
};

export const canvasResizeHandles = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right"
] as const;

export type CanvasResizeHandle = (typeof canvasResizeHandles)[number];

export type CanvasResizeBox = {
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

export type CanvasResizeSnapResult = {
  box: CanvasResizeBox;
  guides: CanvasSnapGuide[];
};

export function transformerBoxToCanvasResizeBox(
  box: CanvasResizeBox,
  stageScale: number
): CanvasResizeBox {
  const safeStageScale = stageScale > 0 ? stageScale : 1;

  return {
    height: box.height / safeStageScale,
    rotation: box.rotation,
    width: box.width / safeStageScale,
    x: box.x / safeStageScale,
    y: box.y / safeStageScale
  };
}

export function canvasResizeBoxToTransformerBox(
  box: CanvasResizeBox,
  stageScale: number
): CanvasResizeBox {
  const safeStageScale = stageScale > 0 ? stageScale : 1;

  return {
    height: box.height * safeStageScale,
    rotation: box.rotation,
    width: box.width * safeStageScale,
    x: box.x * safeStageScale,
    y: box.y * safeStageScale
  };
}

export function buildCanvasSnapCandidates(args: {
  canvas: DeckCanvas;
  elements: readonly DeckElement[];
  movingElementId: string;
  selectedElementIds?: readonly string[];
}): CanvasSnapCandidate[] {
  const { canvas, elements, movingElementId, selectedElementIds = [] } = args;
  const excludedElementIds = new Set([movingElementId, ...selectedElementIds]);
  const horizontalSafeMargin = canvas.width * canvasSafeMarginRatios.horizontal;
  const verticalSafeMargin = canvas.height * canvasSafeMarginRatios.vertical;
  const slideCandidates: CanvasSnapCandidate[] = [
    { axis: "x", kind: "slide-edge", position: 0 },
    { axis: "x", kind: "slide-center", position: canvas.width / 2 },
    { axis: "x", kind: "slide-edge", position: canvas.width },
    { axis: "x", kind: "safe-margin", position: horizontalSafeMargin },
    {
      axis: "x",
      kind: "safe-margin",
      position: canvas.width * (1 - canvasSafeMarginRatios.horizontal)
    },
    { axis: "y", kind: "slide-edge", position: 0 },
    { axis: "y", kind: "slide-center", position: canvas.height / 2 },
    { axis: "y", kind: "slide-edge", position: canvas.height },
    { axis: "y", kind: "safe-margin", position: verticalSafeMargin },
    {
      axis: "y",
      kind: "safe-margin",
      position: canvas.height * (1 - canvasSafeMarginRatios.vertical)
    }
  ];
  const elementCandidates = getSelectableCanvasElements(elements)
    .filter((element) => !excludedElementIds.has(element.elementId))
    .flatMap((element): CanvasSnapCandidate[] => {
      const aabb = getRotatedElementAabb(element);

      return [
        {
          axis: "x",
          elementId: element.elementId,
          kind: "element",
          position: aabb.x
        },
        {
          axis: "x",
          elementId: element.elementId,
          kind: "element",
          position: aabb.x + aabb.width / 2
        },
        {
          axis: "x",
          elementId: element.elementId,
          kind: "element",
          position: aabb.x + aabb.width
        },
        {
          axis: "y",
          elementId: element.elementId,
          kind: "element",
          position: aabb.y
        },
        {
          axis: "y",
          elementId: element.elementId,
          kind: "element",
          position: aabb.y + aabb.height / 2
        },
        {
          axis: "y",
          elementId: element.elementId,
          kind: "element",
          position: aabb.y + aabb.height
        }
      ];
    });

  return [...slideCandidates, ...elementCandidates];
}

export function snapCanvasFrame(args: {
  canvas: DeckCanvas;
  elements: readonly DeckElement[];
  frame: CanvasFrame;
  movingElementId: string;
  selectedElementIds?: readonly string[];
  stageScale: number;
}): CanvasSnapResult {
  const { frame } = args;
  const candidates = buildCanvasSnapCandidates(args);
  const movingAabb = getRotatedElementAabb(frame);
  const tolerance =
    canvasSnapScreenTolerance / (args.stageScale > 0 ? args.stageScale : 1);
  const horizontalSnap = getNearestAxisSnap({
    anchors: [
      movingAabb.x,
      movingAabb.x + movingAabb.width / 2,
      movingAabb.x + movingAabb.width
    ],
    candidates: candidates.filter((candidate) => candidate.axis === "x"),
    tolerance
  });
  const verticalSnap = getNearestAxisSnap({
    anchors: [
      movingAabb.y,
      movingAabb.y + movingAabb.height / 2,
      movingAabb.y + movingAabb.height
    ],
    candidates: candidates.filter((candidate) => candidate.axis === "y"),
    tolerance
  });

  return {
    frame: {
      ...frame,
      x: frame.x + (horizontalSnap?.delta ?? 0),
      y: frame.y + (verticalSnap?.delta ?? 0)
    },
    guides: [horizontalSnap?.guide, verticalSnap?.guide].filter(
      (guide): guide is CanvasSnapGuide => Boolean(guide)
    )
  };
}

export function resolveCanvasDragInteraction(args: {
  bypassSnapping?: boolean;
  canvas: DeckCanvas;
  elements: readonly DeckElement[];
  frame: CanvasFrame;
  movingElementId: string;
  phase: "cancel" | "end" | "move";
  selectedElementIds?: readonly string[];
  snappingEnabled?: boolean;
  stageScale: number;
}): CanvasDragInteractionResult {
  if (args.phase === "cancel") {
    return {
      commitFrame: null,
      guides: [],
      previewFrame: null
    };
  }

  if (args.snappingEnabled === false || args.bypassSnapping) {
    if (args.phase === "end") {
      return {
        commitFrame: args.frame,
        guides: [],
        previewFrame: null
      };
    }

    return {
      commitFrame: null,
      guides: [],
      previewFrame: args.frame
    };
  }

  const result = snapCanvasFrame(args);

  if (args.phase === "end") {
    return {
      commitFrame: result.frame,
      guides: [],
      previewFrame: null
    };
  }

  return {
    commitFrame: null,
    guides: result.guides,
    previewFrame: result.frame
  };
}

export function isCanvasResizeHandle(value: string | null): value is CanvasResizeHandle {
  return canvasResizeHandles.some((handle) => handle === value);
}

export function snapCanvasResizeBox(args: {
  activeHandle: CanvasResizeHandle;
  box: CanvasResizeBox;
  canvas: DeckCanvas;
  elements: readonly DeckElement[];
  movingElementId: string;
  selectedElementIds?: readonly string[];
  snappingEnabled?: boolean;
  stageScale: number;
}): CanvasResizeSnapResult {
  const sides = getResizeHandleSides(args.activeHandle);
  const tolerance =
    canvasSnapScreenTolerance / (args.stageScale > 0 ? args.stageScale : 1);
  const clampedBox = resizeBoxDimensions({
    box: args.box,
    height: Math.max(1, args.box.height),
    horizontalSide: sides.horizontal,
    verticalSide: sides.vertical,
    width: Math.max(1, args.box.width)
  });

  if (args.snappingEnabled === false) {
    return {
      box: clampedBox,
      guides: []
    };
  }

  const candidates = buildCanvasSnapCandidates(args);
  const movingPoint = getResizeHandlePoint(clampedBox, sides);
  const horizontalCandidates = candidates.filter(
    (candidate) => candidate.axis === "x"
  );
  const verticalCandidates = candidates.filter(
    (candidate) => candidate.axis === "y"
  );

  let nextWidth = clampedBox.width;
  let nextHeight = clampedBox.height;
  let requestedGuides: CanvasSnapGuide[] = [];

  if (sides.horizontal !== 0 && sides.vertical !== 0) {
    const horizontalSnap = getNearestAxisSnap({
      anchors: [movingPoint.x],
      candidates: horizontalCandidates,
      tolerance
    });
    const verticalSnap = getNearestAxisSnap({
      anchors: [movingPoint.y],
      candidates: verticalCandidates,
      tolerance
    });
    const delta = {
      x: horizontalSnap?.delta ?? 0,
      y: verticalSnap?.delta ?? 0
    };
    const axes = getResizeBoxAxes(clampedBox.rotation);

    nextWidth = Math.max(
      1,
      clampedBox.width +
        sides.horizontal * (axes.horizontal.x * delta.x + axes.horizontal.y * delta.y)
    );
    nextHeight = Math.max(
      1,
      clampedBox.height +
        sides.vertical * (axes.vertical.x * delta.x + axes.vertical.y * delta.y)
    );
    requestedGuides = [horizontalSnap?.guide, verticalSnap?.guide].filter(
      (guide): guide is CanvasSnapGuide => Boolean(guide)
    );
  } else {
    const dimensionSnap = getNearestResizeDimensionSnap({
      candidates,
      direction:
        sides.horizontal !== 0
          ? sides.horizontal
          : (sides.vertical as -1 | 1),
      movingPoint,
      movementAxis:
        sides.horizontal !== 0
          ? getResizeBoxAxes(clampedBox.rotation).horizontal
          : getResizeBoxAxes(clampedBox.rotation).vertical,
      tolerance
    });

    if (dimensionSnap) {
      if (sides.horizontal !== 0) {
        nextWidth = Math.max(1, clampedBox.width + dimensionSnap.dimensionDelta);
      } else {
        nextHeight = Math.max(1, clampedBox.height + dimensionSnap.dimensionDelta);
      }
      requestedGuides = [dimensionSnap.guide];
    }
  }

  const box = resizeBoxDimensions({
    box: clampedBox,
    height: nextHeight,
    horizontalSide: sides.horizontal,
    verticalSide: sides.vertical,
    width: nextWidth
  });
  const snappedPoint = getResizeHandlePoint(box, sides);

  return {
    box,
    guides: requestedGuides.filter((guide) =>
      guide.axis === "x"
        ? nearlyEqual(snappedPoint.x, guide.position)
        : nearlyEqual(snappedPoint.y, guide.position)
    )
  };
}

function getResizeHandleSides(handle: CanvasResizeHandle): {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
} {
  return {
    horizontal: handle.endsWith("left")
      ? -1
      : handle.endsWith("right")
        ? 1
        : 0,
    vertical: handle.startsWith("top")
      ? -1
      : handle.startsWith("bottom")
        ? 1
        : 0
  };
}

function getResizeBoxAxes(rotation: number) {
  return {
    horizontal: {
      x: Math.cos(rotation),
      y: Math.sin(rotation)
    },
    vertical: {
      x: -Math.sin(rotation),
      y: Math.cos(rotation)
    }
  };
}

function getResizeHandlePoint(
  box: CanvasResizeBox,
  sides: { horizontal: -1 | 0 | 1; vertical: -1 | 0 | 1 }
) {
  const axes = getResizeBoxAxes(box.rotation);
  const horizontalOffset =
    sides.horizontal === -1 ? 0 : sides.horizontal === 1 ? box.width : box.width / 2;
  const verticalOffset =
    sides.vertical === -1 ? 0 : sides.vertical === 1 ? box.height : box.height / 2;

  return {
    x:
      box.x +
      axes.horizontal.x * horizontalOffset +
      axes.vertical.x * verticalOffset,
    y:
      box.y +
      axes.horizontal.y * horizontalOffset +
      axes.vertical.y * verticalOffset
  };
}

function resizeBoxDimensions(args: {
  box: CanvasResizeBox;
  height: number;
  horizontalSide: -1 | 0 | 1;
  verticalSide: -1 | 0 | 1;
  width: number;
}): CanvasResizeBox {
  const axes = getResizeBoxAxes(args.box.rotation);
  const horizontalFixedRatio =
    args.horizontalSide === -1 ? 1 : args.horizontalSide === 1 ? 0 : 0.5;
  const verticalFixedRatio =
    args.verticalSide === -1 ? 1 : args.verticalSide === 1 ? 0 : 0.5;
  const horizontalOriginDelta =
    (args.box.width - args.width) * horizontalFixedRatio;
  const verticalOriginDelta =
    (args.box.height - args.height) * verticalFixedRatio;

  return {
    ...args.box,
    height: args.height,
    width: args.width,
    x:
      args.box.x +
      axes.horizontal.x * horizontalOriginDelta +
      axes.vertical.x * verticalOriginDelta,
    y:
      args.box.y +
      axes.horizontal.y * horizontalOriginDelta +
      axes.vertical.y * verticalOriginDelta
  };
}

function getNearestResizeDimensionSnap(args: {
  candidates: readonly CanvasSnapCandidate[];
  direction: -1 | 1;
  movingPoint: { x: number; y: number };
  movementAxis: { x: number; y: number };
  tolerance: number;
}): { dimensionDelta: number; guide: CanvasSnapGuide } | null {
  let nearest: {
    dimensionDelta: number;
    guide: CanvasSnapGuide;
    movementDistance: number;
  } | null = null;

  for (const candidate of args.candidates) {
    const axisComponent =
      candidate.axis === "x" ? args.movementAxis.x : args.movementAxis.y;
    const pointPosition =
      candidate.axis === "x" ? args.movingPoint.x : args.movingPoint.y;
    const axisDelta = candidate.position - pointPosition;
    const denominator = axisComponent * args.direction;

    if (Math.abs(axisDelta) > args.tolerance || Math.abs(denominator) < 1e-9) {
      continue;
    }

    const dimensionDelta = axisDelta / denominator;
    const movementDistance = Math.abs(dimensionDelta);

    if (movementDistance > args.tolerance) {
      continue;
    }

    if (!nearest || movementDistance < nearest.movementDistance) {
      nearest = {
        dimensionDelta,
        guide: candidate,
        movementDistance
      };
    }
  }

  return nearest
    ? {
        dimensionDelta: nearest.dimensionDelta,
        guide: nearest.guide
      }
    : null;
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) <= 1e-6;
}

function getNearestAxisSnap(args: {
  anchors: readonly number[];
  candidates: readonly CanvasSnapCandidate[];
  tolerance: number;
}): { delta: number; guide: CanvasSnapGuide } | null {
  let nearest: { delta: number; guide: CanvasSnapGuide } | null = null;

  for (const candidate of args.candidates) {
    for (const anchor of args.anchors) {
      const delta = candidate.position - anchor;

      if (Math.abs(delta) > args.tolerance) {
        continue;
      }

      if (!nearest || Math.abs(delta) < Math.abs(nearest.delta)) {
        nearest = {
          delta,
          guide: candidate
        };
      }
    }
  }

  return nearest;
}
