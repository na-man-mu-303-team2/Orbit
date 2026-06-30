import {
  maxAssetUploadSizeBytes,
  type Chart,
  type CustomShapeElementProps,
  type CustomShapeNode,
  type Deck,
  type DeckCanvas,
  type DeckElement,
  type GroupElementProps,
  type ImageElementProps,
  type ShapeElementProps,
  type Slide,
  type TextElementProps
} from "@orbit/shared";
import {
  getGroupChildElements
} from "../../../../../packages/editor-core/src/index";
import {
  normalizeElementFrameDraft
} from "../../../../../packages/editor-core/src/patches/elementFrame";
import type Konva from "konva";
import type { Box as TransformerBox } from "konva/lib/shapes/Transformer";
import { Path as KonvaPathShape } from "konva/lib/shapes/Path";
import { Text as KonvaTextShape } from "konva/lib/shapes/Text";
import {
  Arrow as KonvaArrowComponent,
  Circle as KonvaCircle,
  Group as KonvaGroup,
  Image as KonvaImageComponent,
  Layer as KonvaLayer,
  Line as KonvaLine,
  Rect as KonvaRect,
  RegularPolygon as KonvaRegularPolygon,
  Shape as KonvaShape,
  Stage as KonvaStage,
  Star as KonvaStarComponent,
  Text as KonvaText,
  Transformer as KonvaTransformer
} from "react-konva";
import type { ComponentType, MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { resolveEditorAssetUrl } from "./editorAssetUrl";

type KonvaComponent = ComponentType<any>;

const Circle = KonvaCircle as unknown as KonvaComponent;
const Group = KonvaGroup as unknown as KonvaComponent;
const KonvaArrow = KonvaArrowComponent as unknown as KonvaComponent;
const KonvaImage = KonvaImageComponent as unknown as KonvaComponent;
const KonvaStar = KonvaStarComponent as unknown as KonvaComponent;
const Layer = KonvaLayer as unknown as KonvaComponent;
const Line = KonvaLine as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const RegularPolygon = KonvaRegularPolygon as unknown as KonvaComponent;
const Shape = KonvaShape as unknown as KonvaComponent;
const Stage = KonvaStage as unknown as KonvaComponent;
const Text = KonvaText as unknown as KonvaComponent;
const Transformer = KonvaTransformer as unknown as KonvaComponent;

const textElementPadding = 4;
const defaultImageInsertFrame = {
  height: 240,
  width: 420,
  x: 260,
  y: 220
};
const editorImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type InsertTool = "select" | "text" | "rect" | "ellipse" | "line" | "customShape";
type DrawableInsertTool = Exclude<InsertTool, "select" | "customShape">;
type CanvasPoint = {
  x: number;
  y: number;
};
type CustomShapeInsertDraft = {
  activeNodeIndex: number | null;
  nodes: CustomShapeNode[];
  pointer: CanvasPoint | null;
};
type CustomShapeEditDraft = {
  closed: boolean;
  elementId: string;
  nodes: CustomShapeNode[];
  selectedNodeIndex: number | null;
};

function RenderOnlyElementNode(props: {
  accentColor: string;
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { accentColor, deck, element, frame, slide } = props;

  return (
    <Group
      listening={false}
      opacity={element.visible ? element.opacity : 0}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
    >
      <ElementNodeContent
        accentColor={accentColor}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
    </Group>
  );
}

export function HiddenSlideRenderStages(props: {
  deck: Deck;
  stageRefs: MutableRefObject<Map<string, Konva.Stage>>;
}) {
  const { deck, stageRefs } = props;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: -10000,
        left: -10000,
        width: deck.canvas.width,
        height: deck.canvas.height,
        pointerEvents: "none",
        opacity: 0,
      }}
    >
      {deck.slides.map((slide) => {
        const visibleElements = getRenderableSlideElements(slide, deck.canvas);

        return (
          <Stage
            height={deck.canvas.height}
            key={slide.slideId}
            ref={(stage: Konva.Stage | null) => {
              if (stage) {
                stageRefs.current.set(slide.slideId, stage);
              } else {
                stageRefs.current.delete(slide.slideId);
              }
            }}
            width={deck.canvas.width}
          >
            <Layer>
              {visibleElements.map((element) => (
                <RenderOnlyElementNode
                  key={element.elementId}
                  accentColor={slide.style.accentColor ?? deck.theme.accentColor}
                  deck={deck}
                  element={element}
                  frame={{
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: element.height,
                    rotation: element.rotation,
                  }}
                  slide={slide}
                />
              ))}
            </Layer>
          </Stage>
        );
      })}
    </div>
  );
}

function cloneCustomShapeNodes(nodes: CustomShapeNode[]) {
  return nodes.map((node) => ({ ...node }));
}

function getCustomShapeNodes(props: CustomShapeElementProps) {
  return Array.isArray(props.nodes) ? cloneCustomShapeNodes(props.nodes) : [];
}

function buildCustomShapePathDataFromNodes(
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

export function normalizeCustomShapeAbsoluteGeometry(
  nodes: CustomShapeNode[],
  closed: boolean
) {
  const bounds = getCustomShapeNodeBounds(nodes);
  const frameX = Math.max(0, Math.floor(bounds.minX));
  const frameY = Math.max(0, Math.floor(bounds.minY));
  const maxX = Math.max(frameX + 1, Math.ceil(bounds.maxX));
  const maxY = Math.max(frameY + 1, Math.ceil(bounds.maxY));
  const width = Math.max(1, maxX - frameX);
  const height = Math.max(1, maxY - frameY);
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    x: node.x - frameX,
    y: node.y - frameY,
    ...(typeof node.inX === "number" ? { inX: node.inX - frameX } : {}),
    ...(typeof node.inY === "number" ? { inY: node.inY - frameY } : {}),
    ...(typeof node.outX === "number" ? { outX: node.outX - frameX } : {}),
    ...(typeof node.outY === "number" ? { outY: node.outY - frameY } : {})
  }));

  return {
    frame: {
      x: frameX,
      y: frameY,
      width,
      height
    },
    props: {
      closed,
      nodes: normalizedNodes,
      pathData: buildCustomShapePathDataFromNodes(normalizedNodes, closed),
      viewBoxWidth: width,
      viewBoxHeight: height
    }
  };
}

function getCustomShapeNodeBounds(nodes: CustomShapeNode[]) {
  const points = nodes.flatMap((node) => [
    { x: node.x, y: node.y },
    ...(typeof node.inX === "number" && typeof node.inY === "number"
      ? [{ x: node.inX, y: node.inY }]
      : []),
    ...(typeof node.outX === "number" && typeof node.outY === "number"
      ? [{ x: node.outX, y: node.outY }]
      : [])
  ]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys)
  };
}

export function getCustomShapeAbsoluteNodes(element: DeckElement) {
  if (element.type !== "customShape") {
    return [] as CustomShapeNode[];
  }

  const props = element.props as CustomShapeElementProps;
  const viewBoxWidth = getCustomShapeDimension(
    props,
    "viewBoxWidth",
    element.width
  );
  const viewBoxHeight = getCustomShapeDimension(
    props,
    "viewBoxHeight",
    element.height
  );

  return convertCustomShapeNodesToAbsolute({
    frame: {
      height: element.height,
      width: element.width,
      x: element.x,
      y: element.y
    },
    nodes: getCustomShapeNodes(props),
    viewBoxHeight,
    viewBoxWidth
  });
}

function convertCustomShapeNodesToAbsolute(args: {
  frame: { x: number; y: number; width: number; height: number };
  nodes: CustomShapeNode[];
  viewBoxWidth: number;
  viewBoxHeight: number;
}) {
  const { frame, nodes, viewBoxHeight, viewBoxWidth } = args;
  const scaleX = frame.width / viewBoxWidth;
  const scaleY = frame.height / viewBoxHeight;

  return nodes.map((node) => ({
    ...node,
    x: frame.x + node.x * scaleX,
    y: frame.y + node.y * scaleY,
    ...(typeof node.inX === "number" ? { inX: frame.x + node.inX * scaleX } : {}),
    ...(typeof node.inY === "number" ? { inY: frame.y + node.inY * scaleY } : {}),
    ...(typeof node.outX === "number" ? { outX: frame.x + node.outX * scaleX } : {}),
    ...(typeof node.outY === "number" ? { outY: frame.y + node.outY * scaleY } : {})
  }));
}

