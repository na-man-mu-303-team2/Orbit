import {
  createAddElementPatch,
  createAddSlidePatch,
  createDuplicateElementPatch,
  createElementId,
  createGroupedElementFramePatch,
  createSlideId,
  getGroupChildElements,
  getGroupedSelectionBounds,
  createTableOperationPatch,
  getTableOperationCapability,
  getTableStructureCapability,
  type TableOperation,
} from "../../../../../../../packages/editor-core/src/index";
import {
  createElementFramePatch,
  normalizeElementFrameDraft,
} from "../../../../../../../packages/editor-core/src/patches/elementFrame";
import type {
  CustomShapeNode,
  Deck,
  DeckElement,
  DeckElementRole,
  DeckPatch,
  GroupElementProps,
  Slide,
} from "@orbit/shared";
import { useEffect, useRef, type MutableRefObject } from "react";

import { normalizeCustomShapeAbsoluteGeometry } from "../../canvas/custom-shape/geometry";
import type { ShapeInsertType } from "../components/EditorContextMenus";
import { resolveOoxmlEditCapability } from "../editorOoxmlCapabilities";
import type {
  EditorShellUiUpdater,
  ElementContextMenuState,
  InsertTool,
  TableCellTarget,
  TableContextAction,
} from "../editorShellUiStore";
import { useEditorShellUiStore } from "../editorShellUiStore";
import {
  getContextMenuPosition,
  getNextElementZIndex,
} from "../utils/editorLayout";
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
type CommitPatch = (
  patch: DeckPatch | PatchProducer,
  baseDeck?: Deck,
) => boolean;

type TableElement = Extract<DeckElement, { type: "table" }>;
type TableActionState =
  | { enabled: true; reason: null }
  | { enabled: false; reason: string };

export type TableContextActionStates = Record<
  TableContextAction | "cellText",
  TableActionState
>;

const tableDisabledReasonLabels = {
  "cell-out-of-bounds": "선택한 셀을 찾을 수 없습니다.",
  "column-index-out-of-bounds": "선택한 열을 찾을 수 없습니다.",
  "column-track-mismatch": "열 너비 정보가 표 구조와 일치하지 않습니다.",
  "empty-grid": "비어 있는 표는 셀을 편집할 수 없습니다.",
  "jagged-grid": "행마다 셀 수가 다른 표는 안전하게 편집할 수 없습니다.",
  "last-column": "마지막 열은 삭제할 수 없습니다.",
  "last-row": "마지막 행은 삭제할 수 없습니다.",
  "merged-cells": "병합된 셀이 있는 표는 구조를 안전하게 편집할 수 없습니다.",
  "row-index-out-of-bounds": "선택한 행을 찾을 수 없습니다.",
  "row-track-mismatch": "행 높이 정보가 표 구조와 일치하지 않습니다.",
  "table-element-not-found": "편집할 표를 찾지 못했습니다.",
  "table-element-type-mismatch": "선택한 요소가 표가 아닙니다.",
} as const;

