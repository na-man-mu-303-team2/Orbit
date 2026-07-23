import { createDemoDeck } from "@orbit/editor-core";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesignProposalPreviewModal } from "./DesignProposalPreviewModal";

vi.mock("../../../slides/rendering", () => ({
  ReadOnlySlideCanvas: (props: { deck: { version: number } }) => (
    <div data-version={props.deck.version} data-testid="read-only-slide" />
  ),
}));

describe("DesignProposalPreviewModal", () => {
  it("renders simultaneous Before and After snapshots in the accessible dialog", () => {
    const beforeDeck = createDemoDeck();
    const afterDeck = { ...beforeDeck, version: beforeDeck.version + 1 };
    const html = renderToStaticMarkup(
      <DesignProposalPreviewModal
        afterDeck={afterDeck}
        beforeDeck={beforeDeck}
        lifecycle="proposal-ready"
        slideId={beforeDeck.slides[0]!.slideId}
        summary="레이아웃을 정리했습니다."
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("redesign-dark design-proposal-preview-portal");
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("data-orbit-dialog-initial");
    expect(html).toContain('aria-label="닫기"');
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain(`data-version="${beforeDeck.version}"`);
    expect(html).toContain(`data-version="${afterDeck.version}"`);
  });

  it("keeps comparison visible and disables apply when stale", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(
      <DesignProposalPreviewModal
        afterDeck={{ ...deck, version: deck.version + 1 }}
        beforeDeck={deck}
        lifecycle="stale"
        slideId={deck.slides[0]!.slideId}
        summary="오래된 제안"
        warnings={["일부 요소는 변경하지 않았습니다."]}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("이 제안은 적용할 수 없습니다");
    expect(html).toContain("일부 요소는 변경하지 않았습니다.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*><span>적용<\/span><\/button>/);
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  it("stacks the simultaneous comparison at a narrow viewport", () => {
    const css = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/features/editor/design-agent/design-assistant.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.design-proposal-modal-comparison\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.design-proposal-modal-comparison\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });
});
