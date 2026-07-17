import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorContextMenus } from "./EditorContextMenus";

vi.mock("react-dom", () => ({
  createPortal: (content: ReactNode) => content,
}));

describe("EditorContextMenus capability gates", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { body: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables an unsupported image replacement and displays its reason", () => {
    const reason = "원본 이미지를 안전하게 교체할 수 없습니다.";
    const html = renderToStaticMarkup(
      <EditorContextMenus
        elementActionDisabledReasons={{ imageReplace: reason }}
        elementContextMenu={{
          elementId: "el_image_1",
          left: 10,
          slideId: "slide_1",
          top: 20,
          type: "image",
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

    expect(html).toMatch(
      new RegExp(
        `class="element-context-menu-item" disabled=""[^>]*title="${reason}"`,
      ),
    );
    expect(html).toContain(`<small>${reason}</small>`);
  });

  it("disables unsupported grouping and ungrouping actions", () => {
    for (const [elementContextMenu, disabledReasons] of [
      [
        {
          elementIds: ["el_1", "el_2"] as string[],
          left: 10,
          slideId: "slide_1",
          top: 20,
          type: "selection" as const,
        },
        { group: "그룹 생성은 지원되지 않습니다." },
      ],
      [
        {
          elementId: "el_group_1",
          left: 10,
          slideId: "slide_1",
          top: 20,
          type: "group" as const,
        },
        { ungroup: "그룹 해제는 지원되지 않습니다." },
      ],
    ] as const) {
      const reason = disabledReasons.group ?? disabledReasons.ungroup;
      const html = renderToStaticMarkup(
        <EditorContextMenus
          elementActionDisabledReasons={disabledReasons}
          elementContextMenu={elementContextMenu}
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

      expect(html).toContain("disabled");
      expect(html).toContain(`<small>${reason}</small>`);
    }
  });
});
