import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorUndoToast } from "./EditorUndoToast";

describe("EditorUndoToast", () => {
  it("announces deletion and exposes exactly one undo action", () => {
    const html = renderToString(
      <EditorUndoToast message="슬라이드가 삭제되었습니다" onUndo={vi.fn()} />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("슬라이드가 삭제되었습니다");
    expect(html.match(/실행 취소/g)).toHaveLength(1);
  });
});
