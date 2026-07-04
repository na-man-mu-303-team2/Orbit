import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { getSingleScreenScale, SingleScreenPresenter } from "./SingleScreenPresenter";

vi.mock("react-konva", () => {
  function attrs(props: Record<string, unknown>) {
    return {
      "data-element-id":
        typeof props["data-element-id"] === "string"
          ? props["data-element-id"]
          : undefined,
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

const singleScreenPresenterSourcePath = fileURLToPath(
  new URL("./SingleScreenPresenter.tsx", import.meta.url)
);

describe("SingleScreenPresenter", () => {
  it("renders the slide with only approved timer overlay content", () => {
    const html = renderToStaticMarkup(
      <SingleScreenPresenter
        deck={p0AnimationDeck}
        onExit={() => {}}
        slideElapsedLabel="00:12"
        slideId="slide_p0_1"
        slideTargetLabel="01:00"
        stepIndex={1}
        totalTimeLabel="03:20"
        triggerAnimationIds={["anim_image_zoom_in"]}
      />
    );

    expect(html).toContain("단일 화면 슬라이드");
    expect(html).toContain("전체");
    expect(html).toContain("03:20");
    expect(html).toContain("현재 슬라이드");
    expect(html).toContain("00:12");
    expect(html).toContain("01:00");
    expect(html).toContain("전체화면 시작");
    expect(html).not.toContain("첫 문장입니다");
    expect(html).not.toContain("Partial transcript");
    expect(html).not.toContain("키워드 체크리스트");
    expectNoAutoAdvancePresenterStatus(html);
  });

  it("hides fullscreen controls after fullscreen is active", () => {
    const html = renderToStaticMarkup(
      <SingleScreenPresenter
        deck={p0AnimationDeck}
        isFullscreen={true}
        onExit={() => {}}
        slideElapsedLabel="00:12"
        slideId="slide_p0_1"
        slideTargetLabel="01:00"
        stepIndex={1}
        totalTimeLabel="03:20"
        triggerAnimationIds={["anim_image_zoom_in"]}
      />
    );

    expect(html).toContain("발표 타이머");
    expect(html).not.toContain("전체화면 시작");
    expect(html).not.toContain("단일 화면 종료");
    expectNoAutoAdvancePresenterStatus(html);
  });

  it("calculates fullscreen scale from the viewport", () => {
    expect(getSingleScreenScale(p0AnimationDeck, { height: 540, width: 960 })).toBe(0.5);
  });

  it("does not import presenter-only auto advance status UI", () => {
    const source = fs.readFileSync(singleScreenPresenterSourcePath, "utf8");

    expect(source).not.toContain("AutoAdvanceStatus");
    expect(source).not.toContain("auto-advance-status");
  });
});

function expectNoAutoAdvancePresenterStatus(html: string) {
  expect(html).not.toContain("자동 전환까지");
  expect(html).not.toContain("빌드 2개 남음");
  expect(html).not.toContain("발표 종료 준비됨");
  expect(html).not.toContain("수동으로 넘겨주세요");
  expect(html).not.toContain("auto-advance-status");
}
