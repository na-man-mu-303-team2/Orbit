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
        operations={[]}
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
        operations={[]}
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

  it("keeps an intermediate preview read-only without rendering apply", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(
      <DesignProposalPreviewModal
        afterDeck={{ ...deck, version: deck.version + 1 }}
        beforeDeck={deck}
        lifecycle="preview-read-only"
        operations={[]}
        readOnly
        slideId={deck.slides[0]!.slideId}
        summary="이미지를 준비하는 동안 확인할 수 있는 중간 미리보기"
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("AI 디자인 중간 미리보기");
    expect(html).toContain("최종 검토 후 적용할 수 있습니다.");
    expect(html).not.toMatch(/<button[^>]*><span>적용<\/span><\/button>/);
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  it("routes an animation-only proposal to the canonical motion preview", () => {
    const deck = createDemoDeck();
    const animation = deck.slides[0]!.animations[0]!;
    const html = renderToStaticMarkup(
      <DesignProposalPreviewModal
        afterDeck={{ ...deck, version: deck.version + 1 }}
        beforeDeck={deck}
        lifecycle="proposal-ready"
        operations={[
          {
            type: "update_animation",
            slideId: deck.slides[0]!.slideId,
            animationId: animation.animationId,
            animation: { durationMs: animation.durationMs },
          },
        ]}
        slideId={deck.slides[0]!.slideId}
        summary="등장 흐름을 정리했습니다."
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("AI Motion 제안 미리보기");
    expect(html).toContain("Motion 흐름 미리보기");
    expect(html).not.toContain("Before");
    expect(html).not.toContain("After");
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
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.motion-proposal-preview-header\s*\{[^}]*flex-direction:\s*column;/,
    );
  });
});
