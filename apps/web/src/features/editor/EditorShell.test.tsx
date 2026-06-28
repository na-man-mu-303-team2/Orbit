import { createDemoDeck } from "@orbit/editor-core";
import { demoIds } from "@orbit/shared";
import type { Deck } from "@orbit/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorShell, EditorStateNotice } from "./EditorShell";

vi.mock("react-konva", () => {
  const Group = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, _ref) => <div>{children}</div>
  );
  const Layer = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, _ref) => <div>{children}</div>
  );
  const Stage = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, _ref) => <div>{children}</div>
  );
  const Text = ({
    children,
    text
  }: {
    children?: ReactNode;
    text?: string;
  }) => <span>{text ?? children}</span>;

  return {
    Arrow: () => <span data-konva-arrow="true" />,
    Circle: () => null,
    Group,
    Image: () => null,
    Layer,
    Line: () => null,
    Rect: () => null,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => null,
    Stage,
    Text,
    Transformer: () => null
  };
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
}

function renderApp(queryClient: QueryClient) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <EditorShell />
    </QueryClientProvider>
  );
}

function setDeckData(queryClient: QueryClient, deck: Deck) {
  queryClient.setQueryData(["deck", demoIds.projectId], deck);
  queryClient.setQueryData(["health"], {
    app: "orbit-api",
    demo: demoIds,
    status: "ok"
  });
}

describe("editor shell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the project deck and slide navigator", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    setDeckData(queryClient, deck);

    const html = renderApp(queryClient);

    expect(html).toContain(deck.title);
    expect(html).toContain("Opening");
    expect(html).toContain("Data Contract");
    expect(html).toContain("발표 메모");
    expect(html).toContain("저장됨");
    expect(html).toContain("AI 편집 도우미");
    expect(html).toContain("이미지");
  });

  it("renders arrow, polygon, group, and custom shape elements on the canvas", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();
    const firstSlide = deck.slides[0];

    firstSlide.elements = [
      ...firstSlide.elements,
      {
        elementId: "el_11",
        type: "arrow",
        role: "decoration",
        x: 980,
        y: 520,
        width: 320,
        height: 28,
        rotation: 0,
        opacity: 1,
        zIndex: 10,
        locked: false,
        visible: true,
        props: {
          fill: "transparent",
          stroke: "#2563eb",
          strokeWidth: 4,
          borderRadius: 0
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_12",
        type: "polygon",
        role: "highlight",
        x: 1360,
        y: 500,
        width: 180,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 11,
        locked: false,
        visible: true,
        props: {
          fill: "#dbeafe",
          stroke: "#2563eb",
          strokeWidth: 3,
          borderRadius: 0,
          sides: 6
        } as Deck["slides"][number]["elements"][number]["props"]
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_13",
        type: "group",
        role: "decoration",
        x: 980,
        y: 590,
        width: 320,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 12,
        locked: false,
        visible: true,
        props: {
          childElementIds: ["el_1", "el_2"]
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_14",
        type: "customShape",
        role: "highlight",
        x: 980,
        y: 800,
        width: 280,
        height: 160,
        rotation: 0,
        opacity: 1,
        zIndex: 13,
        locked: false,
        visible: true,
        props: {
          fill: "#f5edff",
          stroke: "#9333ea",
          strokeWidth: 2,
          viewBoxHeight: 160,
          viewBoxWidth: 220,
          pathData:
            "M20 12 H200 C210 12 218 20 218 30 V96 C218 106 210 114 200 114 H92 L48 148 L56 114 H20 C10 114 2 106 2 96 V30 C2 20 10 12 20 12 Z"
        }
      } as Deck["slides"][number]["elements"][number]
    ];

    setDeckData(queryClient, deck);

    const html = renderApp(queryClient);

    expect(html).toContain("data-konva-arrow");
    expect(html).toContain("data-konva-polygon");
    expect(html).toContain("data-konva-shape");
    expect(html).toContain("GROUP");
  });

  it("keeps the demo deck visible while the deck query is pending", () => {
    const queryClient = createTestQueryClient();

    const html = renderApp(queryClient);

    expect(html).toContain("ORBIT Demo Deck");
    expect(html).toContain("Opening");
    expect(html).toContain("불러오는 중");
    expect(html).not.toContain("덱을 불러오는 중");
  });

  it("renders an empty deck state without a selected slide", () => {
    const queryClient = createTestQueryClient();
    const emptyDeck = {
      ...createDemoDeck(),
      slides: []
    } as Deck;

    setDeckData(queryClient, emptyDeck);

    const html = renderApp(queryClient);

    expect(html).toContain("슬라이드 없음");
    expect(html).toContain("현재 덱에는 슬라이드가 없습니다");
    expect(html).toContain("등록된 키워드 없음");
  });

  it("renders a deck load error state with demo fallback", () => {
    const html = renderToString(
      <EditorStateNotice
        isError
        isLoading={false}
        isUsingFallback
      />
    );

    expect(html).toContain("덱을 불러올 수 없음");
    expect(html).toContain("403/404 또는 네트워크 오류");
    expect(html).toContain("demo fallback");
  });
});
