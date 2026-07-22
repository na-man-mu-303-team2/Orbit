import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PptxImportPreferenceDialog } from "./PptxImportPreferenceDialog";

describe("PptxImportPreferenceDialog", () => {
  it("explains both trade-offs and starts with no implicit selection", () => {
    const html = renderToStaticMarkup(
      <PptxImportPreferenceDialog
        fileName="quarterly-review.pptx"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
      />
    );

    expect(html).toContain("원본 그대로 보기");
    expect(html).toContain("내용 편집하기");
    expect(html).toContain("이번 파일에만 적용");
    expect(html).not.toContain("checked=\"\"");
    expect(html).toContain("disabled=\"\"");
  });
});
