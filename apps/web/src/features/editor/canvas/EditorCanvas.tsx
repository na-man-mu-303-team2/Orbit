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
  Line as KonvaLine,
  Rect as KonvaRect,
  Stage as KonvaStage,
  Transformer as KonvaTransformer
} from "react-konva";
import type { ComponentType, MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  completeImageCropDraft,
  ImageCropOverlay
} from "./image/ImageCropOverlay";
import { InlineTextEditorOverlay } from "./text/InlineTextEditorOverlay";
import { TextContextToolbar } from "./text/TextContextToolbar";
import {
  commitCustomShapeEditGeometry,
  normalizeDraftRect
} from "./utils/canvasInteractionUtils";
import type { CanvasSelectionModifiers } from "./utils/canvasSelection";
import {
  canvasResizeBoxToTransformerBox,
  isCanvasResizeHandle,
  snapCanvasResizeBox,
  transformerBoxToCanvasResizeBox,
  type CanvasSnapGuide
} from "./utils/canvasSnapping";
import {
  getHighlightOverlayElements,
  HighlightOverlay,
  ReadOnlySlideCanvas,
  type ElementPresentationState
} from "../../slides/rendering";
import { isEditorKeyboardCommandSuppressedTarget } from "../shell/editorKeyboardCommands";
import { useEditorShellUiStore } from "../shell/editorShellUiStore";

export { getRenderableSlideElements } from "../../slides/rendering";

type KonvaComponent = ComponentType<any>;

const Layer = KonvaLayer as unknown as KonvaComponent;
const Line = KonvaLine as unknown as KonvaComponent;
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

