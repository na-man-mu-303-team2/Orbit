import {
  maxAssetUploadSizeBytes,
  type CustomShapeNode,
  type Deck,
  type DeckCanvas,
  type DeckElement,
  type Slide
} from "@orbit/shared";
import type Konva from "konva";
import type { Box as TransformerBox } from "konva/lib/shapes/Transformer";
import {
  Layer as KonvaLayer,
  Rect as KonvaRect,
  Stage as KonvaStage,
  Transformer as KonvaTransformer
} from "react-konva";
import type { ComponentType, MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  CustomShapeInsertOverlay
} from "./components/CustomShapeOverlays";
import { EditableElementNode } from "./components/EditableElementNode";
import {
  type CanvasPoint
} from "./custom-shape/geometry";
import {
  useCanvasBackgroundPointerCapture
} from "./hooks/useCanvasBackgroundPointerCapture";
import {
  useCanvasKeyboardShortcuts
} from "./hooks/useCanvasKeyboardShortcuts";
import {
  useCanvasStageInteractions
} from "./hooks/useCanvasStageInteractions";
import {
  useSyncCustomShapeEditDraft
} from "./hooks/useSyncCustomShapeEditDraft";
import { InlineTextEditorOverlay } from "./text/InlineTextEditorOverlay";
import {
  commitCustomShapeEditGeometry,
  normalizeDraftRect
} from "./utils/canvasInteractionUtils";
import {
  ReadOnlySlideCanvas,
  type ElementPresentationState
} from "../../slides/rendering";

export { getRenderableSlideElements } from "../../slides/rendering";

type KonvaComponent = ComponentType<any>;

const Layer = KonvaLayer as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const Stage = KonvaStage as unknown as KonvaComponent;
const Transformer = KonvaTransformer as unknown as KonvaComponent;

const defaultImageInsertFrame = {
  height: 240,
  width: 420,
  x: 260,
  y: 220
};
const editorImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type InsertTool = "select" | "text" | "rect" | "ellipse" | "line" | "customShape";
type DrawableInsertTool = Exclude<InsertTool, "select" | "customShape">;
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
        return (
          <ReadOnlySlideCanvas
            deck={deck}
            key={slide.slideId}
            slide={slide}
            stageRef={(stage: Konva.Stage | null) => {
              if (stage) {
                stageRefs.current.set(slide.slideId, stage);
              } else {
                stageRefs.current.delete(slide.slideId);
              }
            }}
          />
        );
      })}
    </div>
  );
}

export function getNextElementZIndex(elements: DeckElement[]) {
  return (
    elements.reduce(
      (currentMaxZIndex, element) => Math.max(currentMaxZIndex, element.zIndex),
      0
    ) + 1
  );
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

export function EditableCanvas(props: {
  customShapeEditElementId: string | null;
  deck: Deck;
  disableInteractions?: boolean;
  editingElementId: string | null;
  insertTool: InsertTool;
  elementStates?: Record<string, ElementPresentationState> | null;
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
    disableInteractions = false,
    editingElementId,
    elementStates,
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

  useSyncCustomShapeEditDraft({
    editingCustomShapeElement,
    setCustomShapeEditDraft
  });

  function commitCustomShapeEdit(nextDraft: CustomShapeEditDraft) {
    if (!editingCustomShapeElement) {
      return;
    }

    const nextGeometry = commitCustomShapeEditGeometry({
      draft: nextDraft,
      element: editingCustomShapeElement
    });

    onCommitCustomShapeGeometry(
      nextGeometry.elementId,
      nextGeometry.nodes,
      nextGeometry.closed
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

  useCanvasKeyboardShortcuts({
    customShapeEditDraft,
    customShapeInsertDraft,
    editingCustomShapeElement,
    insertTool,
    isKeyboardEditableTarget,
    onCommitCustomShapeGeometry,
    onCreateCustomShape,
    onSetCustomShapeEditElementId,
    onSetInsertTool,
    setCustomShapeEditDraft,
    setCustomShapeInsertDraft
  });

  useCanvasBackgroundPointerCapture({
    customShapeEditDraft,
    deck,
    editingElementId,
    insertTool,
    isKeyboardEditableTarget,
    onClearSelection,
    onMarkTextBlurForClear: () => {
      pendingTextBlurActionRef.current = "clear-selection";
    },
    selectedElementIds,
    setCustomShapeEditDraft,
    slide,
    stageRef,
    stageScale,
    visibleElements
  });

  const stageMouseHandlers = useCanvasStageInteractions({
    customShapeEditDraft,
    draftElement,
    editingElementId,
    insertTool,
    normalizeDraftRect,
    onClearSelection,
    onCreateElement,
    onCreateCustomShape,
    onMarkTextBlurForClear: () => {
      pendingTextBlurActionRef.current = "clear-selection";
    },
    setCustomShapeEditDraft,
    setCustomShapeInsertDraft,
    setDraftElement,
    stageScale
  });

  return (
    <div className="konva-editor-stage" data-testid="editor-canvas-stage" ref={containerRef}>
      <Stage
        className="konva-canvas-layer"
        height={deck.canvas.height * stageScale}
        ref={stageRef}
        scaleX={stageScale}
        scaleY={stageScale}
        width={deck.canvas.width * stageScale}
        onMouseDown={disableInteractions ? undefined : stageMouseHandlers.onMouseDown}
        onMouseMove={disableInteractions ? undefined : stageMouseHandlers.onMouseMove}
        onMouseUp={disableInteractions ? undefined : stageMouseHandlers.onMouseUp}
      >
        <Layer>
          {visibleElements.map((element) => (
            <EditableElementNode
              key={element.elementId}
              accentColor={slide.style.accentColor ?? deck.theme.accentColor}
              deck={deck}
              disablePointerEvents={disableInteractions || insertTool !== "select"}
              element={element}
              isSelected={selectedElementIds.includes(element.elementId)}
              presentationState={elementStates?.[element.elementId]}
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
            enabledAnchors={
              disableInteractions
                ? []
                : [
                    "top-left",
                    "top-center",
                    "top-right",
                    "middle-left",
                    "middle-right",
                    "bottom-left",
                    "bottom-center",
                    "bottom-right"
                  ]
            }
            ignoreStroke
            rotateEnabled={!disableInteractions}
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
