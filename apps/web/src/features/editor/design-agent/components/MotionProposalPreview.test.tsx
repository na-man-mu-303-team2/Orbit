import { createAnimationTimeline, createDemoDeck } from "@orbit/editor-core";
import type { DeckPatchOperation, Slide } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createMotionProposalPreviewModel,
  formatMotionProposalSummary,
  isMotionOnlyProposal,
} from "./motionProposalPreviewModel";
import { MotionProposalPreview } from "./MotionProposalPreview";

vi.mock("../../../slides/rendering", () => ({
  ReadOnlySlideCanvas: (props: {
    highlights?: Array<{ elementId: string }>;
  }) => (
    <div
      data-highlights={props.highlights?.map(({ elementId }) => elementId).join(",")}
      data-testid="motion-slide"
    />
  ),
}));

function createMotionSlide(): Slide {
  const deck = createDemoDeck();
  const slide = deck.slides[0]!;
  const [first, second, third] = slide.elements;
  return {
    ...slide,
    actions: [],
    animations: [
      {
        animationId: "anim_preview_entry",
        elementId: first!.elementId,
        type: "fade-in",
        order: 1,
        startMode: "on-slide-enter",
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out",
      },
      {
        animationId: "anim_preview_click",
        elementId: second!.elementId,
        type: "appear",
        order: 2,
        startMode: "on-click",
        durationMs: 300,
        delayMs: 0,
        easing: "ease-out",
      },
      {
        animationId: "anim_preview_follower",
        elementId: third!.elementId,
        type: "zoom-in",
        order: 3,
        startMode: "after-previous",
        durationMs: 300,
        delayMs: 0,
        easing: "ease-out",
      },
    ],
  };
}

describe("MotionProposalPreview", () => {
  it("derives summary and presenter steps from the canonical timeline", () => {
    const slide = createMotionSlide();
    const model = createMotionProposalPreviewModel(slide);
    const canonical = createAnimationTimeline({
      animations: slide.animations,
      targetElementIds: slide.elements.map((element) => element.elementId),
    });

    expect(model.entryCount).toBe(canonical.entryRoots.length);
    expect(model.clickCount).toBe(canonical.clickSteps.length);
    expect(model.totalDurationMs).toBe(canonical.totalDurationMs);
    expect(model.targetCount).toBe(3);
    expect(model.slideshowPlan.triggerSteps.map((step) => step.rootAnimationId)).toEqual(
      canonical.clickSteps.map((step) => step.rootAnimationId),
    );
    expect(formatMotionProposalSummary(model)).toBe(
      "자동 진입 1 · 클릭 1 · 대상 3개 · 예상 1.0초",
    );
  });

  it("routes only animation operations to the motion preview", () => {
    const animationOperation = {
      type: "delete_animation",
      slideId: "slide_1",
      animationId: "anim_1",
    } as DeckPatchOperation;
    const layoutOperation = {
      type: "update_slide_style",
      slideId: "slide_1",
      style: { layout: "title-content" },
    } as DeckPatchOperation;

    expect(isMotionOnlyProposal([animationOperation])).toBe(true);
    expect(isMotionOnlyProposal([animationOperation, layoutOperation])).toBe(false);
    expect(isMotionOnlyProposal([])).toBe(false);
  });

  it("renders playback, beat navigation, target status, and reduced-motion control", () => {
    const deck = createDemoDeck();
    const slide = createMotionSlide();
    const html = renderToStaticMarkup(
      <MotionProposalPreview
        deck={{ ...deck, slides: [slide, ...deck.slides.slice(1)] }}
        slide={slide}
      />,
    );

    expect(html).toContain("Motion 흐름 미리보기");
    expect(html).toContain("자동 진입 1 · 클릭 1 · 대상 3개 · 예상 1.0초");
    expect(html).toContain("처음으로");
    expect(html).toContain("재생");
    expect(html).toContain('aria-label="이전 beat"');
    expect(html).toContain('aria-label="다음 beat"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("현재 대상 1개");
    expect(html).toContain(`data-highlights="${slide.elements[0]!.elementId}"`);
  });
});
