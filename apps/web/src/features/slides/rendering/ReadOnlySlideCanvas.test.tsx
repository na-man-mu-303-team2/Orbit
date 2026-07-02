import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "../../rehearsal/presenter/__fixtures__/animationDeck";
import {
  buildSlideBackgroundStyle,
  getActiveHighlightElementIds,
  getRenderableSlideElements,
  ReadOnlySlideCanvas
} from "./index";

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
  const Layer = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
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
    Layer,
    Line: () => <span data-konva-line="true" />,
    Rect: (props: Record<string, unknown>) => <span {...attrs(props)} />,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
    Stage,
    Text
  };
});

describe("ReadOnlySlideCanvas", () => {
  const slide = p0AnimationDeck.slides[0]!;

  it("uses the same renderable element normalization as editor previews", () => {
    const elements = getRenderableSlideElements(slide, p0AnimationDeck.canvas);

    expect(elements.map((element) => element.elementId)).toContain("el_group");
    expect(elements.map((element) => element.elementId)).not.toContain("el_group_rect");
    expect(elements.map((element) => element.elementId)).not.toContain("el_group_label");
    expect(elements.map((element) => element.zIndex)).toEqual(
      [...elements.map((element) => element.zIndex)].sort((left, right) => left - right)
    );
  });

  it("matches editor slide background image behavior", () => {
    const style = buildSlideBackgroundStyle(slide, p0AnimationDeck);

    expect(style.backgroundColor).toBe("#f8fafc");
    expect(String(style.backgroundImage)).toContain("linear-gradient");
    expect(String(style.backgroundImage)).toContain(
      "/api/v1/projects/project_p0/assets/file_bg/content"
    );
    expect(style.backgroundSize).toBe("100% 100%, cover");
  });

  it("renders deck elements and persistent active highlights", () => {
    const html = renderToStaticMarkup(
      <ReadOnlySlideCanvas
        deck={p0AnimationDeck}
        highlights={[
          { elementId: "el_body", active: true },
          { elementId: "el_body", active: false },
          { elementId: "el_image", active: true }
        ]}
        slide={slide}
      />
    );

    expect(html).toContain("Slideshow Renderer");
    expect(html).toContain("읽기 전용 캔버스");
    expect(html).toContain("data-element-id=\"el_image\"");
    expect(html).toContain("data-highlight-element-id=\"el_image\"");
    expect(html).not.toContain("data-highlight-element-id=\"el_body\"");
  });

  it("applies presentation state to grouped child elements", () => {
    const html = renderToStaticMarkup(
      <ReadOnlySlideCanvas
        deck={p0AnimationDeck}
        elementStates={{
          el_group_label: {
            opacity: 0,
            visible: false
          }
        }}
        slide={slide}
      />
    );

    expect(html).toContain("data-element-id=\"el_group_label\"");
    expect(html).toContain("data-opacity=\"0\"");
  });

  it("renders active highlights for grouped child elements", () => {
    const html = renderToStaticMarkup(
      <ReadOnlySlideCanvas
        deck={p0AnimationDeck}
        highlights={[{ elementId: "el_group_label", active: true }]}
        slide={slide}
      />
    );

    expect(html).toContain("data-element-id=\"el_group_label\"");
    expect(html).toContain("data-highlight-element-id=\"el_group_label\"");
  });

  it("applies highlight events in order", () => {
    expect(
      [...getActiveHighlightElementIds([
        { elementId: "el_body", active: true },
        { elementId: "el_image", active: true },
        { elementId: "el_body", active: false }
      ])].sort()
    ).toEqual(["el_image"]);
  });
});