export function getTableContextActionStates(args: {
  deck: Deck;
  element: TableElement;
}): TableContextActionStates {
  const structure = getTableStructureCapability(args.element.props);
  const cellCapability = structure.enabled
    ? resolveOoxmlEditCapability({
        deck: args.deck,
        element: args.element,
        feature: "table-cell-text",
      })
    : {
        enabled: false,
        reason:
          tableDisabledReasonLabels[structure.reason] ??
          "이 표의 셀 구조를 안전하게 편집할 수 없습니다.",
      };
  let structureDisabledReason: string | null = structure.enabled
    ? null
    : (tableDisabledReasonLabels[structure.reason] ??
      "이 표의 행과 열을 안전하게 편집할 수 없습니다.");

  if (!structureDisabledReason && args.deck.metadata.sourceType === "import") {
    if (args.element.ooxmlOrigin === "imported") {
      structureDisabledReason =
        "가져온 표의 행과 열 구조는 원본 OOXML 보존을 위해 편집할 수 없습니다.";
    } else {
      const capability = resolveOoxmlEditCapability({
        deck: args.deck,
        element: args.element,
        feature: "table-structure",
      });
      if (!capability.enabled) {
        structureDisabledReason =
          capability.reason ??
          "이 표의 행과 열 구조를 OOXML에 안전하게 저장할 수 없습니다.";
      }
    }
  }

  const structuralState: TableActionState = structureDisabledReason
    ? { enabled: false, reason: structureDisabledReason }
    : { enabled: true, reason: null };
  const deleteRowState = structureDisabledReason
    ? structuralState
    : tableOperationState(
        getTableOperationCapability(args.element.props, {
          index: 0,
          type: "delete_row",
        }),
      );
  const deleteColumnState = structureDisabledReason
    ? structuralState
    : tableOperationState(
        getTableOperationCapability(args.element.props, {
          index: 0,
          type: "delete_column",
        }),
      );

  return {
    cellText: cellCapability.enabled
      ? { enabled: true, reason: null }
      : {
          enabled: false,
          reason:
            cellCapability.reason ??
            "이 표의 셀 텍스트를 OOXML에 안전하게 저장할 수 없습니다.",
        },
    deleteColumn: deleteColumnState,
    deleteRow: deleteRowState,
    insertColumnLeft: structuralState,
    insertColumnRight: structuralState,
    insertRowAbove: structuralState,
    insertRowBelow: structuralState,
  };
}

export function createTableUiOperationPatch(args: {
  deck: Deck;
  elementId: string;
  operation: TableOperation;
  slideId: string;
}) {
  return createTableOperationPatch(
    args.deck,
    args.slideId,
    args.elementId,
    args.operation,
  );
}

function tableOperationState(
  capability: ReturnType<typeof getTableOperationCapability>,
): TableActionState {
  return capability.enabled
    ? { enabled: true, reason: null }
    : {
        enabled: false,
        reason:
          tableDisabledReasonLabels[capability.reason] ??
          "이 표 작업을 안전하게 실행할 수 없습니다.",
      };
}

function tableOperationForContextAction(
  action: TableContextAction,
  rowIndex: number,
  columnIndex: number,
): TableOperation {
  switch (action) {
    case "insertRowAbove":
      return { index: rowIndex, type: "insert_row" };
    case "insertRowBelow":
      return { index: rowIndex + 1, type: "insert_row" };
    case "insertColumnLeft":
      return { index: columnIndex, type: "insert_column" };
    case "insertColumnRight":
      return { index: columnIndex + 1, type: "insert_column" };
    case "deleteRow":
      return { index: rowIndex, type: "delete_row" };
    case "deleteColumn":
      return { index: columnIndex, type: "delete_column" };
  }
}

function nextTableCellTarget(
  target: TableCellTarget,
  action: TableContextAction,
): TableCellTarget {
  if (action === "insertRowAbove") {
    return { ...target, rowIndex: target.rowIndex + 1 };
  }
  if (action === "insertColumnLeft") {
    return { ...target, columnIndex: target.columnIndex + 1 };
  }
  if (action === "deleteRow") {
    return { ...target, rowIndex: Math.max(0, target.rowIndex - 1) };
  }
  if (action === "deleteColumn") {
    return { ...target, columnIndex: Math.max(0, target.columnIndex - 1) };
  }
  return target;
}

export function resolveProposedElementAddCapability(
  deck: Deck,
  slide: Slide | null,
  element: DeckElement,
) {
  if (deck.metadata.sourceType !== "import") {
    return resolveOoxmlEditCapability({
      deck,
      element,
      feature: "add-element",
      slide,
    });
  }

  const authoredElement = {
    ...element,
    ooxmlOrigin: "authored" as const,
  };
  delete authoredElement.ooxmlEditCapabilities;
  return resolveOoxmlEditCapability({
    deck,
    element: authoredElement,
    feature: "add-element",
    slide,
  });
}

