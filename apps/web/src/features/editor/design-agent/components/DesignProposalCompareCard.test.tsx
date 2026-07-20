import { createDemoDeck } from "@orbit/editor-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesignProposalCompareCard } from "./DesignProposalCompareCard";

vi.mock("../../../slides/rendering", () => ({
  ReadOnlySlideCanvas: (props: { deck: { version: number } }) => (
    <div data-version={props.deck.version} data-testid="read-only-slide" />
  ),
}));

describe("DesignProposalCompareCard", () => {
  it("renders explicit Before and After labels from separate deck snapshots", () => {
    const beforeDeck = createDemoDeck();
    const afterDeck = { ...beforeDeck, version: beforeDeck.version + 1 };
    const html = renderToStaticMarkup(
      <DesignProposalCompareCard
        afterDeck={afterDeck}
        beforeDeck={beforeDeck}
        isApplying={false}
        isStale={false}
        slideId={beforeDeck.slides[0]!.slideId}
        summary="레이아웃을 정리했습니다."
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );

    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain(`data-version="${beforeDeck.version}"`);
    expect(html).toContain(`data-version="${afterDeck.version}"`);
    expect(html).toContain("미리보기");
  });

  it("announces stale state and blocks apply while keeping preview available", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(
      <DesignProposalCompareCard
        afterDeck={{ ...deck, version: deck.version + 1 }}
        beforeDeck={deck}
        isApplying={false}
        isStale
        slideId={deck.slides[0]!.slideId}
        summary="오래된 제안"
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );

    expect(html).toContain("원본이 변경된 제안");
    expect(html).toContain("다시 생성해 주세요");
    expect(html).toMatch(/<button class="primary" disabled=""[^>]*>적용<\/button>/);
    expect(html).toMatch(/<button type="button"><svg[^>]*>.*미리보기<\/button>/s);
  });
});
