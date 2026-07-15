import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EditorSaveControl } from "./EditorSaveControl";

describe("EditorSaveControl", () => {
  it("announces normal preparation status politely", () => {
    const html = renderToStaticMarkup(
      <EditorSaveControl
        isSaving
        lastSavedAtLabel={null}
        onSave={vi.fn()}
        statusLabel="리허설 준비 중"
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("리허설 준비 중");
  });

  it("announces blocking snapshot failure and its recovery action", () => {
    const html = renderToStaticMarkup(
      <EditorSaveControl
        isSaving={false}
        lastSavedAtLabel={null}
        onSave={vi.fn()}
        recoveryHint="상단 리허설 버튼으로 다시 시도"
        statusLabel="리허설 준비 실패"
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("상단 리허설 버튼으로 다시 시도");
  });
});