function createCustomShapeNode(point: CanvasPoint): CustomShapeNode {
  return {
    x: point.x,
    y: point.y,
    mode: "corner"
  };
}

function moveCustomShapeNode(
  node: CustomShapeNode,
  point: CanvasPoint
): CustomShapeNode {
  const deltaX = point.x - node.x;
  const deltaY = point.y - node.y;

  return {
    ...node,
    x: point.x,
    y: point.y,
    ...(typeof node.inX === "number" ? { inX: node.inX + deltaX } : {}),
    ...(typeof node.inY === "number" ? { inY: node.inY + deltaY } : {}),
    ...(typeof node.outX === "number" ? { outX: node.outX + deltaX } : {}),
    ...(typeof node.outY === "number" ? { outY: node.outY + deltaY } : {})
  };
}

function updateCustomShapeNodeHandle(
  node: CustomShapeNode,
  handle: "in" | "out",
  point: CanvasPoint
): CustomShapeNode {
  const deltaX = point.x - node.x;
  const deltaY = point.y - node.y;
  const mirroredPoint = {
    x: node.x - deltaX,
    y: node.y - deltaY
  };
  const hasMeaningfulHandle = Math.hypot(deltaX, deltaY) >= 4;

  if (!hasMeaningfulHandle) {
    return {
      x: node.x,
      y: node.y,
      mode: "corner" as const
    };
  }

  if (handle === "in") {
    return {
      ...node,
      mode: "smooth" as const,
      inX: point.x,
      inY: point.y,
      outX: mirroredPoint.x,
      outY: mirroredPoint.y
    };
  }

  return {
    ...node,
    mode: "smooth" as const,
    inX: mirroredPoint.x,
    inY: mirroredPoint.y,
    outX: point.x,
    outY: point.y
  };
}

function toggleCustomShapeNodeMode(
  node: CustomShapeNode,
  handleLength: number
): CustomShapeNode {
  if (node.mode === "smooth") {
    return {
      x: node.x,
      y: node.y,
      mode: "corner"
    };
  }

  return {
    ...node,
    mode: "smooth",
    inX: node.x - handleLength,
    inY: node.y,
    outX: node.x + handleLength,
    outY: node.y
  };
}

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

function normalizeRenderableElement(
  canvas: DeckCanvas,
  element: DeckElement
): DeckElement {
  const frame = normalizeElementFrameDraft(canvas, element, {});

  return {
    ...element,
    role: frame.role ?? undefined,
    x: frame.x ?? element.x,
    y: frame.y ?? element.y,
    width: frame.width ?? element.width,
    height: frame.height ?? element.height,
    rotation: frame.rotation ?? element.rotation,
    opacity: frame.opacity ?? element.opacity,
    zIndex: frame.zIndex ?? element.zIndex,
    locked: frame.locked ?? element.locked,
    visible: frame.visible ?? element.visible
  };
}

export function getNextElementZIndex(elements: DeckElement[]) {
  return (
    elements.reduce(
      (currentMaxZIndex, element) => Math.max(currentMaxZIndex, element.zIndex),
      0
    ) + 1
  );
}

function getGroupedChildPreviewFrame(args: {
  childElement: DeckElement;
  currentGroupFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  previewGroupFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
}) {
  const { childElement, currentGroupFrame, previewGroupFrame } = args;
  const scaleX = previewGroupFrame.width / Math.max(1, currentGroupFrame.width);
  const scaleY = previewGroupFrame.height / Math.max(1, currentGroupFrame.height);

  return {
    height: Math.max(1, childElement.height * scaleY),
    rotation: childElement.rotation - currentGroupFrame.rotation,
    width: Math.max(1, childElement.width * scaleX),
    x: (childElement.x - currentGroupFrame.x) * scaleX,
    y: (childElement.y - currentGroupFrame.y) * scaleY
  };
}

export function getContextMenuPosition(args: {
  clientX: number;
  clientY: number;
  width: number;
  height: number;
}) {
  const viewportPadding = 12;

  return {
    left: Math.min(
      Math.max(viewportPadding, args.clientX),
      Math.max(viewportPadding, window.innerWidth - args.width - viewportPadding)
    ),
    top: Math.min(
      Math.max(viewportPadding, args.clientY),
      Math.max(viewportPadding, window.innerHeight - args.height - viewportPadding)
    )
  };
}

function getCustomShapePathData(props: CustomShapeElementProps) {
  const pathData = props.pathData;
  return typeof pathData === "string" ? pathData.trim() : "";
}

function getCustomShapeDimension(
  props: CustomShapeElementProps,
  key: "viewBoxWidth" | "viewBoxHeight",
  fallback: number
) {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function getCustomShapePaint(
  props: CustomShapeElementProps,
  key: "fill" | "stroke",
  fallback: string
) {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getCustomShapeStrokeWidth(props: CustomShapeElementProps) {
  const value = props.strokeWidth;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 2;
}

function getCustomShapeDataArray(pathData: string) {
  if (!pathData) {
    return [] as ReturnType<typeof KonvaPathShape.parsePathData>;
  }

  try {
    return KonvaPathShape.parsePathData(pathData);
  } catch {
    return [] as ReturnType<typeof KonvaPathShape.parsePathData>;
  }
}

function drawCustomShapeScene(
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

function truncateValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function isKeyboardEditableTarget(target: EventTarget | null) {
  if (target instanceof HTMLElement) {
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target.closest("[contenteditable='true'], input, textarea, select"))
    );
  }

  if (target instanceof Node) {
    return Boolean(
      target.parentElement?.closest("[contenteditable='true'], input, textarea, select")
    );
  }

  return false;
}

function useLoadedImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();

    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
      }
    };
    nextImage.src = src;

    if (nextImage.complete && nextImage.naturalWidth > 0) {
      setImage(nextImage);
    } else {
      setImage(null);
    }

    return () => {
      cancelled = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  return image;
}

export function getEditorImageValidationMessage(file: Pick<File, "name" | "size" | "type">) {
  if (!isSupportedEditorImageFile(file)) {
    return "JPG, PNG, WebP 이미지 파일만 업로드할 수 있습니다.";
  }

  if (file.size > maxAssetUploadSizeBytes) {
    return `이미지 크기는 최대 ${formatBytes(maxAssetUploadSizeBytes)}까지 가능합니다.`;
  }

  if (file.size <= 0) {
    return "빈 파일은 업로드할 수 없습니다.";
  }

  return "";
}

