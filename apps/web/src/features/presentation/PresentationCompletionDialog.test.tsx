import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PresentationCompletionDialog } from "./PresentationCompletionDialog";

const actions = {
  onClose: vi.fn(),
  onGoHome: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenReport: vi.fn(),
};

describe("PresentationCompletionDialog", () => {
  it("keeps report navigation disabled while presentation data is saving", () => {
    const html = renderToStaticMarkup(
      <PresentationCompletionDialog {...actions} isSaving />,
    );

    expect(html).toContain("발표를 마쳤어요");
    expect(html).toContain("발표 기록을 저장하고 있어요");
    expect(html).toContain("리포트 보기");
    expect(html).toContain("disabled");
  });

  it("shows the integrated report action after saving completes", () => {
    const html = renderToStaticMarkup(
      <PresentationCompletionDialog {...actions} isSaving={false} />,
    );

    expect(html).toContain("발표 결과 화면이 준비됐어요");
    expect(html).toContain("음성 분석 진행 상태와 청중 응답");
    expect(html).not.toContain("disabled");
  });
});
