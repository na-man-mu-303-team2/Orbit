import { createDemoDeck } from "@orbit/editor-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesignProposalPreviewModal } from "./DesignProposalPreviewModal";

vi.mock("../../canvas/EditorCanvas", () => ({
  EditableCanvas: () => <div data-testid="proposal-canvas" />,
  getRenderableSlideElements: () => []
}));

describe("DesignProposalPreviewModal", () => {
  it("renders slide style changes behind the proposal elements", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    slide.style.backgroundColor = "#0000FF";

    const html = renderToStaticMarkup(
      <DesignProposalPreviewModal
        deck={deck}
        isApplying={false}
        slideId={slide.slideId}
        summary="배경색을 파란색으로 변경합니다."
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(html).toContain("design-proposal-stage-shell");
    expect(html).toContain("background-color:#0000FF");
    expect(html).toContain('data-testid="proposal-canvas"');
  });

  it("disables apply and displays the fail-closed reason", () => {
    const deck = createDemoDeck();
    const reason = "원본 OOXML 구조에서 이 편집을 안전하게 보존할 수 없습니다.";
    const html = renderToStaticMarkup(
      <DesignProposalPreviewModal
        deck={deck}
        isApplying={false}
        mutationDisabledReason={reason}
        slideId={deck.slides[0]!.slideId}
        summary="지원하지 않는 변경"
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(html).toContain(`<p class="design-proposal-warning" role="status">${reason}</p>`);
    expect(html).toMatch(
      new RegExp(`class="primary" disabled="" title="${reason}"`)
    );
  });
});
