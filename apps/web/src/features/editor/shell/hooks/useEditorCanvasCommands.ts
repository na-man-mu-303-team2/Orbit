import {
  createAddElementPatch,
  createAddSlidePatch,
  createActivityResultsSlide,
  createActivitySlide,
  createElementId,
  createGroupedElementFramePatch,
  createSlideId,
  getGroupChildElements,
  getGroupedSelectionBounds,
} from "../../../../../../../packages/editor-core/src/index";
import {
  createElementFramePatch,
  normalizeElementFrameDraft,
} from "../../../../../../../packages/editor-core/src/patches/elementFrame";
import type {
  CustomShapeNode,
  ActivityTemplate,
  Deck,
  DeckElement,
  DeckElementRole,
  DeckPatch,
  GroupElementProps,
  ShapeElementProps,
  Slide,
} from "@orbit/shared";
import { useRef, type MutableRefObject } from "react";

import { resolveRedesignPalette } from "../../../../styles/redesignPalette";
import { normalizeCustomShapeAbsoluteGeometry } from "../../canvas/custom-shape/geometry";
import {
  createSlideIconDataUrl,
  type SlideIconDefinition
} from "../../icons/slideIconRegistry";
import type { ShapeInsertType } from "../components/EditorContextMenus";
import type {
  EditorShellUiUpdater,
  ElementContextMenuState,
  InsertTool,
} from "../editorShellUiStore";
import {
  getContextMenuPosition,
  getNextElementZIndex,
} from "../utils/editorLayout";
import {
  getElementLayerOrderUpdates,
  type ElementLayerOrderAction,
} from "../utils/elementLayerOrder";
import { canEditSlideCanvas } from "../utils/slideEditingPolicy";
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