function isSupportedEditorImageFile(file: Pick<File, "name" | "type">) {
  if (editorImageMimeTypes.has(file.type.toLowerCase())) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp";
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function toEditorErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

export async function readImageNaturalSize(file: File) {
  if (typeof window === "undefined") {
    return {
      height: defaultImageInsertFrame.height,
      width: defaultImageInsertFrame.width
    };
  }

  const objectUrl = window.URL.createObjectURL(file);

  try {
    return await new Promise<{ height: number; width: number }>((resolve, reject) => {
      const image = new window.Image();

      image.onload = () => {
        resolve({
          height: image.naturalHeight || defaultImageInsertFrame.height,
          width: image.naturalWidth || defaultImageInsertFrame.width
        });
      };
      image.onerror = () => reject(new Error("이미지 크기를 읽지 못했습니다."));
      image.src = objectUrl;
    });
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}

export function getDefaultImageInsertFrame(
  canvas: DeckCanvas,
  imageSize: { height: number; width: number }
) {
  const safeWidth = Math.max(1, imageSize.width || defaultImageInsertFrame.width);
  const safeHeight = Math.max(1, imageSize.height || defaultImageInsertFrame.height);
  const scale = Math.min(520 / safeWidth, 320 / safeHeight, 1);
  const width = Math.max(140, Math.round(safeWidth * scale));
  const height = Math.max(96, Math.round(safeHeight * scale));

  return {
    height,
    width,
    x: Math.max(40, Math.round((canvas.width - width) / 2)),
    y: Math.max(40, Math.round((canvas.height - height) / 2))
  };
}

function getImageElementLayout(args: {
  fit: ImageElementProps["fit"];
  frameHeight: number;
  frameWidth: number;
  imageHeight: number;
  imageWidth: number;
}) {
  const { fit, frameHeight, frameWidth, imageHeight, imageWidth } = args;

  if (fit === "stretch") {
    return {
      crop: undefined,
      height: frameHeight,
      width: frameWidth,
      x: 0,
      y: 0
    };
  }

  if (fit === "contain") {
    const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;

    return {
      crop: undefined,
      height,
      width,
      x: (frameWidth - width) / 2,
      y: (frameHeight - height) / 2
    };
  }

  const frameRatio = frameWidth / frameHeight;
  const imageRatio = imageWidth / imageHeight;

  if (imageRatio > frameRatio) {
    const cropWidth = imageHeight * frameRatio;

    return {
      crop: {
        height: imageHeight,
        width: cropWidth,
        x: (imageWidth - cropWidth) / 2,
        y: 0
      },
      height: frameHeight,
      width: frameWidth,
      x: 0,
      y: 0
    };
  }

  const cropHeight = imageWidth / frameRatio;

  return {
    crop: {
      height: cropHeight,
      width: imageWidth,
      x: 0,
      y: (imageHeight - cropHeight) / 2
    },
    height: frameHeight,
    width: frameWidth,
    x: 0,
    y: 0
  };
}

export function IdBadge(props: { id: string }) {
  const kind = getIdKind(props.id);
  const displayId = getDisplayIdLabel(props.id);

  return (
    <span className={`id-badge id-badge-${kind}`} title={props.id}>
      {displayId}
    </span>
  );
}

function getIdKind(id: string): string {
  if (id.startsWith("deck_")) {
    return "deck";
  }
  if (id.startsWith("project_")) {
    return "project";
  }
  if (id.startsWith("slide_")) {
    return "slide";
  }
  if (id.startsWith("el_")) {
    return "element";
  }
  if (id.startsWith("anim_")) {
    return "animation";
  }
  if (id.startsWith("kw_")) {
    return "keyword";
  }
  if (id.startsWith("change_")) {
    return "change";
  }
  if (id.startsWith("snapshot_")) {
    return "snapshot";
  }
  return "default";
}

function getDisplayIdLabel(id: string) {
  const kind = getIdKind(id);
  const suffix = getDisplayIdSuffix(id);

  switch (kind) {
    case "project":
      return `project${suffix}`;
    case "deck":
      return `deck${suffix}`;
    case "slide":
      return `slide${suffix}`;
    case "element":
      return `element${suffix}`;
    case "animation":
      return `animation${suffix}`;
    case "keyword":
      return `keyword${suffix}`;
    case "change":
      return `change${suffix}`;
    case "snapshot":
      return `snapshot${suffix}`;
    default:
      return truncateValue(id.replace(/_/g, ""), 18);
  }
}

function getDisplayIdSuffix(id: string) {
  const normalized = id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;

  return truncateValue(normalized.replace(/_/g, ""), 12);
}

const CANVAS_ID_BADGE_FONT_SIZE = 27;
const CANVAS_ID_BADGE_HEIGHT = 60;
const CANVAS_ID_BADGE_GAP = 10;
const CANVAS_ID_BADGE_PADDING = 15;
const CANVAS_ID_STAGE_PADDING = 12;

function getCanvasIdBadgeWidth(label: string) {
  return Math.max(172, label.length * 19 + 36);
}

function getCanvasIdBadgeOffset(args: {
  canvas: DeckCanvas;
  frame: { x: number; y: number; width: number; height: number };
  badgeWidth: number;
  badgeHeight: number;
}) {
  const { canvas, frame, badgeWidth, badgeHeight } = args;
  const hasRoomOnRight = frame.x + badgeWidth <= canvas.width - CANVAS_ID_STAGE_PADDING;
  const hasRoomAbove =
    frame.y >= badgeHeight + CANVAS_ID_BADGE_GAP + CANVAS_ID_STAGE_PADDING;
  const hasRoomBelow =
    frame.y + frame.height + CANVAS_ID_BADGE_GAP + badgeHeight <=
    canvas.height - CANVAS_ID_STAGE_PADDING;

  return {
    x: hasRoomOnRight ? 0 : Math.min(0, frame.width - badgeWidth),
    y: hasRoomAbove || !hasRoomBelow ? -badgeHeight - CANVAS_ID_BADGE_GAP : frame.height + CANVAS_ID_BADGE_GAP
  };
}

export function EditableCanvas(props: {
  customShapeEditElementId: string | null;
  deck: Deck;
  editingElementId: string | null;
  insertTool: InsertTool;
  selectedElementIds: string[];
  showIds: boolean;
  slide: Slide;
  stageScale: number;
  stageRef: MutableRefObject<Konva.Stage | null>;
  visibleElements: DeckElement[];
  onClearSelection: () => void;
  onCommitElementProps: (elementId: string, props: Record<string, unknown>) => void;
  onCommitElementFrame: (
    slideId: string,
    elementId: string,
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    }
  ) => void;
  onCreateElement: (
    draft:
      | { type: "text"; x: number; y: number; width: number; height: number }
      | {
          type: "rect" | "ellipse" | "line";
          x: number;
          y: number;
          width: number;
          height: number;
        }
  ) => void;
  onCreateCustomShape: (nodes: CustomShapeNode[], closed: boolean) => void;
  onCommitCustomShapeGeometry: (
    elementId: string,
    nodes: CustomShapeNode[],
    closed: boolean
  ) => void;
  onDoubleClickElement: (elementId: string) => void;
  onFinishEditing: () => void;
  onOpenElementContextMenu: (args: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) => void;
  onSetCustomShapeEditElementId: (elementId: string | null) => void;
  onSetInsertTool: (tool: InsertTool) => void;
  onSelectElement: (elementId: string, options?: { append?: boolean }) => void;
}) {
  const {
    customShapeEditElementId,
    deck,
    editingElementId,
    insertTool,
    selectedElementIds,
    showIds,
    slide,
    stageScale,
    stageRef,
    visibleElements,
    onClearSelection,
    onCommitElementProps,
    onCommitElementFrame,
    onCreateElement,
    onCreateCustomShape,
    onCommitCustomShapeGeometry,
    onDoubleClickElement,
    onFinishEditing,
    onOpenElementContextMenu,
    onSetCustomShapeEditElementId,
    onSetInsertTool,
    onSelectElement
  } = props;
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingTextBlurActionRef = useRef<"clear-selection" | null>(null);
  const [draftElement, setDraftElement] = useState<{
    end: CanvasPoint;
    start: CanvasPoint;
    type: DrawableInsertTool;
  } | null>(null);
  const [customShapeInsertDraft, setCustomShapeInsertDraft] =
    useState<CustomShapeInsertDraft | null>(null);
  const [customShapeEditDraft, setCustomShapeEditDraft] =
    useState<CustomShapeEditDraft | null>(null);
  const editingCustomShapeElement =
    customShapeEditElementId && customShapeEditElementId !== editingElementId
      ? (visibleElements.find(
          (candidate) =>
            candidate.elementId === customShapeEditElementId &&
            candidate.type === "customShape"
        ) ?? null)
      : null;

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    if (customShapeEditElementId) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const selectedNodes = selectedElementIds
      .map((elementId) => nodeRefs.current[elementId])
      .filter((node): node is Konva.Group => Boolean(node));

    transformer.nodes(selectedNodes);
    transformer.getLayer()?.batchDraw();
  }, [customShapeEditElementId, selectedElementIds, visibleElements]);

  useEffect(() => {
    if (insertTool !== "customShape") {
      setCustomShapeInsertDraft(null);
    }
  }, [insertTool]);

  useEffect(() => {
    pendingTextBlurActionRef.current = null;
  }, [editingElementId]);

  useEffect(() => {
    if (!editingCustomShapeElement) {
      setCustomShapeEditDraft(null);
      return;
    }

    const customShapeProps = editingCustomShapeElement.props as CustomShapeElementProps;

    setCustomShapeEditDraft({
      closed: customShapeProps.closed,
      elementId: editingCustomShapeElement.elementId,
      nodes: getCustomShapeNodes(customShapeProps),
      selectedNodeIndex: null
    });
  }, [editingCustomShapeElement]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isKeyboardEditableTarget(event.target)) {
        return;
      }

      if (insertTool === "customShape") {
        if (event.key === "Escape") {
          event.preventDefault();
          setCustomShapeInsertDraft(null);
          onSetInsertTool("select");
        }

        if (
          (event.key === "Delete" || event.key === "Backspace") &&
          customShapeInsertDraft &&
          customShapeInsertDraft.nodes.length > 0
        ) {
          event.preventDefault();
          setCustomShapeInsertDraft((current) =>
            current
              ? {
                  ...current,
                  activeNodeIndex: null,
                  nodes: current.nodes.slice(0, -1)
                }
              : current
          );
        }

        if (
          event.key === "Enter" &&
          customShapeInsertDraft &&
          customShapeInsertDraft.nodes.length > 1
        ) {
          event.preventDefault();
          onCreateCustomShape(customShapeInsertDraft.nodes, false);
          setCustomShapeInsertDraft(null);
        }

        return;
      }

      if (!customShapeEditDraft || !editingCustomShapeElement) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (customShapeEditDraft.selectedNodeIndex !== null) {
          setCustomShapeEditDraft((current) =>
            current
              ? {
                  ...current,
                  selectedNodeIndex: null
                }
              : current
          );
          return;
        }

        onSetCustomShapeEditElementId(null);
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        customShapeEditDraft.selectedNodeIndex !== null &&
        customShapeEditDraft.nodes.length > 2
      ) {
        event.preventDefault();
        const nextNodes = customShapeEditDraft.nodes.filter(
          (_, index) => index !== customShapeEditDraft.selectedNodeIndex
        );
        const nextClosed =
          customShapeEditDraft.closed && nextNodes.length > 2;
        const nextDraft = {
          ...customShapeEditDraft,
          closed: nextClosed,
          nodes: nextNodes,
          selectedNodeIndex:
            nextNodes.length === 0
              ? null
              : Math.min(
                  customShapeEditDraft.selectedNodeIndex,
                  nextNodes.length - 1
                )
        };

        setCustomShapeEditDraft(nextDraft);
        onCommitCustomShapeGeometry(
          editingCustomShapeElement.elementId,
          convertCustomShapeNodesToAbsolute({
            frame: {
              height: editingCustomShapeElement.height,
              width: editingCustomShapeElement.width,
              x: editingCustomShapeElement.x,
              y: editingCustomShapeElement.y
            },
            nodes: nextDraft.nodes,
            viewBoxHeight: getCustomShapeDimension(
              editingCustomShapeElement.props as CustomShapeElementProps,
              "viewBoxHeight",
              editingCustomShapeElement.height
            ),
            viewBoxWidth: getCustomShapeDimension(
              editingCustomShapeElement.props as CustomShapeElementProps,
              "viewBoxWidth",
              editingCustomShapeElement.width
            )
          }),
          nextDraft.closed
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    customShapeEditDraft,
    customShapeInsertDraft,
    editingCustomShapeElement,
    insertTool,
    onCommitCustomShapeGeometry,
    onCreateCustomShape,
    onSetCustomShapeEditElementId,
    onSetInsertTool
  ]);

  function getCanvasPointerPosition(event: Konva.KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return {
      x: pointer.x / stageScale,
      y: pointer.y / stageScale
    };
  }

  function getCanvasPointFromClientPosition(clientX: number, clientY: number) {
    const stageContainer = stageRef.current?.container();
    const containerRect = stageContainer?.getBoundingClientRect();

    if (!containerRect) {
      return null;
    }

    return {
      x: (clientX - containerRect.left) / stageScale,
      y: (clientY - containerRect.top) / stageScale
    };
  }

  function commitCustomShapeEdit(nextDraft: CustomShapeEditDraft) {
    if (!editingCustomShapeElement) {
      return;
    }

    const customShapeProps = editingCustomShapeElement.props as CustomShapeElementProps;

    onCommitCustomShapeGeometry(
      editingCustomShapeElement.elementId,
      convertCustomShapeNodesToAbsolute({
        frame: {
          height: editingCustomShapeElement.height,
          width: editingCustomShapeElement.width,
          x: editingCustomShapeElement.x,
          y: editingCustomShapeElement.y
        },
        nodes: nextDraft.nodes,
        viewBoxHeight: getCustomShapeDimension(
          customShapeProps,
          "viewBoxHeight",
          editingCustomShapeElement.height
        ),
        viewBoxWidth: getCustomShapeDimension(
          customShapeProps,
          "viewBoxWidth",
          editingCustomShapeElement.width
        )
      }),
      nextDraft.closed
    );
  }

  function handleInlineTextEditingFinish(options?: { clearSelection?: boolean }) {
    const shouldClearSelection =
      options?.clearSelection ||
      pendingTextBlurActionRef.current === "clear-selection";

    pendingTextBlurActionRef.current = null;

    if (shouldClearSelection) {
      onClearSelection();
      return;
    }

    onFinishEditing();
  }

  function handleCanvasBackgroundSelection() {
    if (editingElementId) {
      pendingTextBlurActionRef.current = "clear-selection";
      return;
    }

    const customShapeDraftElementId = customShapeEditDraft?.elementId ?? null;
    const shouldClearCustomShapeNode =
      customShapeEditDraft?.selectedNodeIndex !== null &&
      customShapeDraftElementId !== null &&
      (selectedElementIds.length === 0 ||
        selectedElementIds.includes(customShapeDraftElementId));

    if (shouldClearCustomShapeNode) {
      setCustomShapeEditDraft((current) =>
        current
          ? {
              ...current,
              selectedNodeIndex: null
            }
          : current
      );
      return;
    }

    onClearSelection();
  }

  useEffect(() => {
    const stageContainer = stageRef.current?.container();

    if (!stageContainer) {
      return;
    }

    function handleNativeBackgroundCapture(event: MouseEvent | PointerEvent) {
      if (event.button !== 0 || insertTool !== "select") {
        return;
      }

      if (isKeyboardEditableTarget(event.target)) {
        return;
      }

      const point = getCanvasPointFromClientPosition(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      const isElementHit = visibleElements.some((element) =>
        isCanvasPointInsideElementSelectionArea({
          deck,
          element,
          point,
          slide
        })
      );

      if (!isElementHit) {
        handleCanvasBackgroundSelection();
      }
    }

    stageContainer.addEventListener("pointerdown", handleNativeBackgroundCapture, true);
    stageContainer.addEventListener("mousedown", handleNativeBackgroundCapture, true);
    return () => {
      stageContainer.removeEventListener(
        "pointerdown",
        handleNativeBackgroundCapture,
        true
      );
      stageContainer.removeEventListener(
        "mousedown",
        handleNativeBackgroundCapture,
        true
      );
    };
  }, [deck, insertTool, slide, visibleElements, editingElementId, customShapeEditDraft]);

  return (
    <div className="konva-editor-stage" data-testid="editor-canvas-stage" ref={containerRef}>
      <Stage
        className="konva-canvas-layer"
        height={deck.canvas.height * stageScale}
        ref={stageRef}
        scaleX={stageScale}
        scaleY={stageScale}
        width={deck.canvas.width * stageScale}
        onMouseDown={(event: Konva.KonvaEventObject<MouseEvent>) => {
          if (event.target === event.target.getStage()) {
            const pointer = getCanvasPointerPosition(event);

            if (!pointer) {
              return;
            }

            if (editingElementId) {
              pendingTextBlurActionRef.current = "clear-selection";
              return;
            }

            if (insertTool === "customShape") {
              setCustomShapeInsertDraft((current) => {
                const nextNodes = [...(current?.nodes ?? []), createCustomShapeNode(pointer)];

                return {
                  activeNodeIndex: nextNodes.length - 1,
                  nodes: nextNodes,
                  pointer
                };
              });
              return;
            }

            if (insertTool !== "select") {
              setDraftElement({
                type: insertTool as DrawableInsertTool,
                start: pointer,
                end: pointer
              });
              return;
            }

            if (customShapeEditDraft?.selectedNodeIndex !== null) {
              setCustomShapeEditDraft((current) =>
                current
                  ? {
                      ...current,
                      selectedNodeIndex: null
                    }
                  : current
              );
              return;
            }

            onClearSelection();
          }
        }}
        onMouseMove={(event: Konva.KonvaEventObject<MouseEvent>) => {
          const pointer = getCanvasPointerPosition(event);

          if (insertTool === "customShape") {
            if (!pointer) {
              return;
            }

            setCustomShapeInsertDraft((current) => {
              if (!current) {
                return current;
              }

              if (current.activeNodeIndex === null) {
                return {
                  ...current,
                  pointer
                };
              }

              return {
                ...current,
                nodes: current.nodes.map((node, index) =>
                  index === current.activeNodeIndex
                    ? updateCustomShapeNodeHandle(node, "out", pointer)
                    : node
                ),
                pointer
              };
            });
            return;
          }

          if (!draftElement || !pointer) {
            return;
          }

          setDraftElement((current) =>
            current
              ? {
                  ...current,
                  end: pointer
                }
              : current
          );
        }}
        onMouseUp={() => {
          if (insertTool === "customShape") {
            setCustomShapeInsertDraft((current) =>
              current
                ? {
                    ...current,
                    activeNodeIndex: null
                  }
                : current
            );
            return;
          }

          if (!draftElement) {
            return;
          }
          const rect = normalizeDraftRect(draftElement.start, draftElement.end);
          setDraftElement(null);
          if (!rect) {
            return;
          }
          onCreateElement({
            type: draftElement.type,
            ...rect
          } as
            | { type: "text"; x: number; y: number; width: number; height: number }
            | {
                type: "rect" | "ellipse" | "line";
                x: number;
                y: number;
                width: number;
                height: number;
              });
        }}
      >
        <Layer>
          {visibleElements.map((element) => (
            <EditableElementNode
              key={element.elementId}
              accentColor={slide.style.accentColor ?? deck.theme.accentColor}
              deck={deck}
              disablePointerEvents={insertTool !== "select"}
              element={element}
              isSelected={selectedElementIds.includes(element.elementId)}
              selectedCount={selectedElementIds.length}
              showIds={showIds}
              slide={slide}
              customShapeEditDraft={
                customShapeEditDraft?.elementId === element.elementId
                  ? customShapeEditDraft
                  : null
              }
              onCommitFrame={(frame) =>
                onCommitElementFrame(slide.slideId, element.elementId, frame)
              }
              onChangeCustomShapeEditDraft={setCustomShapeEditDraft}
              onCommitCustomShapeEditDraft={(nextDraft) => {
                setCustomShapeEditDraft(nextDraft);
                commitCustomShapeEdit(nextDraft);
              }}
              onDoubleClick={() => onDoubleClickElement(element.elementId)}
              onMountNode={(node) => {
                nodeRefs.current[element.elementId] = node;
              }}
              onOpenContextMenu={(clientX, clientY) =>
                onOpenElementContextMenu({
                  clientX,
                  clientY,
                  element,
                  slideId: slide.slideId
                })
              }
              onSelect={(append) =>
                onSelectElement(element.elementId, { append })
              }
            />
          ))}
          {customShapeInsertDraft ? (
            <CustomShapeInsertOverlay
              draft={customShapeInsertDraft}
              onClosePath={() => {
                if (customShapeInsertDraft.nodes.length < 3) {
                  return;
                }
                onCreateCustomShape(customShapeInsertDraft.nodes, true);
                setCustomShapeInsertDraft(null);
              }}
            />
          ) : null}
          {draftElement ? (
            <Rect
              dash={[10, 6]}
              fill="rgba(37, 99, 235, 0.08)"
              stroke="#2563eb"
              strokeWidth={2}
              {...(normalizeDraftRect(draftElement.start, draftElement.end) ?? {
                x: draftElement.start.x,
                y: draftElement.start.y,
                width: 1,
                height: 1
              })}
            />
          ) : null}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(_oldBox: TransformerBox, nextBox: TransformerBox) => ({
              ...nextBox,
              width: Math.max(1, nextBox.width),
              height: Math.max(1, nextBox.height)
            })}
            enabledAnchors={[
              "top-left",
              "top-center",
              "top-right",
              "middle-left",
              "middle-right",
              "bottom-left",
              "bottom-center",
              "bottom-right"
            ]}
            ignoreStroke
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          />
        </Layer>
      </Stage>
      {editingElementId ? (
        <InlineTextEditorOverlay
          deck={deck}
          element={
            visibleElements.find((candidate) => candidate.elementId === editingElementId) ??
            null
          }
          slide={slide}
          stageScale={stageScale}
          onCommitProps={onCommitElementProps}
          onFinishEditing={handleInlineTextEditingFinish}
        />
      ) : null}
      {insertTool === "customShape" ? (
        <div className="canvas-mode-hint">
          클릭으로 점 추가, 드래그로 곡선 손잡이 생성, 첫 점 클릭 또는 Enter로
          완료, Esc 취소
        </div>
      ) : customShapeEditDraft ? (
        <div className="canvas-mode-hint">
          점을 드래그해 도형을 다듬고, 더블클릭으로 코너와 곡선을 전환합니다
        </div>
      ) : null}
    </div>
  );
}

