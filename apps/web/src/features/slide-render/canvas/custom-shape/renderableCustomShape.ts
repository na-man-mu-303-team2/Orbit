import type { CustomShapeElementProps, CustomShapeNode } from "@orbit/shared";
import type Konva from "konva";
import { Path as KonvaPathShape } from "konva/lib/shapes/Path";

export function buildCustomShapePathDataFromNodes(
  nodes: CustomShapeNode[],
  closed: boolean
) {
  if (nodes.length === 0) {
    return "";
  }

  const segments = [`M ${formatSvgNumber(nodes[0].x)} ${formatSvgNumber(nodes[0].y)}`];

  for (let index = 1; index < nodes.length; index += 1) {
    segments.push(buildCustomShapeSegment(nodes[index - 1], nodes[index]));
  }

  if (closed && nodes.length > 1) {
    segments.push(buildCustomShapeSegment(nodes[nodes.length - 1], nodes[0]));
    segments.push("Z");
  }

  return segments.join(" ");
}

function buildCustomShapeSegment(from: CustomShapeNode, to: CustomShapeNode) {
  const hasCurve =
    typeof from.outX === "number" ||
    typeof from.outY === "number" ||
    typeof to.inX === "number" ||
    typeof to.inY === "number";

  if (!hasCurve) {
    return `L ${formatSvgNumber(to.x)} ${formatSvgNumber(to.y)}`;
  }

  return [
    "C",
    formatSvgNumber(from.outX ?? from.x),
    formatSvgNumber(from.outY ?? from.y),
    formatSvgNumber(to.inX ?? to.x),
    formatSvgNumber(to.inY ?? to.y),
    formatSvgNumber(to.x),
    formatSvgNumber(to.y)
  ].join(" ");
}

function formatSvgNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function getCustomShapeDimension(
  props: CustomShapeElementProps,
  key: "viewBoxWidth" | "viewBoxHeight",
  fallback: number
) {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function getCustomShapePaint(
  props: CustomShapeElementProps,
  key: "fill" | "stroke",
  fallback: string
) {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function getCustomShapeStrokeWidth(props: CustomShapeElementProps) {
  const value = props.strokeWidth;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 2;
}

export function getCustomShapePathData(props: CustomShapeElementProps) {
  const pathData = props.pathData;
  return typeof pathData === "string" ? pathData.trim() : "";
}

export function getCustomShapeDataArray(pathData: string) {
  if (!pathData) {
    return [] as ReturnType<typeof KonvaPathShape.parsePathData>;
  }

  try {
    return KonvaPathShape.parsePathData(pathData);
  } catch {
    return [] as ReturnType<typeof KonvaPathShape.parsePathData>;
  }
}

export function drawCustomShapeScene(
  context: Konva.Context,
  shape: Konva.Shape,
  dataArray: ReturnType<typeof KonvaPathShape.parsePathData>
) {
  context.beginPath();

  let isClosed = false;

  for (const segment of dataArray) {
    const { command, points } = segment;

    switch (command) {
      case "L":
        context.lineTo(points[0], points[1]);
        break;
      case "M":
        context.moveTo(points[0], points[1]);
        break;
      case "C":
        context.bezierCurveTo(
          points[0],
          points[1],
          points[2],
          points[3],
          points[4],
          points[5]
        );
        break;
      case "Q":
        context.quadraticCurveTo(points[0], points[1], points[2], points[3]);
        break;
      case "A": {
        const cx = points[0];
        const cy = points[1];
        const rx = points[2];
        const ry = points[3];
        const theta = points[4];
        const deltaTheta = points[5];
        const psi = points[6];
        const sweepFlag = points[7];
        const radius = rx > ry ? rx : ry;
        const scaleX = rx > ry ? 1 : rx / ry;
        const scaleY = rx > ry ? ry / rx : 1;

        context.translate(cx, cy);
        context.rotate(psi);
        context.scale(scaleX, scaleY);
        context.arc(
          0,
          0,
          radius,
          theta,
          theta + deltaTheta,
          sweepFlag === 0
        );
        context.scale(1 / scaleX, 1 / scaleY);
        context.rotate(-psi);
        context.translate(-cx, -cy);
        break;
      }
      case "z":
        isClosed = true;
        context.closePath();
        break;
    }
  }

  if (!isClosed && !shape.hasFill()) {
    context.strokeShape(shape);
    return;
  }

  context.fillStrokeShape(shape);
}
