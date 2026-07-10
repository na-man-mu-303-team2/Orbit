import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createDemoDeck } from "@orbit/editor-core";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PresentationWorkspace } from "./PresentationWorkspace";

const presentationWorkspaceSourcePath = fileURLToPath(
  new URL("./PresentationWorkspace.tsx", import.meta.url),
);

vi.mock("react-konva", () => {
  const Group = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>,
  );
  const Stage = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>,
  );
  const Text = ({ text }: { text?: string }) => <span>{text}</span>;

  return {
    Arrow: () => <span data-konva-arrow="true" />,
    Circle: () => <span data-konva-circle="true" />,
    Group,
    Image: () => <span data-konva-image="true" />,
    Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Line: () => <span data-konva-line="true" />,
    Rect: () => <span data-konva-rect="true" />,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
    Stage,
    Text,
  };
});

describe("PresentationWorkspace", () => {
  it("renders a presentation shell copied from the rehearsal workspace", () => {
    const html = renderToStaticMarkup(
      <PresentationWorkspace initialDeck={createDemoDeck()} />,
    );

    expect(html).toContain("발표");
    expect(html).toContain("발표 종료");
    expect(html).toContain("다음 슬라이드");
    expect(html).toContain("발표 시간");
    expect(html).toContain("키워드");
    expect(html).toContain("대본");
    expect(html).toContain('class="rehearsal-presenter-shell orbit-live-presenter-shell"');
    expect(html).toContain('alt="ORBIT"');
    expect(html).not.toContain("Live STT");
    expect(html).not.toContain("Report AI");
    expect(html).not.toContain("청중 수");
    expect(html).not.toContain("질문 0개");
  });

  it("delegates the presentation view to a dedicated screen component", () => {
    const source = fs.readFileSync(presentationWorkspaceSourcePath, "utf8");

    expect(source).toContain("<PresentationScreen");
    expect(source).not.toContain('<header className="rehearsal-presenter-topbar">');
    expect(source).not.toContain('<section className="rehearsal-presenter-layout">');
  });
});