function CustomShapeInsertOverlay(props: {
  draft: CustomShapeInsertDraft;
  onClosePath: () => void;
}) {
  const { draft, onClosePath } = props;
  const previewNodes =
    draft.pointer && draft.activeNodeIndex === null && draft.nodes.length > 0
      ? [...draft.nodes, createCustomShapeNode(draft.pointer)]
      : draft.nodes;
  const previewPathData = buildCustomShapePathDataFromNodes(previewNodes, false);
  const previewDataArray = getCustomShapeDataArray(previewPathData);

  return (
    <>
      {previewDataArray.length > 0 ? (
        <Shape
          fillEnabled={false}
          lineCap="round"
          lineJoin="round"
          sceneFunc={(context: Konva.Context, shape: Konva.Shape) =>
            drawCustomShapeScene(context, shape, previewDataArray)
          }
          stroke="#2563eb"
          strokeWidth={2}
        />
      ) : null}
      {draft.nodes.map((node, index) => {
        const isClosableStart = index === 0 && draft.nodes.length > 2;

        return (
          <Group key={`draft-node-${index}`}>
            {typeof node.outX === "number" && typeof node.outY === "number" ? (
              <Line
                dash={[4, 4]}
                points={[node.x, node.y, node.outX, node.outY]}
                stroke="rgba(37, 99, 235, 0.5)"
                strokeWidth={1}
              />
            ) : null}
            {typeof node.outX === "number" && typeof node.outY === "number" ? (
              <Circle
                fill="#dbeafe"
                listening={false}
                radius={4}
                stroke="#2563eb"
                strokeWidth={1.5}
                x={node.outX}
                y={node.outY}
              />
            ) : null}
            <Circle
              fill={isClosableStart ? "#dcfce7" : "#ffffff"}
              radius={isClosableStart ? 7 : 6}
              stroke={isClosableStart ? "#16a34a" : "#2563eb"}
              strokeWidth={2}
              x={node.x}
              y={node.y}
              onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                if (!isClosableStart) {
                  return;
                }
                event.cancelBubble = true;
                onClosePath();
              }}
            />
          </Group>
        );
      })}
    </>
  );
}

