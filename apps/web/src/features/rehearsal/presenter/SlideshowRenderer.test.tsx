import fs from "node:fs";
import path from "node:path";
import type { DeckAnimation } from "@orbit/shared";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { SlideshowRenderer } from "./SlideshowRenderer";
import type { SlideshowRuntimeSnapshot } from "./slideshowRuntime";

vi.mock("react-konva", () => {
  function attrs(props: Record<string, unknown>) {
    return {
      "data-element-id":
        typeof props["data-element-id"] === "string"
          ? props["data-element-id"]
          : undefined,
      "data-highlight-element-id":
        typeof props["data-highlight-element-id"] === "string"
          ? props["data-highlight-element-id"]
          : undefined,
      "data-opacity":
        typeof props.opacity === "number" ? String(props.opacity) : undefined,
      "data-testid":
        typeof props["data-testid"] === "string" ? props["data-testid"] : undefined
    };
  }

  type MockKonvaProps = { children?: ReactNode; [key: string]: any };

  const Group = forwardRef<HTMLDivElement, MockKonvaProps>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...attrs(props)}>
        {children}
      </div>
    )
  );
  const Stage = forwardRef<HTMLDivElement, MockKonvaProps>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...attrs(props)}>
        {children}
      </div>
    )
  );
  const Text = ({ text }: { text?: string }) => <span>{text}</span>;

  return {
    Arrow: () => <span data-konva-arrow="true" />,
    Circle: () => <span data-konva-circle="true" />,
    Group,
    Image: () => <span data-konva-image="true" />,
    Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Line: () => <span data-konva-line="true" />,
    Rect: (props: Record<string, unknown>) => <span {...attrs(props)} />,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
    Stage,
    Text
  };
});

describe("SlideshowRenderer", () => {
  const runtime: SlideshowRuntimeSnapshot = {
    executedAnimationIds: [],
    isComplete: false,
    stepIndex: 1,
    triggerAnimationIds: ["anim_image_zoom_in", "anim_group_fade_out"]
  };

  it("renders from runtime snapshot props without presenter-only dependencies", () => {
    const html = renderToStaticMarkup(
      <SlideshowRenderer
        deck={p0AnimationDeck}
        highlights={[{ elementId: "el_image", active: true }]}
        runtime={runtime}
        slideId="slide_p0_1"
      />
    );

    expect(html).toContain("data-slide-id=\"slide_p0_1\"");
    expect(html).toContain("data-step-index=\"1\"");
    expect(html).toContain("data-highlight-element-id=\"el_image\"");
    expect(html).toContain("Slideshow Renderer");
  });

  it("handles missing slides with a Korean status message", () => {
    const html = renderToStaticMarkup(
      <SlideshowRenderer
        deck={p0AnimationDeck}
        runtime={{
          executedAnimationIds: [],
          isComplete: true,
          stepIndex: 0,
          triggerAnimationIds: []
        }}
        slideId="slide_missing"
      />
    );

    expect(html).toContain("슬라이드를 찾을 수 없습니다.");
  });

  it("falls back to thumbnailUrl when a slide has no renderable elements", () => {
    const thumbnailDeck = {
      ...p0AnimationDeck,
      slides: [
        {
          ...p0AnimationDeck.slides[0]!,
          animations: [],
          elements: [],
          slideId: "slide_thumbnail_only",
          thumbnailUrl: "/slides/thumb.png",
          title: "Imported slide"
        }
      ]
    };
    const html = renderToStaticMarkup(
      <SlideshowRenderer
        deck={thumbnailDeck}
        runtime={{
          executedAnimationIds: [],
          isComplete: true,
          stepIndex: 0,
          triggerAnimationIds: []
        }}
        slideId="slide_thumbnail_only"
      />
    );

    expect(html).toContain("class=\"slideshow-renderer-thumbnail\"");
    expect(html).toContain("src=\"/slides/thumb.png\"");
    expect(html).not.toContain("data-testid=\"read-only-slide-stage\"");
  });

  it("starts first presenter render from entry animation start state", () => {
    const html = renderToStaticMarkup(
      <SlideshowRenderer
        deck={p0AnimationDeck}
        runtime={{
          executedAnimationIds: [],
          isComplete: false,
          stepIndex: 0,
          triggerAnimationIds: []
        }}
        slideId="slide_p0_1"
      />
    );

    expect(html).toContain("data-element-id=\"el_title\" data-opacity=\"0\"");
  });

  it("restores settled state on first slide-window render", () => {
    const html = renderToStaticMarkup(
      <SlideshowRenderer
        deck={p0AnimationDeck}
        renderMode="slide-window"
        runtime={{
          executedAnimationIds: [],
          isComplete: true,
          stepIndex: 0,
          triggerAnimationIds: []
        }}
        slideId="slide_p0_1"
      />
    );

    expect(html).toContain("data-element-id=\"el_title\" data-opacity=\"1\"");
  });

  it("keeps grouped targets hidden before a trigger fade-in executes", () => {
    const groupFadeInAnimation: DeckAnimation = {
      animationId: "anim_group_fade_in",
      elementId: "el_group",
      type: "fade-in",
      order: 12,
      durationMs: 300,
      delayMs: 0,
      easing: "ease-out"
    };
    const groupFadeInDeck = {
      ...p0AnimationDeck,
      slides: [
        {
          ...p0AnimationDeck.slides[0]!,
          animations: [
            ...p0AnimationDeck.slides[0]!.animations.filter(
              (animation) => animation.elementId !== "el_group"
            ),
            groupFadeInAnimation
          ]
        },
        ...p0AnimationDeck.slides.slice(1)
      ]
    };
    const html = renderToStaticMarkup(
      <SlideshowRenderer
        deck={groupFadeInDeck}
        runtime={{
          executedAnimationIds: [],
          isComplete: false,
          stepIndex: 0,
          triggerAnimationIds: ["anim_group_fade_in"]
        }}
        slideId="slide_p0_1"
      />
    );

    expect(html).toContain("data-element-id=\"el_group\" data-opacity=\"0\"");
  });

  it("keeps renderer imports away from editor interaction modules", () => {
    const filesToCheck = [
      "src/features/rehearsal/presenter/SlideshowRenderer.tsx",
      "src/features/slides/rendering/ReadOnlySlideCanvas.tsx",
      "src/features/slides/rendering/elementRendering.tsx"
    ];
    const forbiddenPatterns = [
      "EditableElementNode",
      "InlineTextEditorOverlay",
      "useCanvasKeyboardShortcuts",
      "useCanvasStageInteractions",
      "Transformer"
    ];

    for (const file of filesToCheck) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");

      for (const pattern of forbiddenPatterns) {
        expect(source).not.toContain(pattern);
      }
    }
  });

  it("accepts runtime snapshot as the only playback input", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/features/rehearsal/presenter/SlideshowRenderer.tsx"
      ),
      "utf8"
    );

    expect(source).toContain("runtime: SlideshowRuntimeSnapshot");
    expect(source).not.toContain("stepIndex?:");
    expect(source).not.toContain("triggerAnimationIds?:");
  });
});
