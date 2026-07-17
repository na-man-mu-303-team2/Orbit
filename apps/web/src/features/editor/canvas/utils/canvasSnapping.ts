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
  canvas: DeckCanvas;
  elements: readonly DeckElement[];
  frame: CanvasFrame;
  movingElementId: string;
  phase: "cancel" | "end" | "move";
  selectedElementIds?: readonly string[];
  stageScale: number;
}): CanvasDragInteractionResult {
  if (args.phase === "cancel") {
    return {
      commitFrame: null,
      guides: [],
      previewFrame: null
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