function CustomShapeEditOverlay(props: {
  draft: CustomShapeEditDraft;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  onChangeDraft: (draft: CustomShapeEditDraft | null) => void;
  onCommitDraft: (draft: CustomShapeEditDraft) => void;
  viewBoxHeight: number;
  viewBoxWidth: number;
}) {
  const {
    draft,
    frame,
    onChangeDraft,
    onCommitDraft,
    viewBoxHeight,
    viewBoxWidth
  } = props;
  const scaleX = frame.width / Math.max(1, viewBoxWidth);
  const scaleY = frame.height / Math.max(1, viewBoxHeight);
  const handleLength = Math.max(18, Math.min(viewBoxWidth, viewBoxHeight) * 0.08);

  function toDisplayPoint(point: CanvasPoint) {
    return {
      x: point.x * scaleX,
      y: point.y * scaleY
    };
  }

  function toLocalPoint(point: CanvasPoint) {
    return {
      x: point.x / Math.max(scaleX, 0.0001),
      y: point.y / Math.max(scaleY, 0.0001)
    };
  }

  function updateDraft(
    updater: (current: CustomShapeEditDraft) => CustomShapeEditDraft,
    options?: { commit?: boolean }
  ) {
    const nextDraft = updater(draft);
    onChangeDraft(nextDraft);

    if (options?.commit) {
      onCommitDraft(nextDraft);
    }
  }

  return (
    <Group>
      {draft.nodes.map((node, index) => {
        const displayNode = toDisplayPoint({ x: node.x, y: node.y });
        const displayIn =
          typeof node.inX === "number" && typeof node.inY === "number"
            ? toDisplayPoint({ x: node.inX, y: node.inY })
            : null;
        const displayOut =
          typeof node.outX === "number" && typeof node.outY === "number"
            ? toDisplayPoint({ x: node.outX, y: node.outY })
            : null;
        const isSelected = draft.selectedNodeIndex === index;

        return (
          <Group key={`${draft.elementId}-node-${index}`}>
            {displayIn ? (
              <Line
                dash={[4, 4]}
                points={[displayNode.x, displayNode.y, displayIn.x, displayIn.y]}
                stroke="rgba(37, 99, 235, 0.55)"
                strokeWidth={1}
              />
            ) : null}
            {displayOut ? (
              <Line
                dash={[4, 4]}
                points={[displayNode.x, displayNode.y, displayOut.x, displayOut.y]}
                stroke="rgba(37, 99, 235, 0.55)"
                strokeWidth={1}
              />
            ) : null}
            {displayIn ? (
              <Circle
                draggable
                fill="#dbeafe"
                radius={4.5}
                stroke="#2563eb"
                strokeWidth={1.5}
                x={displayIn.x}
                y={displayIn.y}
                onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index
                  }));
                }}
                onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? updateCustomShapeNodeHandle(
                            currentNode,
                            "in",
                            toLocalPoint({
                              x: event.target.x(),
                              y: event.target.y()
                            })
                          )
                        : currentNode
                    )
                  }));
                }}
                onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft(
                    (current) => ({
                      ...current,
                      selectedNodeIndex: index,
                      nodes: current.nodes.map((currentNode, currentIndex) =>
                        currentIndex === index
                          ? updateCustomShapeNodeHandle(
                              currentNode,
                              "in",
                              toLocalPoint({
                                x: event.target.x(),
                                y: event.target.y()
                              })
                            )
                          : currentNode
                      )
                    }),
                    { commit: true }
                  );
                }}
              />
            ) : null}
            {displayOut ? (
              <Circle
                draggable
                fill="#dbeafe"
                radius={4.5}
                stroke="#2563eb"
                strokeWidth={1.5}
                x={displayOut.x}
                y={displayOut.y}
                onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index
                  }));
                }}
                onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? updateCustomShapeNodeHandle(
                            currentNode,
                            "out",
                            toLocalPoint({
                              x: event.target.x(),
                              y: event.target.y()
                            })
                          )
                        : currentNode
                    )
                  }));
                }}
                onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft(
                    (current) => ({
                      ...current,
                      selectedNodeIndex: index,
                      nodes: current.nodes.map((currentNode, currentIndex) =>
                        currentIndex === index
                          ? updateCustomShapeNodeHandle(
                              currentNode,
                              "out",
                              toLocalPoint({
                                x: event.target.x(),
                                y: event.target.y()
                              })
                            )
                          : currentNode
                      )
                    }),
                    { commit: true }
                  );
                }}
              />
            ) : null}
            <Circle
              draggable
              fill={isSelected ? "#2563eb" : "#ffffff"}
              radius={7}
              stroke="#2563eb"
              strokeWidth={2}
              x={displayNode.x}
              y={displayNode.y}
              onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                event.cancelBubble = true;
                updateDraft((current) => ({
                  ...current,
                  selectedNodeIndex: index
                }));
              }}
              onDblClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                event.cancelBubble = true;
                updateDraft(
                  (current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? toggleCustomShapeNodeMode(currentNode, handleLength)
                        : currentNode
                    )
                  }),
                  { commit: true }
                );
              }}
              onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
                event.cancelBubble = true;
                updateDraft((current) => ({
                  ...current,
                  selectedNodeIndex: index,
                  nodes: current.nodes.map((currentNode, currentIndex) =>
                    currentIndex === index
                      ? moveCustomShapeNode(
                          currentNode,
                          toLocalPoint({
                            x: event.target.x(),
                            y: event.target.y()
                          })
                        )
                      : currentNode
                  )
                }));
              }}
              onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
                event.cancelBubble = true;
                updateDraft(
                  (current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? moveCustomShapeNode(
                            currentNode,
                            toLocalPoint({
                              x: event.target.x(),
                              y: event.target.y()
                            })
                          )
                        : currentNode
                    )
                  }),
                  { commit: true }
                );
              }}
            />
          </Group>
        );
      })}
    </Group>
  );
}