export function resolveEditorAddElementCapabilities(deck: Deck, slide: Slide) {
  const text = createTextElementDraft(
    deck,
    slide,
    "el_text_insert_capability_probe",
  );
  const chart = createChartElementDraft(
    deck,
    slide,
    "el_chart_insert_capability_probe",
  );
  const shapes = Object.fromEntries(
    (
      [
        "rect",
        "ellipse",
        "line",
        "arrow",
        "triangle",
        "polygon",
        "star",
        "customShape",
      ] as const
    ).map((shapeType) => [
      shapeType,
      resolveProposedElementAddCapability(
        deck,
        slide,
        createShapeElementDraft(
          slide,
          `el_${shapeType}_insert_capability_probe`,
          shapeType,
        ),
      ),
    ]),
  ) as Record<
    ShapeInsertType,
    ReturnType<typeof resolveProposedElementAddCapability>
  >;

  return {
    chart: resolveProposedElementAddCapability(deck, slide, chart),
    shapes,
    text: resolveProposedElementAddCapability(deck, slide, text),
  };
}

export function resolveGroupCreationCapability(
  deck: Deck,
  slide: Slide,
  elements: DeckElement[],
) {
  return resolveProposedElementAddCapability(
    deck,
    slide,
    createGroupElementDraft(deck, elements),
  );
}

function createTextElementDraft(
  deck: Deck,
  slide: Slide,
  elementId: string,
): DeckElement {
  return {
    elementId,
    type: "text",
    role: "body",
    x: 180,
    y: 180,
    width: 360,
    height: 96,
    rotation: 0,
    opacity: 1,
    zIndex: getNextElementZIndex(slide.elements),
    locked: false,
    visible: true,
    props: {
      text: "새 텍스트",
      fontFamily:
        slide.style.fontFamily ?? deck.theme.typography.bodyFontFamily,
      fontSize: deck.theme.typography.bodySize,
      fontWeight: "normal",
      color: slide.style.textColor ?? deck.theme.textColor,
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
    },
  };
}

function createChartElementDraft(
  deck: Deck,
  slide: Slide,
  elementId: string,
): DeckElement {
  return {
    elementId,
    type: "chart",
    role: "chart",
    x: 240,
    y: 180,
    width: 520,
    height: 280,
    rotation: 0,
    opacity: 1,
    zIndex: getNextElementZIndex(slide.elements),
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
        colors: ["#2563eb", "#0ea5e9", "#7c3aed"],
        backgroundColor: "#ffffff",
        textColor: "#111827",
        fontFamily: deck.theme.typography.bodyFontFamily,
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
  };
}

function createShapeElementDraft(
  slide: Slide,
  elementId: string,
  shapeType: ShapeInsertType,
): DeckElement {
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
  const common = {
    elementId,
    role:
      shapeType === "line" || shapeType === "arrow"
        ? ("decoration" as const)
        : ("highlight" as const),
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: 0,
    opacity: 1,
    zIndex: getNextElementZIndex(slide.elements),
    locked: false,
    visible: true,
  };

  if (shapeType === "customShape") {
    return {
      ...common,
      type: "customShape",
      props: {
        closed: false,
        fill: "#f5edff",
        nodes: [],
        pathData: "M 0 0 L 1 1",
        stroke: "#9333ea",
        strokeWidth: 2,
        viewBoxHeight: 1,
        viewBoxWidth: 1,
      },
    };
  }

  return {
    ...common,
    type: shapeType === "triangle" ? "polygon" : shapeType,
    props: {
      fill:
        shapeType === "line" || shapeType === "arrow"
          ? "transparent"
          : "#dbeafe",
      stroke: "#2563eb",
      strokeWidth: 3,
      borderRadius: 18,
      ...(shapeType === "triangle"
        ? { sides: 3 }
        : shapeType === "polygon"
          ? { sides: 6 }
          : {}),
    },
  };
}

