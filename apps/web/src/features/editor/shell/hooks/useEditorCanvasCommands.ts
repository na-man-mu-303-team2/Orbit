import {
  createAddElementPatch,
  createAddSlidePatch,
  createElementId,
  createGroupedElementFramePatch,
  createSlideId,
  getGroupChildElements,
  getGroupedSelectionBounds
} from "../../../../../../../packages/editor-core/src/index";
import {
  createElementFramePatch,
  normalizeElementFrameDraft
} from "../../../../../../../packages/editor-core/src/patches/elementFrame";
import type {
  CustomShapeNode,
  Deck,
  DeckElement,
  DeckElementRole,
  DeckPatch,
  GroupElementProps,
  ShapeElementProps,
  Slide
} from "@orbit/shared";
import { useRef, type MutableRefObject } from "react";

import { normalizeCustomShapeAbsoluteGeometry } from "../../canvas/custom-shape/geometry";
import type { ShapeInsertType } from "../components/EditorContextMenus";
import type {
  EditorShellUiUpdater,
  ElementContextMenuState,
  InsertTool
} from "../editorShellUiStore";
import { getContextMenuPosition, getNextElementZIndex } from "../utils/editorLayout";
import type { PatchProducer } from "./useEditorPersistenceState";

export type ElementFrameChange = {
  role?: DeckElementRole | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  visible?: boolean;
};

type ClipboardState = { element: DeckElement; pasteCount: number };
type CommitPatch = (patch: DeckPatch | PatchProducer, baseDeck?: Deck) => boolean;

