import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  editorShellUiInitialState,
  useEditorShellUiStore,
} from "../../shell/editorShellUiStore";

describe("table editor UI state", () => {
  beforeEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  afterEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  it("keeps slide, element, row, and column identity in cell selection and context menu state", () => {
    const state = useEditorShellUiStore.getState();
    state.setActiveTableCell({
      cellEditDisabledReason: null,
      columnIndex: 3,
      elementId: "el_table",
      rowIndex: 2,
      slideId: "slide_1",
    });
    state.setElementContextMenu({
      actionDisabledReasons: {},
      columnIndex: 3,
      elementId: "el_table",
      left: 20,
      rowIndex: 2,
      slideId: "slide_1",
      top: 30,
      type: "table-cell",
    });

    expect(useEditorShellUiStore.getState().activeTableCell).toMatchObject({
      columnIndex: 3,
      elementId: "el_table",
      rowIndex: 2,
      slideId: "slide_1",
    });
    expect(useEditorShellUiStore.getState().elementContextMenu).toMatchObject({
      columnIndex: 3,
      elementId: "el_table",
      rowIndex: 2,
      slideId: "slide_1",
      type: "table-cell",
    });
  });

  it("clears pending table edits with the project-scoped UI reset", () => {
    const state = useEditorShellUiStore.getState();
    state.setActiveTableCell({
      cellEditDisabledReason: null,
      columnIndex: 0,
      elementId: "el_table",
      rowIndex: 0,
      slideId: "slide_1",
    });
    state.setTableOperationRequest({
      action: "deleteRow",
      columnIndex: 0,
      elementId: "el_table",
      rowIndex: 0,
      slideId: "slide_1",
    });

    state.resetProjectUiState();

    expect(useEditorShellUiStore.getState().activeTableCell).toBeNull();
    expect(useEditorShellUiStore.getState().tableOperationRequest).toBeNull();
  });

  it("keeps the active cell while its table is selected and clears it when selection moves away", () => {
    const state = useEditorShellUiStore.getState();
    state.setActiveTableCell({
      cellEditDisabledReason: null,
      columnIndex: 1,
      elementId: "el_table",
      rowIndex: 0,
      slideId: "slide_1",
    });

    state.setSelectedElementIds(["el_table"]);
    expect(useEditorShellUiStore.getState().activeTableCell).toMatchObject({
      columnIndex: 1,
      elementId: "el_table",
      rowIndex: 0,
    });

    useEditorShellUiStore.getState().setSelectedElementIds(["el_other"]);
    expect(useEditorShellUiStore.getState().activeTableCell).toBeNull();
  });
});