function EditableElementNode(props: {
  accentColor: string;
  customShapeEditDraft: CustomShapeEditDraft | null;
  deck: Deck;
  disablePointerEvents: boolean;
  element: DeckElement;
  isSelected: boolean;
  selectedCount: number;
  showIds: boolean;
  slide: Slide;
  onChangeCustomShapeEditDraft: (
    draft: CustomShapeEditDraft | null
  ) => void;
  onDoubleClick: () => void;
  onCommitCustomShapeEditDraft: (draft: CustomShapeEditDraft) => void;
  onCommitFrame: (frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }) => void;
  onMountNode: (node: Konva.Group | null) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onSelect: (append: boolean) => void;
}) {
  const {
    accentColor,
    customShapeEditDraft,
    deck,
    disablePointerEvents,
    element,
    isSelected,
    selectedCount,
    showIds,
    slide,
    onChangeCustomShapeEditDraft,
    onDoubleClick,
    onCommitCustomShapeEditDraft,
    onCommitFrame,
    onMountNode,
    onOpenContextMenu,
    onSelect
  } =
    props;
  const [previewFrame, setPreviewFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  const frame = previewFrame ?? {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation
  };
  const isMultiSelected = isSelected && selectedCount > 1;
  const selectionHitFill = isSelected
    ? isMultiSelected
      ? "rgba(37, 99, 235, 0.16)"
      : "rgba(37, 99, 235, 0.08)"
    : "rgba(15, 23, 42, 0.001)";
  const selectionStroke = isSelected ? "#2563eb" : "transparent";
  const selectionStrokeWidth = isSelected ? (isMultiSelected ? 3 : 2) : 0;
  const selectionDash = isMultiSelected ? [12, 6] : undefined;
  const elementIdLabel = getDisplayIdLabel(element.elementId);
  const canvasIdBadgeWidth = getCanvasIdBadgeWidth(elementIdLabel);
  const canvasIdBadgeOffset = getCanvasIdBadgeOffset({
    badgeHeight: CANVAS_ID_BADGE_HEIGHT,
    badgeWidth: canvasIdBadgeWidth,
    canvas: deck.canvas,
    frame
  });

  useEffect(() => {
    setPreviewFrame(null);
  }, [element.height, element.rotation, element.width, element.x, element.y]);

  function handlePointerSelect(append: boolean) {
    if (!append && element.type === "text" && isSelected && selectedCount === 1) {
      onDoubleClick();
      return;
    }

    onSelect(append);
  }

  return (
    <Group
      draggable={!disablePointerEvents && !element.locked && !customShapeEditDraft}
      listening={!disablePointerEvents}
      opacity={element.visible ? element.opacity : 0}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
      ref={onMountNode}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) =>
        handlePointerSelect(Boolean(event.evt.shiftKey))
      }
      onContextMenu={(event: Konva.KonvaEventObject<PointerEvent>) => {
        const shouldKeepSelection = isSelected && selectedCount > 1;

        if (element.type !== "image" && element.type !== "group" && !shouldKeepSelection) {
          return;
        }

        event.evt.preventDefault();
        if (!shouldKeepSelection) {
          onSelect(false);
        }
        onOpenContextMenu(event.evt.clientX, event.evt.clientY);
      }}
      onDblClick={() => {
        if (element.type === "text") {
          onDoubleClick();
        }
      }}
      onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
        setPreviewFrame(null);
        onCommitFrame({
          x: event.target.x(),
          y: event.target.y(),
          width: frame.width,
          height: frame.height,
          rotation: event.target.rotation()
        });
      }}
      onTap={() => handlePointerSelect(false)}
      onTransform={(event: Konva.KonvaEventObject<Event>) => {
        if (element.type !== "text") {
          return;
        }

        const node = event.target;
        const nextFrame = {
          x: node.x(),
          y: node.y(),
          width: Math.max(1, frame.width * node.scaleX()),
          height: Math.max(1, frame.height * node.scaleY()),
          rotation: node.rotation()
        };

        node.scaleX(1);
        node.scaleY(1);
        setPreviewFrame(nextFrame);
      }}
      onTransformEnd={(event: Konva.KonvaEventObject<Event>) => {
        const node = event.target;
        const nextWidth = Math.max(1, frame.width * node.scaleX());
        const nextHeight = Math.max(1, frame.height * node.scaleY());

        node.scaleX(1);
        node.scaleY(1);

        setPreviewFrame(null);
        onCommitFrame({
          x: node.x(),
          y: node.y(),
          width: nextWidth,
          height: nextHeight,
          rotation: node.rotation()
        });
      }}
    >
      <ElementInteractionHitTargets
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
      <Rect
        cornerRadius={10}
        fill={selectionHitFill}
        dash={selectionDash}
        listening={false}
        stroke={selectionStroke}
        strokeWidth={selectionStrokeWidth}
        width={frame.width}
        height={frame.height}
      />
      <ElementNodeContent
        accentColor={accentColor}
        customShapePreview={customShapeEditDraft}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
      {customShapeEditDraft && element.type === "customShape" ? (
        <CustomShapeEditOverlay
          draft={customShapeEditDraft}
          frame={frame}
          onChangeDraft={onChangeCustomShapeEditDraft}
          onCommitDraft={onCommitCustomShapeEditDraft}
          viewBoxHeight={getCustomShapeDimension(
            element.props as CustomShapeElementProps,
            "viewBoxHeight",
            frame.height
          )}
          viewBoxWidth={getCustomShapeDimension(
            element.props as CustomShapeElementProps,
            "viewBoxWidth",
            frame.width
          )}
        />
      ) : null}
      {showIds ? (
        <Group
          listening={false}
          rotation={-frame.rotation}
          x={canvasIdBadgeOffset.x}
          y={canvasIdBadgeOffset.y}
        >
          <Rect
            cornerRadius={18}
            fill="rgba(255, 255, 255, 0.98)"
            height={CANVAS_ID_BADGE_HEIGHT}
            shadowBlur={14}
            shadowColor="rgba(15, 23, 42, 0.18)"
            shadowOpacity={0.28}
            stroke="#2563eb"
            strokeWidth={1.5}
            width={canvasIdBadgeWidth}
          />
          <Text
            fill="#0f172a"
            fontSize={CANVAS_ID_BADGE_FONT_SIZE}
            fontStyle="bold"
            padding={CANVAS_ID_BADGE_PADDING}
            text={elementIdLabel}
            width={canvasIdBadgeWidth}
          />
        </Group>
      ) : null}
      {element.locked ? (
        <Text
          fill="#b91c1c"
          fontSize={12}
          fontStyle="bold"
          listening={false}
          text="LOCKED"
          x={frame.width - 54}
          y={8}
        />
      ) : null}
    </Group>
  );
}

