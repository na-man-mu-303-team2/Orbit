import type {
  CustomShapeElementProps,
  Deck,
  DeckElement,
  Slide,
  TextElementProps
} from "@orbit/shared";

import {
  convertCustomShapeNodesToAbsolute,
  getCustomShapeDimension,
  type CanvasPoint
} from "../custom-shape/geometry";
import { getTextElementLayout } from "../text/textLayout";

export function commitCustomShapeEditGeometry(args: {
  element: DeckElement;
  draft: {
    closed: boolean;
    nodes: CustomShapeElementProps["nodes"];
  };
}) {
  const customShapeProps = args.element.props as CustomShapeElementProps;

  return {
    closed: args.draft.closed,
    elementId: args.element.elementId,
    nodes: convertCustomShapeNodesToAbsolute({
      frame: {
        height: args.element.height,
        width: args.element.width,
        x: args.element.x,
        y: args.element.y
      },
      nodes: args.draft.nodes,
      viewBoxHeight: getCustomShapeDimension(
        customShapeProps,
        "viewBoxHeight",
        args.element.height
      ),
      viewBoxWidth: getCustomShapeDimension(
        customShapeProps,
        "viewBoxWidth",
        args.element.width
      )
    })
  };
}

export function isCanvasPointInsideElementSelectionArea(args: {
  deck: Deck;
  element: DeckElement;
  point: CanvasPoint;
  slide: Slide;
}) {
  const { deck, element, point, slide } = args;

  if (!element.visible) {
    return false;
  }

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation
      },
      props: element.props as TextElementProps,
      slide,
      theme: deck.theme
    });

    return isCanvasPointInsideRotatedFrame({
      frame: {
        x: element.x + textLayout.contentX,
        y: element.y + textLayout.y,
        width: Math.max(24, textLayout.contentWidth),
        height: Math.max(1, textLayout.contentHeight),
        rotation: element.rotation
      },
      point
    });
  }

  return isCanvasPointInsideRotatedFrame({
    frame: {
      x: element.x,
      y: element.y,
      width: Math.max(1, element.width),
      height: Math.max(1, element.height),
      rotation: element.rotation
    },
    point
  });
}

export function normalizeDraftRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (width < 4 && height < 4) {
    return null;
  }

  return {
    x,
    y,
    width: Math.max(8, width),
    height: Math.max(8, height)
  };
}

function isCanvasPointInsideRotatedFrame(args: {
  frame: {
    height: number;
    rotation: number;
    width: number;
    x: number;
    y: number;
  };
  point: CanvasPoint;
}) {
  const { frame, point } = args;
  const rotationRadians = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const relativeX = point.x - frame.x;
  const relativeY = point.y - frame.y;
  const localX = relativeX * cos + relativeY * sin;
  const localY = -relativeX * sin + relativeY * cos;

  return (
    localX >= 0 &&
    localX <= frame.width &&
    localY >= 0 &&
    localY <= frame.height
  );
}
