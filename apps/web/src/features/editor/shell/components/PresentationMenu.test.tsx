import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PresentationMenu } from "./PresentationMenu";

function getButtonTag(html: string, attribute: string) {
  return html.match(new RegExp(`<button[^>]*${attribute}[^>]*>`))?.[0] ?? "";
}

describe("PresentationMenu", () => {
  it("발표 준비 중에도 청중 링크 메뉴는 열 수 있다", () => {
    const html = renderToStaticMarkup(
      <PresentationMenu
        activeStartAction="presentation"
        canCreatePresentationSession
        canOpenAudienceLink
        canStartPersonalRehearsal
        isOpen
        onOpenAudienceLink={vi.fn()}
        onStartPresentation={vi.fn()}
        onStartRehearsal={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(getButtonTag(html, 'aria-label="발표 메뉴 열기"')).not.toContain(
      "disabled",
    );
    expect(getButtonTag(html, 'class="editor-present-button"')).toContain(
      "disabled",
    );
    expect(getButtonTag(html, 'class="editor-rehearsal-button"')).toContain(
      "disabled",
    );
    expect(html).toContain("청중 링크·QR");
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
  });

  it("청중 링크를 사용할 수 없으면 메뉴 버튼을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <PresentationMenu
        canCreatePresentationSession
        canOpenAudienceLink={false}
        canStartPersonalRehearsal
        isOpen={false}
        onOpenAudienceLink={vi.fn()}
        onStartPresentation={vi.fn()}
        onStartRehearsal={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(getButtonTag(html, 'aria-label="발표 메뉴 열기"')).toContain(
      "disabled",
    );
  });

  it("리허설 준비 상태를 보조 기술에 알린다", () => {
    const html = renderToStaticMarkup(
      <PresentationMenu
        activeStartAction="rehearsal"
        canCreatePresentationSession
        canOpenAudienceLink
        canStartPersonalRehearsal
        isOpen={false}
        onOpenAudienceLink={vi.fn()}
        onStartPresentation={vi.fn()}
        onStartRehearsal={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    const button = getButtonTag(html, 'class="editor-rehearsal-button"');
    expect(button).toContain('aria-busy="true"');
    expect(button).toContain('aria-live="polite"');
    expect(html).toContain("준비 중");
  });
});
