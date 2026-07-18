import type { DeckElement } from "@orbit/shared";

export type ElementTransformFrame = {
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

export function resolveTransformedElementFrame(args: {
  frame: ElementTransformFrame;
  transform: {
    rotation: number;
    scaleX: number;
    scaleY: number;
    x: number;
    y: number;
  };
}): ElementTransformFrame {
  return {
    x: args.transform.x,
    y: args.transform.y,
    width: Math.max(1, args.frame.width * args.transform.scaleX),
    height: Math.max(1, args.frame.height * args.transform.scaleY),
    rotation: args.transform.rotation,
  };
}

const allResizeAnchors = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

const proportionalResizeAnchors = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export function getSelectionTransformerConfig(args: {
  disableInteractions: boolean;
  selectedElements: DeckElement[];
  stageScale: number;
}) {
  const safeScale = Math.max(args.stageScale, 0.05);
  const selectedElement =
    args.selectedElements.length === 1 ? args.selectedElements[0] : null;
  const shouldPreserveAspectRatio =
    selectedElement?.type === "image" || selectedElement?.type === "svg";

  return {
    anchorCornerRadius: 2 / safeScale,
    anchorHitStrokeWidth: 20 / safeScale,
    anchorSize: 12 / safeScale,
    anchorStrokeWidth: 1.5 / safeScale,
    borderStrokeWidth: 1.5 / safeScale,
    enabledAnchors: args.disableInteractions
      ? []
      : shouldPreserveAspectRatio
        ? [...proportionalResizeAnchors]
        : [...allResizeAnchors],
    keepRatio: shouldPreserveAspectRatio,
    padding: 2 / safeScale,
    rotateAnchorOffset: 32 / safeScale,
  };
}