function ElementInteractionHitTargets(props: {
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { deck, element, frame, slide } = props;
  const hitFill = "rgba(15, 23, 42, 0.001)";

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    return (
      <>
        {childElements.map((childElement) => {
          const childFrame = getGroupedChildPreviewFrame({
            childElement,
            currentGroupFrame: element,
            previewGroupFrame: frame
          });

          return (
            <Group
              key={`group-hit-${childElement.elementId}`}
              rotation={childFrame.rotation}
              x={childFrame.x}
              y={childFrame.y}
            >
              <Rect
                fill={hitFill}
                width={Math.max(1, childFrame.width)}
                height={Math.max(1, childFrame.height)}
              />
            </Group>
          );
        })}
      </>
    );
  }

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame,
      props: element.props as TextElementProps,
      slide,
      theme: deck.theme
    });

    return (
      <Rect
        fill={hitFill}
        x={textLayout.contentX}
        y={textLayout.y}
        width={Math.max(24, textLayout.contentWidth)}
        height={Math.max(1, textLayout.contentHeight)}
      />
    );
  }

  return (
    <Rect
      fill={hitFill}
      width={Math.max(1, frame.width)}
      height={Math.max(1, frame.height)}
    />
  );
}

function ElementNodeContent(props: {
  accentColor: string;
  customShapePreview?: CustomShapeEditDraft | null;
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { accentColor, customShapePreview, deck, element, frame, slide } = props;

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame,
      props: element.props,
      slide,
      theme: deck.theme
    });

    return (
      <Text
        align={element.props.align}
        fill={textLayout.color}
        fontFamily={textLayout.fontFamily}
        fontSize={element.props.fontSize}
        fontStyle={textLayout.fontStyle}
        lineHeight={element.props.lineHeight}
        listening={false}
        padding={0}
        text={element.props.text}
        width={textLayout.width}
        wrap="word"
        x={textLayout.x}
        y={textLayout.y}
      />
    );
  }

  if (element.type === "image") {
    return <ImageElementContent frame={frame} imageProps={element.props} />;
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;
    const values = chart.data.map((datum) =>
      "value" in datum ? Math.abs(datum.value) : Math.abs(datum.y)
    );
    const maxValue = Math.max(1, ...values);
    const barWidth = frame.width / Math.max(chart.data.length, 1);

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          fill="#fff"
          stroke={accentColor}
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#0f172a"
          fontSize={18}
          fontStyle="bold"
          text={chart.title || `${chart.type} chart`}
          x={14}
          y={12}
        />
        {chart.data.slice(0, 6).map((datum, index) => {
          const value = "value" in datum ? Math.abs(datum.value) : Math.abs(datum.y);
          const height = Math.max(
            18,
            ((frame.height - 84) * value) / maxValue
          );

          return (
            <Group key={`${datum.label ?? "item"}-${index}`}>
              <Rect
                fill={chart.style.colors[index] ?? accentColor}
                x={14 + index * barWidth}
                y={frame.height - height - 24}
                width={Math.max(18, barWidth - 16)}
                height={height}
                cornerRadius={8}
              />
            </Group>
          );
        })}
      </Group>
    );
  }

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    if (childElements.length === 0) {
      return (
        <Group listening={false}>
          <Rect
            dash={[10, 6]}
            cornerRadius={18}
            fill="rgba(241, 245, 249, 0.7)"
            stroke="#64748b"
            strokeWidth={2}
            width={frame.width}
            height={frame.height}
          />
          <Text
            fill="#334155"
            fontSize={15}
            text="빈 그룹"
            align="center"
            verticalAlign="middle"
            width={frame.width}
            height={frame.height}
            padding={12}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        {childElements.map((childElement) => {
          const childFrame = getGroupedChildPreviewFrame({
            childElement,
            currentGroupFrame: element,
            previewGroupFrame: frame
          });

          return (
            <Group
              key={childElement.elementId}
              rotation={childFrame.rotation}
              x={childFrame.x}
              y={childFrame.y}
            >
              <ElementNodeContent
                accentColor={accentColor}
                deck={deck}
                element={childElement}
                frame={{
                  x: 0,
                  y: 0,
                  width: childFrame.width,
                  height: childFrame.height,
                  rotation: childFrame.rotation
                }}
                slide={slide}
              />
            </Group>
          );
        })}
      </Group>
    );
  }

  if (element.type === "customShape") {
    const customShapeProps = element.props as CustomShapeElementProps;
    const isClosed = customShapePreview?.closed ?? customShapeProps.closed;
    const pathData =
      customShapePreview?.nodes.length
        ? buildCustomShapePathDataFromNodes(
            customShapePreview.nodes,
            isClosed
          )
        : getCustomShapePathData(customShapeProps);
    const dataArray = getCustomShapeDataArray(pathData);
    const fill = getCustomShapePaint(customShapeProps, "fill", "#f5edff");
    const stroke = getCustomShapePaint(customShapeProps, "stroke", "#9333ea");
    const strokeWidth = getCustomShapeStrokeWidth(customShapeProps);
    const viewBoxWidth = getCustomShapeDimension(
      customShapeProps,
      "viewBoxWidth",
      frame.width
    );
    const viewBoxHeight = getCustomShapeDimension(
      customShapeProps,
      "viewBoxHeight",
      frame.height
    );

    if (dataArray.length > 0) {
      return (
        <Group listening={false}>
          <Rect fill="transparent" width={frame.width} height={frame.height} />
          <Shape
            fill={isClosed ? fill : "transparent"}
            fillEnabled={isClosed}
            lineJoin="round"
            scaleX={frame.width / viewBoxWidth}
            scaleY={frame.height / viewBoxHeight}
            sceneFunc={(context: Konva.Context, shape: Konva.Shape) =>
              drawCustomShapeScene(context, shape, dataArray)
            }
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          dash={[10, 6]}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#6b21a8"
          fontSize={16}
          fontStyle="bold"
          text="SVG PATH"
          width={frame.width}
          height={frame.height}
          padding={14}
        />
      </Group>
    );
  }

  if (element.type === "ellipse") {
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <Circle
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "polygon") {
    const polygonProps = element.props as ShapeElementProps & { sides?: number };
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);
    const sides = polygonProps.sides ?? 3;

    return (
      <Group listening={false}>
        <RegularPolygon
          sides={sides}
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "star") {
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const outerRadius = Math.max(
      1,
      Math.min(frame.width, frame.height) / 2 - strokeWidth / 2
    );

    return (
      <Group listening={false}>
        <KonvaStar
          numPoints={5}
          innerRadius={outerRadius * 0.48}
          outerRadius={outerRadius}
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
        />
      </Group>
    );
  }

  if (element.type === "ring") {
    const strokeWidth = Math.max(6, element.props.strokeWidth * 4 || 12);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <Circle
          fill="transparent"
          stroke={
            element.props.stroke === "transparent"
              ? element.props.fill === "transparent"
                ? "#2563eb"
                : element.props.fill
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "arrow") {
    const stroke = element.props.stroke === "transparent" ? "#2563eb" : element.props.stroke;
    const strokeWidth = Math.max(2, element.props.strokeWidth);
    const pointerLength = Math.max(18, Math.min(42, frame.width * 0.1));
    const pointerWidth = Math.max(14, Math.min(30, frame.height * 1.2));

    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(20, frame.height)} />
        <KonvaArrow
          fill={stroke}
          pointerLength={pointerLength}
          pointerWidth={pointerWidth}
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={stroke}
          strokeWidth={strokeWidth}
          tension={0}
        />
      </Group>
    );
  }

  if (element.type === "line") {
    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(16, frame.height)} />
        <Line
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={
            element.props.stroke === "transparent"
              ? "#2563eb"
              : element.props.stroke
          }
          strokeWidth={Math.max(2, element.props.strokeWidth)}
          tension={0}
        />
      </Group>
    );
  }

  return (
    <Group listening={false}>
      <Rect
        cornerRadius={element.props.borderRadius}
        fill={element.props.fill === "transparent" ? "rgba(49, 87, 245, 0.08)" : element.props.fill}
        stroke={
          element.props.stroke === "transparent"
            ? "rgba(16, 24, 40, 0.18)"
            : element.props.stroke
        }
        strokeWidth={Math.max(1, element.props.strokeWidth)}
        width={frame.width}
        height={frame.height}
      />
    </Group>
  );
}