function createGroupElementDraft(
  deck: Deck,
  elements: DeckElement[],
): DeckElement {
  const bounds = getGroupedSelectionBounds(elements);
  const highestZIndex = elements.reduce(
    (highest, element) => Math.max(highest, element.zIndex),
    0,
  );
  return {
    elementId: createElementId(deck),
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
      childElementIds: elements.map((element) => element.elementId),
    },
  };
}

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
  const tableOperationRequest = useEditorShellUiStore(
    (state) => state.tableOperationRequest,
  );

  useEffect(() => {
    if (!tableOperationRequest) return;
    useEditorShellUiStore.getState().setTableOperationRequest(null);

    const activeDeck = args.workingDeckRef.current;
    const slide = activeDeck.slides.find(
      (candidate) => candidate.slideId === tableOperationRequest.slideId,
    );
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === tableOperationRequest.elementId,
    );
    if (!slide || !element || element.type !== "table") {
      args.setLastPatchLabel("편집할 표를 찾지 못했습니다.");
      return;
    }

    const actionStates = getTableContextActionStates({
      deck: activeDeck,
      element,
    });
    const actionState =
      tableOperationRequest.action === "updateCellText"
        ? actionStates.cellText
        : actionStates[tableOperationRequest.action];
    if (!actionState.enabled) {
      args.setLastPatchLabel(actionState.reason);
      return;
    }

    const operation: TableOperation =
      tableOperationRequest.action === "updateCellText"
        ? {
            columnIndex: tableOperationRequest.columnIndex,
            rowIndex: tableOperationRequest.rowIndex,
            text: tableOperationRequest.text,
            type: "update_cell_text",
          }
        : tableOperationForContextAction(
            tableOperationRequest.action,
            tableOperationRequest.rowIndex,
            tableOperationRequest.columnIndex,
          );
    const result = createTableUiOperationPatch({
      deck: activeDeck,
      elementId: element.elementId,
      operation,
      slideId: slide.slideId,
    });
    if (!result.ok) {
      args.setLastPatchLabel(
        tableDisabledReasonLabels[result.reason] ??
          "표 편집 작업을 적용하지 못했습니다.",
      );
      return;
    }
    if (!args.commitPatch(result.patch)) return;

    const currentTarget = useEditorShellUiStore.getState().activeTableCell;
    if (
      tableOperationRequest.action !== "updateCellText" &&
      currentTarget?.slideId === slide.slideId &&
      currentTarget.elementId === element.elementId
    ) {
      useEditorShellUiStore
        .getState()
        .setActiveTableCell(
          nextTableCellTarget(currentTarget, tableOperationRequest.action),
        );
    }
    args.setElementContextMenu(null);
  }, [tableOperationRequest]);

  function commitAddedElement(slideId: string, element: DeckElement) {
    const activeDeck = args.workingDeckRef.current;
    const capability = resolveProposedElementAddCapability(
      activeDeck,
      activeDeck.slides.find((slide) => slide.slideId === slideId) ?? null,
      element,
    );
    if (!capability.enabled) {
      args.setLastPatchLabel(
        capability.reason ?? "이 요소를 PPTX에 안전하게 추가할 수 없습니다.",
      );
      return false;
    }
    return args.commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, slideId, element),
    );
  }

  function addTextElement() {
    if (!args.currentSlide) return;
    const elementId = createElementId(args.deck);
    const element = createTextElementDraft(
      args.deck,
      args.currentSlide,
      elementId,
    );
    if (!commitAddedElement(args.currentSlide.slideId, element)) return;
    args.setSelectedElementIds([elementId]);
    args.setEditingElementId(elementId);
    args.setInsertTool("select");
  }

  function addChartElement() {
    if (!args.currentSlide) return;
    const elementId = createElementId(args.deck);
    const element = createChartElementDraft(
      args.deck,
      args.currentSlide,
      elementId,
    );
    if (!commitAddedElement(args.currentSlide.slideId, element)) return;
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
    const nextElement = createShapeElementDraft(
      args.currentSlide,
      elementId,
      shapeType,
    );
    if (!commitAddedElement(args.currentSlide.slideId, nextElement)) return;
    args.setSelectedElementIds([elementId]);
    args.setInsertTool("select");
    args.setIsShapeMenuOpen(false);
  }

  function addSlide() {
    const capability = resolveOoxmlEditCapability({
      deck: args.workingDeckRef.current,
      feature: "add-slide",
      slide: args.currentSlide,
    });
    if (!capability.enabled) {
      args.setLastPatchLabel(
        capability.reason ??
          "이 Deck에는 슬라이드를 안전하게 추가할 수 없습니다.",
      );
      return;
    }
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

  function deleteSelectedElement() {
    if (!args.currentSlide || args.selectedElementIds.length === 0) return;
    const currentDeck = args.workingDeckRef.current;
    const currentSlide = currentDeck.slides.find(
      (candidate) => candidate.slideId === args.currentSlide!.slideId,
    );
    const deniedCapability = args.selectedElementIds
      .map((elementId) =>
        currentSlide?.elements.find(
          (candidate) => candidate.elementId === elementId,
        ),
      )
      .filter((element): element is DeckElement => Boolean(element))
      .map((element) =>
        resolveOoxmlEditCapability({
          deck: currentDeck,
          element,
          feature: "delete-element",
        }),
      )
      .find((capability) => !capability.enabled);
    if (deniedCapability) {
      args.setLastPatchLabel(
        deniedCapability.reason ??
          "이 요소를 PPTX에서 안전하게 삭제할 수 없습니다.",
      );
      return;
    }
    args.setElementContextMenu(null);
    args.commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: args.selectedElementIds.map((elementId) => ({
        type: "delete_element" as const,
        slideId: args.currentSlide!.slideId,
        elementId,
      })),
    }));
    args.setSelectedElementIds([]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
  }

  function cloneElement(sourceElement: DeckElement, offsetMultiplier = 1) {
    if (!args.currentSlide) return null;
    const nextElementId = createElementId(args.deck);
    const nextZIndex =
      args.currentSlide.elements.reduce(
        (highest, element) => Math.max(highest, element.zIndex),
        0,
      ) + 1;
    const offset = 24 * offsetMultiplier;
    const element: DeckElement = {
      ...structuredClone(sourceElement),
      elementId: nextElementId,
      x: sourceElement.x + offset,
      y: sourceElement.y + offset,
      zIndex: nextZIndex,
    };
    if (!commitAddedElement(args.currentSlide.slideId, element)) return null;
    args.setSelectedElementIds([nextElementId]);
    args.setEditingElementId(null);
    args.setCustomShapeEditElementId(null);
    return nextElementId;
  }

  function duplicateSelectedElement() {
    if (!args.currentSlide || !args.selectedElement) return;
    args.setElementContextMenu(null);
    const capability = resolveOoxmlEditCapability({
      deck: args.workingDeckRef.current,
      element: args.selectedElement,
      feature: "duplicate-element",
    });
    if (!capability.enabled) {
      args.setLastPatchLabel(
        capability.reason ?? "OOXML 복제를 지원하지 않습니다.",
      );
      return;
    }
    if (args.selectedElement.type === "group") {
      const duplicated = createDuplicateElementPatch(
        args.workingDeckRef.current,
        args.currentSlide.slideId,
        args.selectedElement.elementId,
      );
      if (!duplicated || !args.commitPatch(duplicated.patch)) return;
      args.setSelectedElementIds([duplicated.duplicateElementId]);
      args.setEditingElementId(null);
      args.setCustomShapeEditElementId(null);
      return;
    }
    cloneElement(args.selectedElement);
  }

  function copySelectedElement() {
    if (!args.selectedElement) return;
    args.setElementContextMenu(null);
    copiedElementRef.current = {
      element: structuredClone(args.selectedElement),
      pasteCount: 0,
    };
  }

  function pasteCopiedElement() {
    if (!args.currentSlide || !copiedElementRef.current) return;
    args.setElementContextMenu(null);
    const { element, pasteCount } = copiedElementRef.current;
    const nextPasteCount = pasteCount + 1;
    cloneElement(element, nextPasteCount);
    copiedElementRef.current = { element, pasteCount: nextPasteCount };
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
    if (!args.currentSlide) return;
    const elementId = createElementId(args.deck);
    if (draft.type === "text") {
      const element: DeckElement = {
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
      };
      if (!commitAddedElement(args.currentSlide.slideId, element)) return;
      args.setEditingElementId(elementId);
    } else {
      const element: DeckElement = {
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
          borderRadius: 18,
        },
      };
      if (!commitAddedElement(args.currentSlide.slideId, element)) return;
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
    const element: DeckElement = {
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
    };
    if (!commitAddedElement(args.currentSlide.slideId, element)) {
      args.setInsertTool("select");
      return;
    }
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
      !slide ||
      !element ||
      element.type !== "customShape" ||
      nodes.length < 2
    )
      return;
    const capability = resolveOoxmlEditCapability({
      deck: args.workingDeckRef.current,
      element,
      feature: "element-properties",
    });
    if (!capability.enabled) {
      args.setLastPatchLabel(
        capability.reason ??
          "이 요소의 도형 속성을 안전하게 저장할 수 없습니다.",
      );
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
    if (!slide || !element) return;
    const feature = Object.keys(frame).some((key) =>
      ["opacity", "role", "visible"].includes(key),
    )
      ? "element-appearance"
      : "element-frame";
    const capability = resolveOoxmlEditCapability({
      deck: args.workingDeckRef.current,
      element,
      feature,
    });
    if (!capability.enabled) {
      args.setLastPatchLabel(
        capability.reason ??
          "이 요소 변경을 PPTX에 안전하게 저장할 수 없습니다.",
      );
      return;
    }
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

  function createGroupFromSelection() {
    if (!args.currentSlide || args.selectedElements.length < 2) return;
    const element = createGroupElementDraft(args.deck, args.selectedElements);
    const elementId = element.elementId;
    if (!commitAddedElement(args.currentSlide.slideId, element)) return;
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
    if (!slide || !groupElement || groupElement.type !== "group") return;
    const capability = resolveOoxmlEditCapability({
      deck: args.workingDeckRef.current,
      element: groupElement,
      feature: "delete-element",
    });
    if (!capability.enabled) {
      args.setLastPatchLabel(
        capability.reason ?? "이 그룹을 PPTX에서 안전하게 해제할 수 없습니다.",
      );
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
    const isSelectedElement = args.selectedElementIds.includes(
      input.element.elementId,
    );
    const isGroupingTarget =
      isSelectedElement && args.selectedElementIds.length > 1;
    const isTableCellTarget = input.element.type === "table";
    if (
      !isGroupingTarget &&
      input.element.type !== "image" &&
      input.element.type !== "group" &&
      !isTableCellTarget
    )
      return;
    const { left, top } = getContextMenuPosition({
      clientX: input.clientX,
      clientY: input.clientY,
      height: isTableCellTarget ? 304 : 60,
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
    if (input.element.type === "table") {
      const activeTableCell = useEditorShellUiStore.getState().activeTableCell;
      if (
        !activeTableCell ||
        activeTableCell.elementId !== input.element.elementId ||
        activeTableCell.slideId !== input.slideId
      ) {
        return;
      }
      const actionStates = getTableContextActionStates({
        deck: args.workingDeckRef.current,
        element: input.element,
      });
      const actionDisabledReasons = Object.fromEntries(
        (
          [
            "insertRowAbove",
            "insertRowBelow",
            "insertColumnLeft",
            "insertColumnRight",
            "deleteRow",
            "deleteColumn",
          ] as const
        ).flatMap((action) =>
          actionStates[action].enabled
            ? []
            : [[action, actionStates[action].reason] as const],
        ),
      );
      args.setSelectedElementIds([input.element.elementId]);
      args.setElementContextMenu({
        actionDisabledReasons,
        columnIndex: activeTableCell.columnIndex,
        elementId: input.element.elementId,
        left,
        rowIndex: activeTableCell.rowIndex,
        slideId: input.slideId,
        top,
        type: "table-cell",
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
      ungroupElement,
    },
    refs: { copiedElementRef },
  };
}