export function useEditorCanvasCommands(args: {
  commitPatch: CommitPatch;
  confirmDiscardSpeakerNotesDraft: () => boolean;
  currentSlide: Slide | null;
  deck: Deck;
  resetSpeakerNotesEditState: (notes: string) => void;
  selectedElement: DeckElement | null;
  selectedElementIds: string[];
  selectedElements: DeckElement[];
  setCurrentSlideIndex: (index: number) => void;
  setCustomShapeEditElementId: (updater: EditorShellUiUpdater<string | null>) => void;
  setEditingElementId: (updater: EditorShellUiUpdater<string | null>) => void;
  setElementContextMenu: (
    updater: EditorShellUiUpdater<ElementContextMenuState | null>
  ) => void;
  setInsertTool: (updater: EditorShellUiUpdater<InsertTool>) => void;
  setIsShapeMenuOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setLastPatchLabel: (label: string) => void;
  setSelectedElementIds: (updater: EditorShellUiUpdater<string[]>) => void;
  workingDeckRef: MutableRefObject<Deck>;
}) {
  const copiedElementRef = useRef<ClipboardState | null>(null);

  function addTextElement() {
    if (!args.currentSlide) return;
    const elementId = createElementId(args.deck);
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
      elementId,
      type: "text",
      role: "body",
      x: 180,
      y: 180,
      width: 360,
      height: 96,
      rotation: 0,
      opacity: 1,
      zIndex: getNextElementZIndex(args.currentSlide!.elements),
      locked: false,
      visible: true,
      props: {
        text: "새 텍스트",
        fontFamily: args.currentSlide!.style.fontFamily ?? args.deck.theme.typography.bodyFontFamily,
        fontSize: args.deck.theme.typography.bodySize,
        fontWeight: "normal",
        color: args.currentSlide!.style.textColor ?? args.deck.theme.textColor,
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    }));
    args.setSelectedElementIds([elementId]);
    args.setEditingElementId(elementId);
    args.setInsertTool("select");
  }

  function addChartElement() {
    if (!args.currentSlide) return;
    const elementId = createElementId(args.deck);
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
      elementId,
      type: "chart",
      role: "chart",
      x: 240,
      y: 180,
      width: 520,
      height: 280,
      rotation: 0,
      opacity: 1,
      zIndex: getNextElementZIndex(args.currentSlide!.elements),
      locked: false,
      visible: true,
      props: {
        type: "bar",
        title: "새 차트",
        data: [{ label: "A", value: 48 }, { label: "B", value: 72 }, { label: "C", value: 56 }],
        style: {
          colors: ["#2563eb", "#0ea5e9", "#7c3aed"],
          backgroundColor: "#ffffff",
          textColor: "#111827",
          fontFamily: args.deck.theme.typography.bodyFontFamily,
          titleFontSize: 20,
          axisLabelFontSize: 12,
          legendFontSize: 12,
          dataLabelFontSize: 12,
          showLegend: true,
          legendPosition: "bottom",
          showDataLabels: true,
          showGrid: true,
          xAxisTitle: "",
          yAxisTitle: "",
          unit: ""
        }
      }
    }));
    args.setSelectedElementIds([elementId]);
  }

  function insertShapeElement(shapeType: ShapeInsertType) {
    if (!args.currentSlide) return;
    if (shapeType === "customShape") {
      args.setEditingElementId(null);
      args.setCustomShapeEditElementId(null);
      args.setSelectedElementIds([]);
      args.setInsertTool("customShape");
      args.setIsShapeMenuOpen(false);
      return;
    }
    const elementId = createElementId(args.deck);
    const frames: Record<ShapeInsertType, { x: number; y: number; width: number; height: number }> = {
      rect: { x: 260, y: 220, width: 280, height: 160 },
      ellipse: { x: 260, y: 220, width: 180, height: 180 },
      line: { x: 240, y: 280, width: 320, height: 12 },
      arrow: { x: 240, y: 280, width: 360, height: 28 },
      triangle: { x: 260, y: 220, width: 180, height: 180 },
      polygon: { x: 260, y: 220, width: 180, height: 180 },
      star: { x: 260, y: 220, width: 180, height: 180 },
      customShape: { x: 260, y: 220, width: 220, height: 160 }
    };
    const frame = frames[shapeType];
    const nextElement: DeckElement = {
      elementId,
      type: shapeType === "triangle" ? "polygon" : shapeType,
      role: shapeType === "line" || shapeType === "arrow" ? "decoration" : "highlight",
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rotation: 0,
      opacity: 1,
      zIndex: getNextElementZIndex(args.currentSlide.elements),
      locked: false,
      visible: true,
      props: {
        fill: shapeType === "line" || shapeType === "arrow" ? "transparent" : "#dbeafe",
        stroke: "#2563eb",
        strokeWidth: 3,
        borderRadius: 18,
        ...(shapeType === "triangle" ? { sides: 3 } : shapeType === "polygon" ? { sides: 6 } : {})
      } as ShapeElementProps
    };
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, nextElement));
    args.setSelectedElementIds([elementId]);
    args.setInsertTool("select");
    args.setIsShapeMenuOpen(false);
  }

  function addSlide() {
    if (!args.confirmDiscardSpeakerNotesDraft()) return;
    let nextSlideIndex = args.workingDeckRef.current.slides.length;
    args.resetSpeakerNotesEditState("");
    const committed = args.commitPatch((currentDeck) => {
      const slideId = createSlideId(currentDeck);
      const nextOrder = currentDeck.slides.length + 1;
      nextSlideIndex = currentDeck.slides.length;
      return createAddSlidePatch(currentDeck, {
        slideId,
        order: nextOrder,
        title: `Slide ${nextOrder}`,
        thumbnailUrl: "",
        style: {
          layout: "title-content",
          backgroundColor: currentDeck.theme.backgroundColor,
          textColor: currentDeck.theme.textColor,
          accentColor: currentDeck.theme.accentColor
        },
        speakerNotes: "",
        keywords: [],
        semanticCues: [],
        elements: [{
          elementId: createElementId(currentDeck),
          type: "text",
          role: "title",
          x: 120,
          y: 96,
          width: 720,
          height: 96,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          locked: false,
          visible: true,
          props: {
            text: `Slide ${nextOrder}`,
            fontFamily: currentDeck.theme.typography.headingFontFamily,
            fontSize: currentDeck.theme.typography.titleSize,
            fontWeight: "bold",
            color: currentDeck.theme.textColor,
            align: "left",
            verticalAlign: "top",
            lineHeight: 1.1
          }
        }],
        animations: [],
        actions: []
      });
    });
    if (!committed) return;
    args.setCurrentSlideIndex(nextSlideIndex);
    args.setSelectedElementIds([]);
  }

  function deleteSelectedElement() {
    if (!args.currentSlide || args.selectedElementIds.length === 0) return;
    args.setElementContextMenu(null);
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: args.selectedElementIds.map((elementId) => ({
        type: "delete_element" as const,
        slideId: args.currentSlide!.slideId,
        elementId
      }))
    }));
    args.setSelectedElementIds([]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
  }

  function cloneElement(sourceElement: DeckElement, offsetMultiplier = 1) {
    if (!args.currentSlide) return null;
    const nextElementId = createElementId(args.deck);
    const nextZIndex = args.currentSlide.elements.reduce(
      (highest, element) => Math.max(highest, element.zIndex),
      0
    ) + 1;
    const offset = 24 * offsetMultiplier;
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
      ...structuredClone(sourceElement),
      elementId: nextElementId,
      x: sourceElement.x + offset,
      y: sourceElement.y + offset,
      zIndex: nextZIndex
    }));
    args.setSelectedElementIds([nextElementId]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    return nextElementId;
  }

  function duplicateSelectedElement() {
    if (!args.currentSlide || !args.selectedElement) return;
    args.setElementContextMenu(null);
    cloneElement(args.selectedElement);
  }

  function copySelectedElement() {
    if (!args.selectedElement) return;
    args.setElementContextMenu(null);
    copiedElementRef.current = { element: structuredClone(args.selectedElement), pasteCount: 0 };
  }

  function pasteCopiedElement() {
    if (!args.currentSlide || !copiedElementRef.current) return;
    args.setElementContextMenu(null);
    const { element, pasteCount } = copiedElementRef.current;
    const nextPasteCount = pasteCount + 1;
    cloneElement(element, nextPasteCount);
    copiedElementRef.current = { element, pasteCount: nextPasteCount };
  }

  function createDrawnElement(draft:
    | { type: "text"; x: number; y: number; width: number; height: number }
    | { type: "rect" | "ellipse" | "line"; x: number; y: number; width: number; height: number }
  ) {
    if (!args.currentSlide) return;
    const elementId = createElementId(args.deck);
    if (draft.type === "text") {
      args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
        elementId,
        type: "text",
        role: "body",
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        rotation: 0,
        opacity: 1,
        zIndex: getNextElementZIndex(args.currentSlide!.elements),
        locked: false,
        visible: true,
        props: {
          text: "텍스트 입력",
          fontFamily: args.currentSlide!.style.fontFamily ?? args.deck.theme.typography.bodyFontFamily,
          fontSize: args.deck.theme.typography.bodySize,
          fontWeight: "normal",
          color: args.currentSlide!.style.textColor ?? args.deck.theme.textColor,
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      }));
      args.setEditingElementId(elementId);
    } else {
      args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
        elementId,
        type: draft.type,
        role: draft.type === "line" ? "decoration" : "highlight",
        x: draft.x,
        y: draft.y,
        width: Math.max(8, draft.width),
        height: Math.max(8, draft.height),
        rotation: 0,
        opacity: 1,
        zIndex: getNextElementZIndex(args.currentSlide!.elements),
        locked: false,
        visible: true,
        props: {
          fill: draft.type === "line" ? "transparent" : "#dbeafe",
          stroke: "#2563eb",
          strokeWidth: 3,
          borderRadius: 18
        }
      }));
    }
    args.setSelectedElementIds([elementId]);
    args.setInsertTool("select");
  }

  function createCustomShape(nodes: CustomShapeNode[], closed: boolean) {
    if (!args.currentSlide || nodes.length < 2) {
      args.setInsertTool("select");
      return;
    }
    const elementId = createElementId(args.deck);
    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
      elementId,
      type: "customShape",
      role: "highlight",
      x: geometry.frame.x,
      y: geometry.frame.y,
      width: geometry.frame.width,
      height: geometry.frame.height,
      rotation: 0,
      opacity: 1,
      zIndex: getNextElementZIndex(args.currentSlide!.elements),
      locked: false,
      visible: true,
      props: {
        closed: geometry.props.closed,
        fill: "#f5edff",
        nodes: geometry.props.nodes,
        stroke: "#9333ea",
        strokeWidth: 2,
        viewBoxWidth: geometry.props.viewBoxWidth,
        viewBoxHeight: geometry.props.viewBoxHeight,
        pathData: geometry.props.pathData
      }
    }));
    args.setSelectedElementIds([elementId]);
    args.setCustomShapeEditElementId(elementId);
    args.setInsertTool("select");
  }

  function commitCustomShapeGeometry(
    slideId: string,
    elementId: string,
    nodes: CustomShapeNode[],
    closed: boolean
  ) {
    const slide = args.deck.slides.find((candidate) => candidate.slideId === slideId);
    const element = slide?.elements.find((candidate) => candidate.elementId === elementId);
    if (!slide || !element || element.type !== "customShape" || nodes.length < 2) return;
    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [
        {
          type: "update_element_frame",
          slideId,
          elementId,
          frame: normalizeElementFrameDraft(currentDeck.canvas, element, geometry.frame)
        },
        {
          type: "update_element_props",
          slideId,
          elementId,
          props: {
            closed: geometry.props.closed,
            nodes: geometry.props.nodes,
            pathData: geometry.props.pathData,
            viewBoxWidth: geometry.props.viewBoxWidth,
            viewBoxHeight: geometry.props.viewBoxHeight
          }
        }
      ]
    }));
  }

  function changeElementFrame(slideId: string, elementId: string, frame: ElementFrameChange) {
    const slide = args.deck.slides.find((candidate) => candidate.slideId === slideId);
    const element = slide?.elements.find((candidate) => candidate.elementId === elementId);
    if (!slide || !element) return;
    try {
      args.commitPatch((currentDeck) => element.type === "group"
        ? createGroupedElementFramePatch(currentDeck, slideId, elementId, frame)
        : createElementFramePatch(currentDeck, slideId, elementId, frame)
      );
    } catch (error) {
      args.setLastPatchLabel(error instanceof Error ? `실패 · ${error.message}` : "실패 · unknown");
    }
  }

  function createGroupFromSelection() {
    if (!args.currentSlide || args.selectedElements.length < 2) return;
    const elementId = createElementId(args.deck);
    const bounds = getGroupedSelectionBounds(args.selectedElements);
    const highestZIndex = args.selectedElements.reduce(
      (highest, element) => Math.max(highest, element.zIndex),
      0
    );
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
      elementId,
      type: "group",
      role: "decoration",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: highestZIndex + 1,
      locked: false,
      visible: true,
      props: { childElementIds: args.selectedElements.map((element) => element.elementId) }
    }));
    args.setElementContextMenu(null);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    args.setSelectedElementIds([elementId]);
  }

  function ungroupElement(slideId: string, elementId: string) {
    const slide = args.deck.slides.find((candidate) => candidate.slideId === slideId);
    const groupElement = slide?.elements.find((candidate) => candidate.elementId === elementId);
    if (!slide || !groupElement || groupElement.type !== "group") return;
    const groupProps = groupElement.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [{ type: "delete_element", slideId, elementId }]
    }));
    args.setElementContextMenu(null);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    args.setSelectedElementIds(childElements.map((element) => element.elementId));
  }

  function clearCanvasSelection() {
    args.setElementContextMenu(null);
    args.setSelectedElementIds([]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
  }

  function openElementContextMenu(input: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) {
    const isSelectedElement = args.selectedElementIds.includes(input.element.elementId);
    const isGroupingTarget = isSelectedElement && args.selectedElementIds.length > 1;
    if (!isGroupingTarget && input.element.type !== "image" && input.element.type !== "group") return;
    const { left, top } = getContextMenuPosition({
      clientX: input.clientX,
      clientY: input.clientY,
      height: 60,
      width: 196
    });
    args.setEditingElementId(null);
    if (isGroupingTarget) {
      args.setElementContextMenu({
        elementIds: args.selectedElementIds,
        left,
        slideId: input.slideId,
        top,
        type: "selection"
      });
      return;
    }
    args.setSelectedElementIds([input.element.elementId]);
    args.setElementContextMenu({
      elementId: input.element.elementId,
      left,
      slideId: input.slideId,
      top,
      type: input.element.type === "group" ? "group" : "image"
    });
  }

  return {
    actions: {
      addChartElement,
      addSlide,
      addTextElement,
      changeElementFrame,
      clearCanvasSelection,
      commitCustomShapeGeometry,
      copySelectedElement,
      createCustomShape,
      createDrawnElement,
      createGroupFromSelection,
      deleteSelectedElement,
      duplicateSelectedElement,
      insertShapeElement,
      openElementContextMenu,
      pasteCopiedElement,
      ungroupElement
    },
    refs: { copiedElementRef }
  };
}
