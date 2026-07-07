import type Konva from "konva";
import { Path as KonvaPathShape } from "konva/lib/shapes/Path";

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