function HiddenSlideRenderStage(props: {
  deck: Deck;
  slide: Slide;
  stageRefs: MutableRefObject<Map<string, Konva.Stage>>;
}) {
  const { deck, slide, stageRefs } = props;
  const registeredStageRef = useRef<Konva.Stage | null>(null);
  const setStageRef = useCallback(
    (stage: Konva.Stage | null) => {
      const registeredStage = registeredStageRef.current;

      if (stage) {
        registeredStageRef.current = stage;
        stageRefs.current.set(slide.slideId, stage);
        return;
      }

      if (
        registeredStage &&
        stageRefs.current.get(slide.slideId) === registeredStage
      ) {
        stageRefs.current.delete(slide.slideId);
      }

      registeredStageRef.current = null;
    },
    [slide.slideId, stageRefs]
  );

  return (
    <ReadOnlySlideCanvas deck={deck} slide={slide} stageRef={setStageRef} />
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
        return (
          <HiddenSlideRenderStage
            deck={deck}
            key={slide.slideId}
            slide={slide}
            stageRefs={stageRefs}
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
  imageCropElementId?: string | null;
  insertTool: InsertTool;
  elementStates?: Record<string, ElementPresentationState> | null;
  selectedElementIds: string[];
  showIds: boolean;
  slide: Slide;
  stageScale: number;
  stageRef: MutableRefObject<Konva.Stage | null>;
  validationHighlightElementIds?: string[];
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
  onFinishImageCrop?: () => void;
  onOpenElementContextMenu: (args: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) => void;
  onSetCustomShapeEditElementId: (elementId: string | null) => void;
  onSetInsertTool: (tool: InsertTool) => void;
  onSelectElement: (
    elementId: string,
    modifiers?: CanvasSelectionModifiers
  ) => void;
  onSelectElements?: (elementIds: string[]) => void;
}) {
  const {
    customShapeEditElementId,
    deck,
    disableInteractions = false,
    editingElementId,
    imageCropElementId = null,
    elementStates,
    insertTool,
    selectedElementIds,
    showIds,
    slide,
    stageScale,
    stageRef,
    validationHighlightElementIds = [],
    visibleElements,
    onClearSelection,
    onCommitElementProps,
    onCommitElementFrame,
    onCreateElement,
    onCreateCustomShape,
    onCommitCustomShapeGeometry,
    onDoubleClickElement,
    onFinishEditing,
    onFinishImageCrop = () => {},
    onOpenElementContextMenu,
    onSetCustomShapeEditElementId,
    onSetInsertTool,
    onSelectElement,
    onSelectElements = onClearSelection
  } = props;
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const altSnapBypassRef = useRef(false);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(
    null
  );
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
  const [dragGuides, setDragGuides] = useState<CanvasSnapGuide[]>([]);
  const isCanvasSnappingEnabled = useEditorShellUiStore(
    (state) => state.isCanvasSnappingEnabled
  );
  const [activeTextRange, setActiveTextRange] = useState<{
    elementId: string;
    end: number;
    start: number;
  } | null>(null);
  const selectedTextElement =
    selectedElementIds.length === 1
      ? (visibleElements.find(
          (candidate): candidate is Extract<DeckElement, { type: "text" }> =>
            candidate.elementId === selectedElementIds[0] &&
            candidate.type === "text"
        ) ?? null)
      : null;
  const imageCropElement =
    !disableInteractions &&
    imageCropElementId &&
    selectedElementIds.length === 1 &&
    selectedElementIds[0] === imageCropElementId
      ? (visibleElements.find(
          (candidate): candidate is Extract<DeckElement, { type: "image" }> =>
            candidate.elementId === imageCropElementId &&
            candidate.type === "image"
        ) ?? null)
      : null;
  const canvasInteractionDisabled =
    disableInteractions || Boolean(imageCropElement);
  const editingCustomShapeElement =
    customShapeEditElementId && customShapeEditElementId !== editingElementId
      ? (visibleElements.find(
          (candidate) =>
            candidate.elementId === customShapeEditElementId &&
            candidate.type === "customShape"
        ) ?? null)
      : null;
  const validationHighlightElementIdSet = new Set(validationHighlightElementIds);
  const validationHighlightElements = getHighlightOverlayElements({
    activeHighlightElementIds: validationHighlightElementIdSet,
    deck,
    elementStates: elementStates ?? undefined,
    slide
  });

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    if (canvasInteractionDisabled || customShapeEditElementId) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const selectedNodes = selectedElementIds
      .map((elementId) => nodeRefs.current[elementId])
      .filter((node): node is Konva.Group => Boolean(node));

    transformer.nodes(selectedNodes);
    transformer.getLayer()?.batchDraw();
  }, [canvasInteractionDisabled, customShapeEditElementId, selectedElementIds, visibleElements]);

  useEffect(() => {
    if (insertTool !== "customShape") {
      setCustomShapeInsertDraft(null);
    }
  }, [insertTool]);

  useEffect(() => {
    pendingTextBlurActionRef.current = null;
    setActiveTextRange(null);
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

  function handleTextSelection(event: React.SyntheticEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || !editingElementId) return;
    setActiveTextRange({
      elementId: editingElementId,
      end: target.selectionEnd,
      start: target.selectionStart
    });
  }

  useCanvasKeyboardShortcuts({
    enabled: !canvasInteractionDisabled,
    customShapeEditDraft,
    customShapeInsertDraft,
    editingCustomShapeElement,
    insertTool,
    isKeyboardEditableTarget: isEditorKeyboardCommandSuppressedTarget,
    onCommitCustomShapeGeometry,
    onCreateCustomShape,
    onSetCustomShapeEditElementId,
    onSetInsertTool,
    setCustomShapeEditDraft,
    setCustomShapeInsertDraft
  });

  const stageMouseHandlers = useCanvasStageInteractions({
    customShapeEditDraft,
    draftElement,
    editingElementId,
    insertTool,
    isMarqueeInteractionBlocked: Boolean(
      customShapeEditElementId || imageCropElement
    ),
    marqueeElements: visibleElements,
    normalizeDraftRect,
    onCommitSelection: onSelectElements,
    onCreateElement,
    onCreateCustomShape,
    onMarkTextBlurForClear: () => {
      pendingTextBlurActionRef.current = "clear-selection";
    },
    selectedElementIds,
    setCustomShapeEditDraft,
    setCustomShapeInsertDraft,
    setDraftElement,
    stageScale
  });

  useCanvasBackgroundPointerCapture({
    enabled: !canvasInteractionDisabled,
    onCancelMarquee: stageMouseHandlers.cancelMarquee,
    stageRef
  });

  useEffect(() => {
    if (canvasInteractionDisabled) {
      stageMouseHandlers.cancelMarquee();
      setDragGuides([]);
    }
  }, [canvasInteractionDisabled, stageMouseHandlers.cancelMarquee]);

  useEffect(() => {
    setDragGuides([]);
  }, [insertTool, slide.slideId]);

  useEffect(() => {
    if (!isCanvasSnappingEnabled) {
      setDragGuides([]);
    }
  }, [isCanvasSnappingEnabled]);

  useEffect(() => {
    function handleAltKeyDown(event: KeyboardEvent) {
      if (event.key !== "Alt") {
        return;
      }

      altSnapBypassRef.current = true;
      setDragGuides([]);
    }

    function handleAltKeyUp(event: KeyboardEvent) {
      if (event.key === "Alt") {
        altSnapBypassRef.current = false;
      }
    }

    function handleWindowBlur() {
      altSnapBypassRef.current = false;
      setDragGuides([]);
    }

    window.addEventListener("keydown", handleAltKeyDown);
    window.addEventListener("keyup", handleAltKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleAltKeyDown);
      window.removeEventListener("keyup", handleAltKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  function handleTransformerBoundBox(
    _oldBox: TransformerBox,
    nextBox: TransformerBox
  ): TransformerBox {
    const activeHandle = transformerRef.current?.getActiveAnchor() ?? null;
    const safeStageScale = stageScale > 0 ? stageScale : 1;

    if (!isCanvasResizeHandle(activeHandle)) {
      setDragGuides([]);
      return {
        ...nextBox,
        height: Math.max(safeStageScale, nextBox.height),
        width: Math.max(safeStageScale, nextBox.width)
      };
    }

    const result = snapCanvasResizeBox({
      activeHandle,
      box: transformerBoxToCanvasResizeBox(nextBox, safeStageScale),
      canvas: deck.canvas,
      elements: visibleElements,
      movingElementId: selectedElementIds[0] ?? "",
      selectedElementIds,
      snappingEnabled:
        selectedElementIds.length === 1 &&
        isCanvasSnappingEnabled &&
        !altSnapBypassRef.current,
      stageScale: safeStageScale
    });

    setDragGuides(result.guides);

    return canvasResizeBoxToTransformerBox(result.box, safeStageScale);
  }

  return (
    <div
      className="konva-editor-stage"
      data-testid="editor-canvas-stage"
      ref={setContainerElement}
      onSelectCapture={handleTextSelection}
    >
      <Stage
        className="konva-canvas-layer"
        height={deck.canvas.height * stageScale}
        ref={stageRef}
        scaleX={stageScale}
        scaleY={stageScale}
        width={deck.canvas.width * stageScale}
        onPointerDown={
          canvasInteractionDisabled ? undefined : stageMouseHandlers.onPointerDown
        }
        onPointerMove={
          canvasInteractionDisabled ? undefined : stageMouseHandlers.onPointerMove
        }
        onPointerUp={
          canvasInteractionDisabled ? undefined : stageMouseHandlers.onPointerUp
        }
      >
        <Layer>
          {visibleElements.map((element) => (
            <EditableElementNode
              key={element.elementId}
              accentColor={slide.style.accentColor ?? deck.theme.accentColor}
              deck={deck}
              disablePointerEvents={
                canvasInteractionDisabled || insertTool !== "select"
              }
              element={element}
              isSelected={selectedElementIds.includes(element.elementId)}
              presentationState={elementStates?.[element.elementId]}
              selectedElementIds={selectedElementIds}
              selectedCount={selectedElementIds.length}
              showIds={showIds}
              slide={slide}
              snapElements={visibleElements}
              snappingEnabled={isCanvasSnappingEnabled}
              stageScale={stageScale}
              customShapeEditDraft={
                customShapeEditDraft?.elementId === element.elementId
                  ? customShapeEditDraft
                  : null
              }
              onChangeDragGuides={setDragGuides}
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
              onSelect={(modifiers) =>
                onSelectElement(element.elementId, modifiers)
              }
            />
          ))}
          {validationHighlightElements.map((element) => (
              <HighlightOverlay
                element={element}
                key={`validation-highlight-${element.elementId}`}
                state={elementStates?.[element.elementId]}
              />
            ))}
          {!disableInteractions && customShapeInsertDraft ? (
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
          {!disableInteractions && draftElement ? (
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
          {!disableInteractions && stageMouseHandlers.marqueeRect ? (
            <Rect
              dash={[10, 6]}
              fill="rgba(37, 99, 235, 0.08)"
              listening={false}
              stroke="#2563eb"
              strokeScaleEnabled={false}
              strokeWidth={2}
              {...stageMouseHandlers.marqueeRect}
            />
          ) : null}
          {!disableInteractions
            ? dragGuides.map((guide) => (
                <Line
                  key={`${guide.axis}-${guide.position}`}
                  listening={false}
                  points={
                    guide.axis === "x"
                      ? [guide.position, 0, guide.position, deck.canvas.height]
                      : [0, guide.position, deck.canvas.width, guide.position]
                  }
                  stroke="#ec4899"
                  strokeScaleEnabled={false}
                  strokeWidth={1}
                />
              ))
            : null}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={handleTransformerBoundBox}
            enabledAnchors={
              canvasInteractionDisabled
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
            onTransformEnd={() => setDragGuides([])}
            onTransformStart={(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
              altSnapBypassRef.current =
                "altKey" in event.evt && Boolean(event.evt.altKey);
              setDragGuides([]);
            }}
            rotateEnabled={!canvasInteractionDisabled}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          />
        </Layer>
      </Stage>
      {imageCropElement ? (
        <ImageCropOverlay
          frame={{
            x: imageCropElement.x,
            y: imageCropElement.y,
            width: imageCropElement.width,
            height: imageCropElement.height,
            rotation: imageCropElement.rotation
          }}
          imageProps={imageCropElement.props}
          stageScale={stageScale}
          onApply={(crop) => {
            completeImageCropDraft({
              action: "apply",
              crop,
              onCommit: (nextProps) =>
                onCommitElementProps(imageCropElement.elementId, nextProps)
            });
            onFinishImageCrop();
          }}
          onCancel={onFinishImageCrop}
          onReset={() => {
            completeImageCropDraft({
              action: "reset",
              crop: imageCropElement.props.crop ?? {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0
              },
              onCommit: (nextProps) =>
                onCommitElementProps(imageCropElement.elementId, nextProps)
            });
            onFinishImageCrop();
          }}
        />
      ) : null}
      {selectedTextElement &&
      !imageCropElement &&
      insertTool === "select" &&
      !customShapeEditElementId ? (
        <TextContextToolbar
          deck={deck}
          element={selectedTextElement}
          range={
            activeTextRange?.elementId === selectedTextElement.elementId
              ? activeTextRange
              : null
          }
          readOnly={disableInteractions}
          slide={slide}
          stageElement={containerElement}
          stageScale={stageScale}
          onCommitProps={onCommitElementProps}
        />
      ) : null}
      {!canvasInteractionDisabled && editingElementId ? (
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
      {!disableInteractions && insertTool === "customShape" ? (
        <div className="canvas-mode-hint">
          클릭으로 점 추가, 드래그로 곡선 손잡이 생성, 첫 점 클릭 또는 Enter로
          완료, Esc 취소
        </div>
      ) : !disableInteractions && customShapeEditDraft ? (
        <div className="canvas-mode-hint">
          점을 드래그해 도형을 다듬고, 더블클릭으로 코너와 곡선을 전환합니다
        </div>
      ) : null}
    </div>
  );
}