type ClipboardState = {
  elements: DeckElement[];
  pasteCount: number;
  rootElementId: string;
};
type CommitPatch = (
  patch: DeckPatch | PatchProducer,
  baseDeck?: Deck,
) => boolean;

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
  setCustomShapeEditElementId: (
    updater: EditorShellUiUpdater<string | null>,
  ) => void;
  setEditingElementId: (updater: EditorShellUiUpdater<string | null>) => void;
  setElementContextMenu: (
    updater: EditorShellUiUpdater<ElementContextMenuState | null>,
  ) => void;
  setInsertTool: (updater: EditorShellUiUpdater<InsertTool>) => void;
  setIsShapeMenuOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setLastPatchLabel: (label: string) => void;
  setSelectedElementIds: (updater: EditorShellUiUpdater<string[]>) => void;
  workingDeckRef: MutableRefObject<Deck>;
}) {
  const copiedElementRef = useRef<ClipboardState | null>(null);

  function addTextElement() {
    if (!canEditSlideCanvas(args.currentSlide)) return;
    const elementId = createElementId(args.deck);
    args.commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
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
          fontFamily:
            args.currentSlide!.style.fontFamily ??
            args.deck.theme.typography.bodyFontFamily,
          fontSize: args.deck.theme.typography.bodySize,
          fontWeight: "normal",
          color:
            args.currentSlide!.style.textColor ?? args.deck.theme.textColor,
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2,
        },
      }),
    );
    args.setSelectedElementIds([elementId]);
    args.setEditingElementId(elementId);
    args.setInsertTool("select");
  }

  function addChartElement() {
    if (!canEditSlideCanvas(args.currentSlide)) return;
    const elementId = createElementId(args.deck);
    const redesignPalette = resolveRedesignPalette();
    const primaryColor =
      redesignPalette?.primary ?? args.deck.theme.palette.primary;
    const primaryFixedDimColor =
      redesignPalette?.primaryFixedDim ?? primaryColor;
    const primaryContainerColor =
      redesignPalette?.primaryContainer ?? primaryColor;
    args.commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
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
          data: [
            { label: "A", value: 48 },
            { label: "B", value: 72 },
            { label: "C", value: 56 },
          ],
          style: {
            colors: [primaryColor, primaryFixedDimColor, primaryContainerColor],
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
            unit: "",
          },
        },
      }),
    );
    args.setSelectedElementIds([elementId]);
  }

  function addIconElement(icon: SlideIconDefinition, color: string) {
    if (!canEditSlideCanvas(args.currentSlide)) return;
    const elementId = createElementId(args.deck);
    const width = icon.defaultWidth ?? 96;
    const height = icon.defaultHeight ?? 96;
    const x = Math.max(0, (args.deck.canvas.width - width) / 2);
    const y = Math.max(0, (args.deck.canvas.height - height) / 2);
    args.commitPatch((currentDeck) => createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
      elementId,
      type: "svg",
      role: "decoration",
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      zIndex: getNextElementZIndex(args.currentSlide!.elements),
      locked: false,
      visible: true,
      props: {
        src: createSlideIconDataUrl(icon, color),
        alt: icon.label,
        fit: "stretch",
        focusX: 0.5,
        focusY: 0.5
      }
    }));
    args.setSelectedElementIds([elementId]);
    args.setInsertTool("select");
  }

  function insertShapeElement(shapeType: ShapeInsertType) {
    if (!canEditSlideCanvas(args.currentSlide)) return;
    if (shapeType === "customShape") {
      args.setEditingElementId(null);
      args.setCustomShapeEditElementId(null);
      args.setSelectedElementIds([]);
      args.setInsertTool("customShape");
      args.setIsShapeMenuOpen(false);
      return;
    }
    const elementId = createElementId(args.deck);
    const redesignPalette = resolveRedesignPalette();
    const primaryColor =
      redesignPalette?.primary ?? args.deck.theme.palette.primary;
    const primaryContainerColor =
      redesignPalette?.primaryContainer ?? primaryColor;
    const frames: Record<
      ShapeInsertType,
      { x: number; y: number; width: number; height: number }
    > = {
      rect: { x: 260, y: 220, width: 280, height: 160 },
      ellipse: { x: 260, y: 220, width: 180, height: 180 },
      line: { x: 240, y: 280, width: 320, height: 12 },
      arrow: { x: 240, y: 280, width: 360, height: 28 },
      triangle: { x: 260, y: 220, width: 180, height: 180 },
      polygon: { x: 260, y: 220, width: 180, height: 180 },
      star: { x: 260, y: 220, width: 180, height: 180 },
      customShape: { x: 260, y: 220, width: 220, height: 160 },
    };
    const frame = frames[shapeType];
    const nextElement: DeckElement = {
      elementId,
      type: shapeType === "triangle" ? "polygon" : shapeType,
      role:
        shapeType === "line" || shapeType === "arrow"
          ? "decoration"
          : "highlight",
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
        fill:
          shapeType === "line" || shapeType === "arrow"
            ? "transparent"
            : primaryContainerColor,
        stroke: primaryColor,
        strokeWidth: 3,
        borderRadius: 18,
        ...(shapeType === "triangle"
          ? { sides: 3 }
          : shapeType === "polygon"
            ? { sides: 6 }
            : {}),
      } as ShapeElementProps,
    };
    args.commitPatch((currentDeck) =>
      createAddElementPatch(
        currentDeck,
        args.currentSlide!.slideId,
        nextElement,
      ),
    );
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
        kind: "content",
        slideId,
        order: nextOrder,
        title: `Slide ${nextOrder}`,
        thumbnailUrl: "",
        style: {
          layout: "title-content",
          backgroundColor: currentDeck.theme.backgroundColor,
          textColor: currentDeck.theme.textColor,
          accentColor: currentDeck.theme.accentColor,
        },
        speakerNotes: "",
        keywords: [],
        semanticCues: [],
        elements: [
          {
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
              lineHeight: 1.1,
            },
          },
        ],
        animations: [],
        actions: [],
      });
    });
    if (!committed) return;
    args.setCurrentSlideIndex(nextSlideIndex);
    args.setSelectedElementIds([]);
  }

  function addActivitySlide(template: ActivityTemplate) {
    if (!args.confirmDiscardSpeakerNotesDraft()) return false;
    if (args.workingDeckRef.current.canvas.preset !== "wide-16-9") return false;

    let nextSlideIndex = args.workingDeckRef.current.slides.length;
    args.resetSpeakerNotesEditState("");
    const committed = args.commitPatch((currentDeck) => {
      const slide = createActivitySlide(currentDeck, template);
      nextSlideIndex = currentDeck.slides.length;
      return createAddSlidePatch(currentDeck, slide);
    });
    if (!committed) return false;

    args.setCurrentSlideIndex(nextSlideIndex);
    args.setSelectedElementIds([]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    return true;
  }

  function addActivityResultsSlide(sourceActivityId?: string) {
    if (!args.confirmDiscardSpeakerNotesDraft()) return false;
    if (args.workingDeckRef.current.canvas.preset !== "wide-16-9") return false;

    const source = [...args.workingDeckRef.current.slides]
      .reverse()
      .find(
        (slide) =>
          slide.kind === "activity" &&
          (sourceActivityId === undefined ||
            slide.activity.activityId === sourceActivityId)
      );
    if (!source || source.kind !== "activity") return false;

    let nextSlideIndex = args.workingDeckRef.current.slides.length;
    args.resetSpeakerNotesEditState("");
    const committed = args.commitPatch((currentDeck) => {
      const slide = createActivityResultsSlide(
        currentDeck,
        source.activity.activityId
      );
      nextSlideIndex = currentDeck.slides.length;
      return createAddSlidePatch(currentDeck, slide);
    });
    if (!committed) return false;

    args.setCurrentSlideIndex(nextSlideIndex);
    args.setSelectedElementIds([]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    return true;
  }

  function deleteSelectedElement() {
    if (!canEditSlideCanvas(args.currentSlide) || args.selectedElementIds.length === 0) return;
    args.setElementContextMenu(null);
    const elementsById = new Map(
      args.currentSlide.elements.map((element) => [element.elementId, element])
    );
    const deleteElementIds = new Set<string>();
    const collectDeleteTargets = (elementId: string) => {
      if (deleteElementIds.has(elementId)) return;
      const element = elementsById.get(elementId);
      if (!element) return;
      if (element.type === "group") {
        const groupProps = element.props as GroupElementProps;
        for (const childElementId of groupProps.childElementIds) {
          collectDeleteTargets(childElementId);
        }
      }
      deleteElementIds.add(elementId);
    };
    for (const elementId of args.selectedElementIds) collectDeleteTargets(elementId);
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [...deleteElementIds].map((elementId) => ({
        type: "delete_element" as const,
        slideId: args.currentSlide!.slideId,
        elementId,
      })),
    }));
    args.setSelectedElementIds([]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
  }

  function getCloneSourceElements(rootElement: DeckElement) {
    if (!canEditSlideCanvas(args.currentSlide) || rootElement.type !== "group") {
      return canEditSlideCanvas(args.currentSlide) ? [rootElement] : [];
    }
    const elementsById = new Map(
      args.currentSlide.elements.map((element) => [element.elementId, element]),
    );
    const collected: DeckElement[] = [];
    const visited = new Set<string>();
    const collect = (element: DeckElement) => {
      if (visited.has(element.elementId)) return;
      visited.add(element.elementId);
      collected.push(element);
      if (element.type !== "group") return;
      const groupProps = element.props as GroupElementProps;
      for (const childElementId of groupProps.childElementIds) {
        const childElement = elementsById.get(childElementId);
        if (childElement) collect(childElement);
      }
    };
    collect(rootElement);
    return collected;
  }

  function cloneElements(
    sourceElements: DeckElement[],
    rootElementId: string,
    offsetMultiplier = 1,
  ) {
    if (!canEditSlideCanvas(args.currentSlide)) return null;
    if (sourceElements.length === 0) return null;
    const existingIds = new Set(
      args.deck.slides.flatMap((slide) =>
        slide.elements.map((element) => element.elementId),
      ),
    );
    const idMap = new Map<string, string>();
    for (const sourceElement of sourceElements) {
      let index = 1;
      while (existingIds.has(`el_${index}`)) index += 1;
      const nextElementId = `el_${index}`;
      existingIds.add(nextElementId);
      idMap.set(sourceElement.elementId, nextElementId);
    }
    const highestZIndex = args.currentSlide.elements.reduce(
      (highest, element) => Math.max(highest, element.zIndex),
      0,
    );
    const lowestSourceZIndex = Math.min(
      ...sourceElements.map((element) => element.zIndex),
    );
    const offset = 24 * offsetMultiplier;
    const clonedElements = sourceElements.map((sourceElement) => {
      const clonedElement = structuredClone(sourceElement);
      clonedElement.elementId = idMap.get(sourceElement.elementId)!;
      clonedElement.x = sourceElement.x + offset;
      clonedElement.y = sourceElement.y + offset;
      clonedElement.zIndex =
        highestZIndex + 1 + sourceElement.zIndex - lowestSourceZIndex;
      if (clonedElement.type === "group") {
        const groupProps = clonedElement.props as GroupElementProps;
        groupProps.childElementIds = groupProps.childElementIds
          .map((childElementId) => idMap.get(childElementId))
          .filter((childElementId): childElementId is string => Boolean(childElementId));
      }
      return clonedElement;
    });
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: clonedElements.map((element) => ({
        type: "add_element" as const,
        slideId: args.currentSlide!.slideId,
        element,
      })),
    }));
    const nextRootElementId = idMap.get(rootElementId) ?? null;
    if (nextRootElementId) args.setSelectedElementIds([nextRootElementId]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    return nextRootElementId;
  }

  function duplicateSelectedElement() {
    if (!canEditSlideCanvas(args.currentSlide) || !args.selectedElement) return;
    args.setElementContextMenu(null);
    cloneElements(
      getCloneSourceElements(args.selectedElement),
      args.selectedElement.elementId
    );
  }

  function copySelectedElement() {
    if (!canEditSlideCanvas(args.currentSlide) || !args.selectedElement) return;
    args.setElementContextMenu(null);
    copiedElementRef.current = {
      elements: structuredClone(getCloneSourceElements(args.selectedElement)),
      pasteCount: 0,
      rootElementId: args.selectedElement.elementId,
    };
  }

  function pasteCopiedElement() {
    if (!canEditSlideCanvas(args.currentSlide) || !copiedElementRef.current) return;
    args.setElementContextMenu(null);
    const { elements, pasteCount, rootElementId } = copiedElementRef.current;
    const nextPasteCount = pasteCount + 1;
    cloneElements(elements, rootElementId, nextPasteCount);
    copiedElementRef.current = { elements, pasteCount: nextPasteCount, rootElementId };
  }

  function createDrawnElement(
    draft:
      | { type: "text"; x: number; y: number; width: number; height: number }
      | {
          type: "rect" | "ellipse" | "line";
          x: number;
          y: number;
          width: number;
          height: number;
        },
  ) {
    if (!canEditSlideCanvas(args.currentSlide)) return;
    const elementId = createElementId(args.deck);
    const redesignPalette = resolveRedesignPalette();
    const primaryColor =
      redesignPalette?.primary ?? args.deck.theme.palette.primary;
    const primaryContainerColor =
      redesignPalette?.primaryContainer ?? primaryColor;
    if (draft.type === "text") {
      args.commitPatch((currentDeck) =>
        createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
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
            fontFamily:
              args.currentSlide!.style.fontFamily ??
              args.deck.theme.typography.bodyFontFamily,
            fontSize: args.deck.theme.typography.bodySize,
            fontWeight: "normal",
            color:
              args.currentSlide!.style.textColor ?? args.deck.theme.textColor,
            align: "left",
            verticalAlign: "top",
            lineHeight: 1.2,
          },
        }),
      );
      args.setEditingElementId(elementId);
    } else {
      args.commitPatch((currentDeck) =>
        createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
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
            fill: draft.type === "line" ? "transparent" : primaryContainerColor,
            stroke: primaryColor,
            strokeWidth: 3,
            borderRadius: 18,
          },
        }),
      );
    }
    args.setSelectedElementIds([elementId]);
    args.setInsertTool("select");
  }

  function createCustomShape(nodes: CustomShapeNode[], closed: boolean) {
    if (!canEditSlideCanvas(args.currentSlide) || nodes.length < 2) {
      args.setInsertTool("select");
      return;
    }
    const elementId = createElementId(args.deck);
    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);
    args.commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
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
          pathData: geometry.props.pathData,
        },
      }),
    );
    args.setSelectedElementIds([elementId]);
    args.setCustomShapeEditElementId(elementId);
    args.setInsertTool("select");
  }

  function commitCustomShapeGeometry(
    slideId: string,
    elementId: string,
    nodes: CustomShapeNode[],
    closed: boolean,
  ) {
    const slide = args.deck.slides.find(
      (candidate) => candidate.slideId === slideId,
    );
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === elementId,
    );
    if (
      !canEditSlideCanvas(slide) ||
      !element ||
      element.type !== "customShape" ||
      nodes.length < 2
    ) {
      return;
    }
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
          frame: normalizeElementFrameDraft(
            currentDeck.canvas,
            element,
            geometry.frame,
          ),
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
            viewBoxHeight: geometry.props.viewBoxHeight,
          },
        },
      ],
    }));
  }

  function changeElementFrame(
    slideId: string,
    elementId: string,
    frame: ElementFrameChange,
  ) {
    const slide = args.deck.slides.find(
      (candidate) => candidate.slideId === slideId,
    );
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === elementId,
    );
    if (!canEditSlideCanvas(slide) || !element) return;
    try {
      args.commitPatch((currentDeck) =>
        element.type === "group"
          ? createGroupedElementFramePatch(
              currentDeck,
              slideId,
              elementId,
              frame,
            )
          : createElementFramePatch(currentDeck, slideId, elementId, frame),
      );
    } catch (error) {
      args.setLastPatchLabel(
        error instanceof Error ? `실패 · ${error.message}` : "실패 · unknown",
      );
    }
  }

  function changeElementLayerOrder(
    slideId: string,
    elementId: string,
    action: ElementLayerOrderAction,
  ) {
    const slide = args.deck.slides.find(
      (candidate) => candidate.slideId === slideId,
    );
    if (!canEditSlideCanvas(slide)) return;
    const updates = getElementLayerOrderUpdates(
      slide.elements,
      elementId,
      action,
    );
    if (updates.length === 0) return;

    args.commitPatch((currentDeck) => {
      const currentSlide = currentDeck.slides.find(
        (candidate) => candidate.slideId === slideId,
      );
      if (!currentSlide) {
        throw new Error(`Slide ${slideId} was not found`);
      }
      return {
        deckId: currentDeck.deckId,
        baseVersion: currentDeck.version,
        source: "user",
        operations: updates.map((update) => {
          const element = currentSlide.elements.find(
            (candidate) => candidate.elementId === update.elementId,
          );
          if (!element) {
            throw new Error(`Element ${update.elementId} was not found`);
          }
          return {
            type: "update_element_frame" as const,
            slideId,
            elementId: update.elementId,
            frame: normalizeElementFrameDraft(currentDeck.canvas, element, {
              zIndex: update.zIndex,
            }),
          };
        }),
      };
    });
  }

  function createGroupFromSelection() {
    if (!canEditSlideCanvas(args.currentSlide) || args.selectedElements.length < 2) return;
    const elementId = createElementId(args.deck);
    const bounds = getGroupedSelectionBounds(args.selectedElements);
    const highestZIndex = args.selectedElements.reduce(
      (highest, element) => Math.max(highest, element.zIndex),
      0,
    );
    args.commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, args.currentSlide!.slideId, {
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
        props: {
          childElementIds: args.selectedElements.map(
            (element) => element.elementId,
          ),
        },
      }),
    );
    args.setElementContextMenu(null);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    args.setSelectedElementIds([elementId]);
  }

  function ungroupElement(slideId: string, elementId: string) {
    const slide = args.deck.slides.find(
      (candidate) => candidate.slideId === slideId,
    );
    const groupElement = slide?.elements.find(
      (candidate) => candidate.elementId === elementId,
    );
    if (
      !canEditSlideCanvas(slide) ||
      !groupElement ||
      groupElement.type !== "group"
    ) {
      return;
    }
    const groupProps = groupElement.props as GroupElementProps;
    const childElements = getGroupChildElements(
      slide,
      groupProps.childElementIds,
    );
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [{ type: "delete_element", slideId, elementId }],
    }));
    args.setElementContextMenu(null);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    args.setSelectedElementIds(
      childElements.map((element) => element.elementId),
    );
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
    const slide = args.deck.slides.find(
      (candidate) => candidate.slideId === input.slideId,
    );
    if (!canEditSlideCanvas(slide)) return;
    const isSelectedElement = args.selectedElementIds.includes(
      input.element.elementId,
    );
    const isGroupingTarget =
      isSelectedElement && args.selectedElementIds.length > 1;
    if (
      !isGroupingTarget &&
      input.element.type !== "image" &&
      input.element.type !== "group"
    ) {
      return;
    }
    const { left, top } = getContextMenuPosition({
      clientX: input.clientX,
      clientY: input.clientY,
      height: 60,
      width: 196,
    });
    args.setEditingElementId(null);
    if (isGroupingTarget) {
      args.setElementContextMenu({
        elementIds: args.selectedElementIds,
        left,
        slideId: input.slideId,
        top,
        type: "selection",
      });
      return;
    }
    args.setSelectedElementIds([input.element.elementId]);
    args.setElementContextMenu({
      elementId: input.element.elementId,
      left,
      slideId: input.slideId,
      top,
      type: input.element.type === "group" ? "group" : "image",
    });
  }

  return {
    actions: {
      addChartElement,
      addActivityResultsSlide,
      addIconElement,
      addSlide,
      addActivitySlide,
      addTextElement,
      changeElementFrame,
      changeElementLayerOrder,
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
      ungroupElement,
    },
    refs: { copiedElementRef },
  };
}
