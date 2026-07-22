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
        lifecycle="proposal-ready"
        operations={[]}
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
        lifecycle="stale"
        operations={[]}
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

  it("labels applying and failed retry states without relying on color", () => {
    const deck = createDemoDeck();
    const renderCard = (lifecycle: "applying" | "failed") =>
      renderToStaticMarkup(
        <DesignProposalCompareCard
          afterDeck={{ ...deck, version: deck.version + 1 }}
          beforeDeck={deck}
          lifecycle={lifecycle}
          operations={[]}
          slideId={deck.slides[0]!.slideId}
          summary="적용 상태"
          warnings={[]}
          onApply={() => undefined}
          onClose={() => undefined}
          onPreview={() => undefined}
        />,
      );

    const applyingHtml = renderCard("applying");
    const failedHtml = renderCard("failed");

    expect(applyingHtml).toContain("적용 중...");
    expect(applyingHtml).toMatch(/<button class="primary" disabled=""/);
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("제안 적용 실패");
    expect(failedHtml).toContain("다시 적용");
  });

  it("keeps an intermediate preview read-only", () => {
    const deck = createDemoDeck();
    const html = renderToStaticMarkup(
      <DesignProposalCompareCard
        afterDeck={{ ...deck, version: deck.version + 1 }}
        beforeDeck={deck}
        lifecycle="preview-read-only"
        operations={[]}
        readOnly
        slideId={deck.slides[0]!.slideId}
        summary="이미지 생성 전 레이아웃"
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );

    expect(html).toContain("읽기 전용 중간 미리보기");
    expect(html).toContain("최종 검토 중");
    expect(html).not.toMatch(/<button[^>]*>적용<\/button>/);
  });

  it("shows canonical motion summary instead of a static comparison", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const animation = slide.animations[0]!;
    const html = renderToStaticMarkup(
      <DesignProposalCompareCard
        afterDeck={{ ...deck, version: deck.version + 1 }}
        beforeDeck={deck}
        lifecycle="proposal-ready"
        operations={[
          {
            type: "update_animation",
            slideId: slide.slideId,
            animationId: animation.animationId,
            animation: { durationMs: animation.durationMs },
          },
        ]}
        slideId={slide.slideId}
        summary="등장 흐름을 정리했습니다."
        warnings={[]}
        onApply={() => undefined}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );

    expect(html).toContain("Motion 흐름");
    expect(html).toContain("자동 진입");
    expect(html).not.toContain("Before");
    expect(html).not.toContain("After");
  });
});