function ImageElementContent(props: {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  imageProps: ImageElementProps;
}) {
  const { frame, imageProps } = props;
  const image = useLoadedImage(resolveEditorAssetUrl(imageProps.src));
  const layout =
    image && image.naturalWidth > 0 && image.naturalHeight > 0
      ? getImageElementLayout({
          fit: imageProps.fit,
          frameHeight: frame.height,
          frameWidth: frame.width,
          imageHeight: image.naturalHeight,
          imageWidth: image.naturalWidth
        })
      : null;

  return (
    <Group
      listening={false}
      clipX={0}
      clipY={0}
      clipWidth={frame.width}
      clipHeight={frame.height}
    >
      <Rect
        fill="#f8fafc"
        stroke={image ? "#cbd5e1" : "#93c5fd"}
        strokeWidth={1}
        width={frame.width}
        height={frame.height}
      />
      {image && layout ? (
        <KonvaImage
          crop={layout.crop}
          image={image}
          x={layout.x}
          y={layout.y}
          width={layout.width}
          height={layout.height}
        />
      ) : (
        <Text
          align="center"
          fill="#475467"
          fontSize={14}
          fontStyle="bold"
          padding={16}
          text={`IMAGE\n${truncateValue(imageProps.alt || imageProps.src, 44)}`}
          verticalAlign="middle"
          width={frame.width}
          height={frame.height}
        />
      )}
    </Group>
  );
}

function InlineTextEditorOverlay(props: {
  deck: Deck;
  element: DeckElement | null;
  slide: Slide;
  stageScale: number;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: (options?: { clearSelection?: boolean }) => void;
}) {
  const { deck, element, slide, stageScale, onCommitProps, onFinishEditing } = props;

  if (!element || element.type !== "text") {
    return null;
  }

  return (
    <textarea
      autoFocus
      className="inline-text-editor"
      defaultValue={element.props.text}
      style={{
        left: `${element.x * stageScale}px`,
        top: `${element.y * stageScale}px`,
        width: `${element.width * stageScale}px`,
        height: `${element.height * stageScale}px`,
        color: element.props.color ?? slide.style.textColor ?? deck.theme.textColor,
        fontFamily:
          element.props.fontFamily ??
          slide.style.fontFamily ??
          deck.theme.typography.bodyFontFamily,
        fontSize: `${element.props.fontSize * stageScale}px`,
        fontWeight: String(getCssFontWeight(element.props.fontWeight)),
        lineHeight: String(element.props.lineHeight),
        textAlign: element.props.align,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "top left"
      }}
      onBlur={(event) => {
        onCommitProps(element.elementId, { text: event.target.value });
        onFinishEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onFinishEditing();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onCommitProps(element.elementId, { text: event.currentTarget.value });
          onFinishEditing();
        }
      }}
    />
  );
}

function getCssFontWeight(fontWeight: TextElementProps["fontWeight"]) {
  if (typeof fontWeight === "number") {
    return fontWeight;
  }

  switch (fontWeight) {
    case "medium":
      return 500;
    case "semibold":
      return 600;
    case "bold":
      return 700;
    case "normal":
    default:
      return 400;
  }
}

function getKonvaFontStyle(fontWeight: TextElementProps["fontWeight"]) {
  return getCssFontWeight(fontWeight) >= 600 ? "bold" : "normal";
}

function getTextElementLayout(args: {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  props: TextElementProps;
  slide: Slide;
  theme: Deck["theme"];
}) {
  const { frame, props, slide, theme } = args;
  const fontFamily =
    props.fontFamily ?? slide.style.fontFamily ?? theme.typography.bodyFontFamily;
  const color = props.color ?? slide.style.textColor ?? theme.textColor;
  const fontStyle = getKonvaFontStyle(props.fontWeight);
  const width = Math.max(1, frame.width - textElementPadding * 2);
  const availableHeight = Math.max(1, frame.height - textElementPadding * 2);
  const contentMetrics = measureTextContentBounds({
    align: props.align,
    fontFamily,
    fontSize: props.fontSize,
    fontStyle,
    lineHeight: props.lineHeight,
    text: props.text,
    width
  });
  const contentHeight = Math.min(contentMetrics.height, availableHeight);
  const spareHeight = Math.max(0, availableHeight - contentHeight);
  const contentWidth =
    props.align === "justify"
      ? width
      : Math.max(1, Math.min(contentMetrics.width, width));
  let y = textElementPadding;
  let contentX = textElementPadding;

  if (props.verticalAlign === "middle") {
    y += spareHeight / 2;
  } else if (props.verticalAlign === "bottom") {
    y += spareHeight;
  }

  if (props.align === "center") {
    contentX += Math.max(0, (width - contentWidth) / 2);
  } else if (props.align === "right") {
    contentX += Math.max(0, width - contentWidth);
  }

  return {
    color,
    contentHeight,
    contentWidth,
    contentX,
    fontFamily,
    fontStyle,
    width,
    x: textElementPadding,
    y
  };
}

function isCanvasPointInsideElementSelectionArea(args: {
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

function estimateTextContentBounds(args: {
  text: string;
  width: number;
  fontSize: number;
  lineHeight: number;
}) {
  const { text, width, fontSize, lineHeight } = args;
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(fontSize * 0.55, 1)));
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const estimatedLineLengths: number[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      estimatedLineLengths.push(0);
      continue;
    }

    for (let start = 0; start < paragraph.length; start += charsPerLine) {
      estimatedLineLengths.push(
        Math.min(charsPerLine, paragraph.length - start)
      );
    }
  }

  const maxCharsInLine = Math.max(0, ...estimatedLineLengths);
  const lineCount = Math.max(1, estimatedLineLengths.length);

  return {
    height: lineCount * fontSize * lineHeight,
    width: Math.min(width, maxCharsInLine * fontSize * 0.55)
  };
}

function measureTextContentBounds(args: {
  align: TextElementProps["align"];
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold";
  lineHeight: number;
  text: string;
  width: number;
}) {
  if (typeof document === "undefined") {
    return estimateTextContentBounds({
      text: args.text,
      width: args.width,
      fontSize: args.fontSize,
      lineHeight: args.lineHeight
    });
  }

  const measureNode = new KonvaTextShape({
    align: args.align,
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    fontStyle: args.fontStyle,
    lineHeight: args.lineHeight,
    padding: 0,
    text: args.text,
    width: args.width,
    wrap: "word"
  });
  const contentHeight = measureNode.height();
  const contentWidth = Math.min(
    args.width,
    measureNode.textArr.reduce(
      (maxWidth, line) => Math.max(maxWidth, line.width),
      0
    )
  );

  measureNode.destroy();

  return {
    height: contentHeight,
    width: contentWidth
  };
}

function normalizeDraftRect(
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
