import { createDemoDeck } from "@orbit/editor-core";
import type { DeckElement } from "@orbit/shared";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorContextMenus } from "../../shell/components/EditorContextMenus";
import { SelectionQuickBar } from "../../shell/components/SelectionQuickBar";
import {
  editorShellUiInitialState,
  useEditorShellUiStore,
} from "../../shell/editorShellUiStore";

vi.mock("react-dom", () => ({
  createPortal: (content: ReactNode) => content,
}));

function tableElement(): Extract<DeckElement, { type: "table" }> {
  return {
    elementId: "el_table",
    height: 120,
    locked: false,
    opacity: 1,
    props: {
      borderColor: "#94A3B8",
      borderWidth: 1,
      columnWidths: [120, 180],
      rowHeights: [120],
      rows: [
        [
          {
            align: "left",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            colSpan: 1,
            fill: "#FFFFFF",
            fontSize: 18,
            fontWeight: "normal",
            rowSpan: 1,
            text: "A1",
            verticalAlign: "middle",
          },
          {
            align: "left",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            colSpan: 1,
            fill: "#FFFFFF",
            fontSize: 18,
            fontWeight: "normal",
            rowSpan: 1,
            text: "A2",
            verticalAlign: "middle",
          },
        ],
      ],
    },
    rotation: 0,
    type: "table",
    visible: true,
    width: 300,
    x: 100,
    y: 100,
    zIndex: 1,
  };
}

describe("table editor controls", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { body: {} });
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  afterEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
    vi.unstubAllGlobals();
  });

  it("shows selected-cell row and column actions with disabled reasons", () => {
    const html = renderToStaticMarkup(
      <EditorContextMenus
        elementContextMenu={{
          actionDisabledReasons: {
            deleteColumn: "마지막 열은 삭제할 수 없습니다.",
          },
          columnIndex: 0,
          elementId: "el_table",
          left: 10,
          rowIndex: 1,
          slideId: "slide_1",
          top: 20,
          type: "table-cell",
        }}
        isImageUploadPending={false}
        isShapeMenuOpen={false}
        onCloseElementContextMenu={vi.fn()}
        onCloseShapeMenu={vi.fn()}
        onCreateGroup={vi.fn()}
        onInsertShape={vi.fn()}
        onReplaceImage={vi.fn()}
        onUngroup={vi.fn()}
        shapeMenuPosition={null}
      />,
    );

    expect(html).toContain("위에 행 추가");
    expect(html).toContain("아래에 행 추가");
    expect(html).toContain("왼쪽에 열 추가");
    expect(html).toContain("오른쪽에 열 추가");
    expect(html).toContain("현재 행 삭제");
    expect(html).toContain("현재 열 삭제");
    expect(html).toContain("마지막 열은 삭제할 수 없습니다.");
  });

  it("removes the raw TSV field while retaining table border controls and cell editing", () => {
    const deck = createDemoDeck();
    const element = tableElement();
    useEditorShellUiStore.getState().setActiveTableCell({
      cellEditDisabledReason: null,
      columnIndex: 1,
      elementId: element.elementId,
      rowIndex: 0,
      slideId: deck.slides[0]!.slideId,
    });

    const html = renderToStaticMarkup(
      <SelectionQuickBar
        animationDiagnostics={{
          danglingAnimations: [],
          duplicateOrders: [],
          selectedElementEmpty: false,
        }}
        animations={[]}
        canCreateAnimation={false}
        canvas={deck.canvas}
        customShapeEditActive={false}
        element={element}
        elementPropertiesCapability={{
          enabled: true,
          reason: null,
          reasonCode: "SUPPORTED",
        }}
        onChangeFrame={vi.fn()}
        onChangeProps={vi.fn()}
        onChangeSlideStyle={vi.fn()}
        onChangeTheme={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onOpenAnimationEditor={vi.fn()}
        onToggleCustomShapeClosed={vi.fn()}
        onToggleCustomShapeEdit={vi.fn()}
        selectedKeywordLabel={null}
        showIds={false}
        slide={deck.slides[0]!}
        theme={deck.theme}
      />,
    );

    expect(html).not.toContain("표 내용");
    expect(html).not.toContain("행은 줄바꿈");
    expect(html).toContain("셀 편집");
    expect(html).toContain("선두께");
  });
});
