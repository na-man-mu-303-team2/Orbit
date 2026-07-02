import { applyDeckPatch, createDemoDeck } from "@orbit/editor-core";
import { demoIds } from "@orbit/shared";
import type {
  AiSuggestion,
  Deck,
  DeckElement,
  ListAiSuggestionsResponse
} from "@orbit/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EditorShell,
  EditorStateNotice,
  createDistributeSelectionPatch,
  getEditorValidationItems,
  mergeDeckIntoQueryCache,
  shouldApplyManualSaveResult,
  shouldHydrateDeckFromQuery,
  uploadAndImportPptxTemplate
} from "./EditorShell";
import { createShrinkToFitTextProps } from "./components/SelectionQuickBar";
import { resolveEditorAssetUrl } from "../shared/editorAssetUrl";
import { aiSuggestionsQueryKey } from "../suggestions/api/suggestionApi";

vi.mock("react-konva", () => {
  function shapeAttrs(props: Record<string, unknown>) {
    return {
      "data-corner-radius":
        props.cornerRadius === undefined ? undefined : String(props.cornerRadius),
      "data-fill": typeof props.fill === "string" ? props.fill : undefined,
      "data-stroke": typeof props.stroke === "string" ? props.stroke : undefined,
      "data-stroke-width":
        props.strokeWidth === undefined ? undefined : String(props.strokeWidth)
    };
  }

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
    Circle: () => <span data-konva-circle="true" />,
    Group,
    Image: () => <span data-konva-image="true" />,
    Layer,
    Line: (props: Record<string, unknown>) => (
      <span data-konva-line="true" {...shapeAttrs(props)} />
    ),
    Rect: (props: Record<string, unknown>) => (
      <span data-konva-rect="true" {...shapeAttrs(props)} />
    ),
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
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

function renderApp(queryClient: QueryClient, projectId?: string) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <EditorShell projectId={projectId} />
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

  it("rewrites local minio asset URLs to the same-origin asset proxy", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://127.0.0.1:5173"
      }
    });

    expect(
      resolveEditorAssetUrl(
        "http://localhost:9000/orbit-local/projects/project_real_1/assets/file_real_1/slide_1-v8.png",
      ),
    ).toBe(
      "http://127.0.0.1:5173/api/v1/projects/project_real_1/assets/file_real_1/content",
    );
    expect(
      resolveEditorAssetUrl(
        "http://localhost:9000/orbit-local/projects/project_real_1/assets/file_real_2-slide_2-v8.png",
      ),
    ).toBe(
      "http://127.0.0.1:5173/api/v1/projects/project_real_1/assets/file_real_2/content",
    );
    expect(
      resolveEditorAssetUrl(
        "http://localhost:9000/orbit-local/projects/project_real_1/assets/file_550e8400-e29b-41d4-a716-446655440000-slide_3-v8.png",
      ),
    ).toBe(
      "http://127.0.0.1:5173/api/v1/projects/project_real_1/assets/file_550e8400-e29b-41d4-a716-446655440000/content",
    );
    expect(
      resolveEditorAssetUrl(
        "http://localhost:5173/api/v1/projects/project_real_1/assets/file_real_3/content",
      ),
    ).toBe(
      "http://127.0.0.1:5173/api/v1/projects/project_real_1/assets/file_real_3/content",
    );
  });

  it("renders the project deck and slide navigator", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    setDeckData(queryClient, deck);

    const html = renderApp(queryClient);

    expect(html).toContain(deck.title);
    expect(html).toContain("Opening");
    expect(html).not.toContain("Data Contract");
    expect(html).toContain("발표 메모");
    expect(html).toContain("저장됨");
    expect(html).toContain("AI 제안 검토");
    expect(html).toContain("이미지");
    expect(html).toContain('data-testid="editor-slide-quickbar"');
    expect(html).toContain("테마 배경");
  });

  it("returns a warning for unreadable text overlap", () => {
    const deck = createDemoDeck();
    deck.slides[0].elements = [
      editorTextElement("text_a", 100, 100, "본문 A"),
      editorTextElement("text_b", 150, 120, "본문 B")
    ];

    const items = getEditorValidationItems(deck, deck.slides[0]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      elementIds: ["text_a", "text_b"],
      level: "warning",
      slideId: deck.slides[0].slideId
    });
  });

  it("does not warn for small decorative text overlap", () => {
    const deck = createDemoDeck();
    deck.slides[0].elements = [
      editorTextElement("text_a", 100, 100, "본문 A"),
      editorTextElement("text_b", 370, 100, "본문 B")
    ];

    expect(getEditorValidationItems(deck, deck.slides[0])).toEqual([]);
  });

  it("loads AI suggestions with the route project id", () => {
    const queryClient = createTestQueryClient();
    const projectId = "project_real_1";
    const deck = {
      ...createDemoDeck(),
      projectId
    } as Deck;
    const slideId = deck.slides[0].slideId;
    const suggestion = {
      suggestionId: "suggestion_real_project",
      projectId,
      deckId: deck.deckId,
      slideId,
      baseVersion: deck.version,
      title: "실제 프로젝트 제안",
      summary: "라우트 projectId로 조회한 제안입니다.",
      patch: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "ai",
        operations: [
          {
            type: "update_speaker_notes",
            slideId,
            speakerNotes: "현재 프로젝트의 발표 메모를 개선합니다."
          }
        ]
      },
      status: "pending",
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:01.000Z"
    } satisfies AiSuggestion;
    const response = {
      projectId,
      suggestions: [suggestion]
    } satisfies ListAiSuggestionsResponse;

    queryClient.setQueryData(["deck", projectId], deck);
    queryClient.setQueryData(["health"], {
      app: "orbit-api",
      demo: demoIds,
      status: "ok"
    });
    queryClient.setQueryData(
      aiSuggestionsQueryKey(projectId, {
        deckId: deck.deckId,
        slideId
      }),
      response
    );

    const html = renderApp(queryClient, projectId);

    expect(html).toContain("실제 프로젝트 제안");
    expect(html).not.toContain("현재 슬라이드에 검토할 AI 제안이 없습니다.");
  });

  it("uploads a PPTX file, creates an import job, and polls until completion", async () => {
    const file = new File(["pptx"], "template.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });
    const phases: string[] = [];
    let jobPollCount = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/assets/upload-url")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          originalName: "template.pptx",
          purpose: "pptx-import"
        });
        return new Response(
          JSON.stringify({
            fileId: "file_template",
            projectId: "project-a",
            uploadUrl: "http://storage.local/upload",
            method: "PUT",
            headers: {
              "content-type":
                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            },
            expiresAt: "2026-07-03T00:15:00.000Z",
            purpose: "pptx-import"
          })
        );
      }

      if (url === "http://storage.local/upload") {
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBe(file);
        return new Response(null, { status: 200 });
      }

      if (url.endsWith("/assets/complete")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            fileId: "file_template",
            projectId: "project-a",
            originalName: "template.pptx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            size: 4,
            url: "/api/v1/projects/project-a/assets/file_template/content",
            purpose: "pptx-import",
            createdAt: "2026-07-03T00:00:00.000Z"
          })
        );
      }

      if (url.endsWith("/pptx-imports")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ fileId: "file_template" });
        return new Response(JSON.stringify({ job: jobPayload("queued") }));
      }

      if (url.endsWith("/jobs/job-pptx")) {
        jobPollCount += 1;
        return new Response(
          JSON.stringify(
            jobPayload(jobPollCount === 1 ? "running" : "succeeded", {
              deckId: "deck_import_file_template",
              templateId: "template_file_template",
              qualityReport: qualityReport(),
              warnings: ["pixel renderer unavailable"]
            })
          )
        );
      }

      return new Response("unexpected request", { status: 500 });
    });

    await expect(
      uploadAndImportPptxTemplate("project-a", file, {
        fetcher,
        onPhase: (phase) => phases.push(phase),
        pollIntervalMs: 0
      })
    ).resolves.toMatchObject({
      deckId: "deck_import_file_template",
      templateId: "template_file_template"
    });
    expect(phases).toEqual(["uploading", "importing"]);
    expect(jobPollCount).toBe(2);
  });

  it("renders stored slide thumbnail images in the slide list", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    deck.slides[0].thumbnailUrl = "http://assets.example.test/slide_1.png";
    setDeckData(queryClient, deck);

    const html = renderApp(queryClient);

    expect(html).toContain("http://assets.example.test/slide_1.png");
    expect(html).not.toContain("미리보기 준비됨");
  });

  it("applies manual save results only while the saved snapshot is still current", () => {
    const deck = createDemoDeck();

    expect(
      shouldApplyManualSaveResult({
        snapshotDeck: deck,
        currentDeck: {
          ...deck
        }
      }),
    ).toBe(true);

    expect(
      shouldApplyManualSaveResult({
        snapshotDeck: deck,
        currentDeck: {
          ...deck,
          version: deck.version + 1
        }
      }),
    ).toBe(false);

    expect(
      shouldApplyManualSaveResult({
        snapshotDeck: deck,
        currentDeck: {
          ...deck,
          projectId: "project_other"
        }
      }),
    ).toBe(false);
  });

  it("renders supported canvas object types without exposing grouped child labels", () => {
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
        elementId: "el_15",
        type: "ellipse",
        role: "highlight",
        x: 1360,
        y: 720,
        width: 180,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 14,
        locked: false,
        visible: true,
        props: {
          fill: "#dbeafe",
          stroke: "#2563eb",
          strokeWidth: 3,
          borderRadius: 0
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_16",
        type: "star",
        role: "highlight",
        x: 1560,
        y: 720,
        width: 180,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 15,
        locked: false,
        visible: true,
        props: {
          fill: "#fef3c7",
          stroke: "#f59e0b",
          strokeWidth: 3,
          borderRadius: 0
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_17",
        type: "ring",
        role: "highlight",
        x: 1560,
        y: 920,
        width: 160,
        height: 160,
        rotation: 0,
        opacity: 1,
        zIndex: 16,
        locked: false,
        visible: true,
        props: {
          fill: "#a5b4fc",
          stroke: "#4338ca",
          strokeWidth: 4,
          borderRadius: 0
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
          closed: true,
          fill: "#f5edff",
          nodes: [
            { x: 20, y: 20, mode: "corner" },
            { x: 200, y: 20, mode: "corner" },
            { x: 200, y: 100, mode: "corner" },
            { x: 92, y: 100, mode: "corner" },
            { x: 48, y: 148, mode: "corner" },
            { x: 56, y: 100, mode: "corner" },
            { x: 20, y: 100, mode: "corner" }
          ],
          stroke: "#9333ea",
          strokeWidth: 2,
          viewBoxHeight: 160,
          viewBoxWidth: 220,
          pathData:
            "M 20 20 L 200 20 L 200 100 L 92 100 L 48 148 L 56 100 L 20 100 Z"
        }
      } as Deck["slides"][number]["elements"][number]
    ];

    setDeckData(queryClient, deck);

    const html = renderApp(queryClient);

    expect(html).toContain("data-konva-arrow");
    expect(html).toContain("data-konva-circle");
    expect(html).toContain("Editor preview");
    expect(html).toContain("data-konva-line");
    expect(html).toContain("data-konva-polygon");
    expect(html).toContain("data-konva-shape");
    expect(html).toContain("data-konva-star");
    expect(html).toContain('data-fill="#dbeafe"');
    expect(html).toContain('data-stroke="#93c5fd"');
    expect(html).toContain('data-stroke-width="3"');
    expect(html).toContain('data-corner-radius="24"');
    expect(html).not.toContain("GROUP");
  });

  it("reports editable AI deck validation warnings", () => {
    const deck = createDemoDeck();
    const firstSlide = deck.slides[0];

    firstSlide.style.backgroundColor = "#ffffff";
    firstSlide.elements.push(
      {
        elementId: "el_missing_alt",
        type: "image",
        role: "media",
        x: 100,
        y: 100,
        width: 320,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 20,
        locked: false,
        visible: true,
        props: {
          alt: "",
          fit: "cover",
          focusX: 0.5,
          focusY: 0.5,
          src: "/asset.png"
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_empty_chart",
        type: "chart",
        role: "chart",
        x: 460,
        y: 100,
        width: 420,
        height: 260,
        rotation: 0,
        opacity: 1,
        zIndex: 21,
        locked: false,
        visible: true,
        props: {
          type: "bar",
          title: "빈 차트",
          data: [],
          style: {
            colors: ["#2563eb"],
            showLegend: false,
            legendPosition: "bottom",
            showDataLabels: false,
            showGrid: true,
            xAxisTitle: "",
            yAxisTitle: "",
            unit: ""
          }
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_overflow",
        type: "text",
        role: "body",
        x: 120,
        y: 420,
        width: 180,
        height: 28,
        rotation: 0,
        opacity: 1,
        zIndex: 22,
        locked: false,
        visible: true,
        props: {
          text: "좁은 상자를 넘치는 긴 텍스트입니다.",
          fontSize: 28,
          fontWeight: "normal",
          color: "#fefefe",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_1_imported_icon_customShape",
        type: "customShape",
        role: "decoration",
        x: 1000,
        y: 120,
        width: 120,
        height: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 23,
        locked: true,
        visible: true,
        props: {
          closed: true,
          fill: "#FFE99C",
          nodes: [
            { x: 0, y: 0, mode: "corner" },
            { x: 120, y: 0, mode: "corner" },
            { x: 120, y: 120, mode: "corner" }
          ],
          stroke: "transparent",
          strokeWidth: 0,
          viewBoxHeight: 120,
          viewBoxWidth: 120,
          pathData: "M 0 0 L 120 0 L 120 120 Z"
        }
      } as Deck["slides"][number]["elements"][number],
      {
        elementId: "el_manual_customShape",
        type: "customShape",
        role: "highlight",
        x: 1140,
        y: 120,
        width: 120,
        height: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 24,
        locked: false,
        visible: true,
        props: {
          closed: true,
          fill: "#f5edff",
          nodes: [
            { x: 0, y: 0, mode: "corner" },
            { x: 120, y: 0, mode: "corner" },
            { x: 120, y: 120, mode: "corner" }
          ],
          stroke: "#9333ea",
          strokeWidth: 2,
          viewBoxHeight: 120,
          viewBoxWidth: 120,
          pathData: "M 0 0 L 120 0 L 120 120 Z"
        }
      } as Deck["slides"][number]["elements"][number]
    );

    const validationItems = getEditorValidationItems(deck, firstSlide);
    const messages = validationItems.map((item) => item.message);
    const riskElementIds = validationItems
      .filter((item) => item.severity === "risk")
      .map((item) => item.elementId);

    expect(messages).toContain("이미지 대체 텍스트가 비어 있습니다.");
    expect(messages).toContain("차트 데이터가 비어 있습니다.");
    expect(messages).toContain("텍스트가 상자 높이를 넘을 수 있습니다.");
    expect(messages).toContain("텍스트와 배경 대비가 낮습니다.");
    expect(riskElementIds).not.toContain("el_1_imported_icon_customShape");
    expect(riskElementIds).toContain("el_manual_customShape");
  });

  it("shrinks overflowing text to fit the element frame", () => {
    const element = {
      elementId: "el_overflow",
      type: "text",
      role: "body",
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        text: "상자 안에 맞추기 어려운 긴 텍스트입니다.",
        fontSize: 32,
        fontWeight: "normal",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    } as Extract<Deck["slides"][number]["elements"][number], { type: "text" }>;

    const props = createShrinkToFitTextProps(element);

    expect(props.fontSize).toBeLessThan(32);
    expect(props.lineHeight).toBeLessThanOrEqual(1.15);
  });

  it("builds a patch that distributes selected elements evenly", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0];

    slide.elements = [100, 400, 900].map((x, index) => ({
      elementId: `el_${index + 1}`,
      type: "rect",
      role: "highlight",
      x,
      y: 100,
      width: 100,
      height: 80,
      rotation: 0,
      opacity: 1,
      zIndex: index,
      locked: false,
      visible: true,
      props: {
        fill: "#ffffff",
        stroke: "#111827",
        strokeWidth: 1,
        borderRadius: 0
      }
    })) as Deck["slides"][number]["elements"];

    const patch = createDistributeSelectionPatch(deck, slide, slide.elements, "x");
    expect(patch).not.toBeNull();

    const result = applyDeckPatch(deck, patch!);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.deck.slides[0].elements[1].x).toBe(500);
    }
  });

  it("keeps the newer local deck when a stale save response tries to update the query cache", () => {
    const currentDeck = {
      ...createDemoDeck(),
      version: 3
    } as Deck;
    const stalePersistedDeck = {
      ...currentDeck,
      version: 2
    } as Deck;

    expect(mergeDeckIntoQueryCache(currentDeck, stalePersistedDeck)).toBe(
      currentDeck
    );
  });

  it("hydrates the first persisted deck before local optimistic edits exist", () => {
    const currentDeck = createDemoDeck();
    const persistedDeck = {
      ...currentDeck,
      projectId: "project_real_1"
    } as Deck;

    expect(
      shouldHydrateDeckFromQuery({
        currentDeck,
        nextDeck: persistedDeck,
        hasHydratedPersistedDeck: false,
        hasLocalOptimisticChanges: false
      })
    ).toBe(true);
  });

  it("ignores an older persisted deck once local optimistic edits have advanced", () => {
    const currentDeck = {
      ...createDemoDeck(),
      version: 3
    } as Deck;
    const persistedDeck = {
      ...currentDeck,
      version: 2
    } as Deck;

    expect(
      shouldHydrateDeckFromQuery({
        currentDeck,
        nextDeck: persistedDeck,
        hasHydratedPersistedDeck: true,
        hasLocalOptimisticChanges: true
      })
    ).toBe(false);
  });

  it("sanitizes invalid element frame values before rendering debug data", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    deck.slides[0].elements.push({
      elementId: "el_invalid",
      type: "text",
      role: "body",
      x: Number.NaN,
      y: Number.NaN,
      width: Number.NaN,
      height: Number.NaN,
      rotation: Number.NaN,
      opacity: 1,
      zIndex: Number.NaN,
      locked: false,
      visible: true,
      props: {
        text: "Invalid frame",
        fontSize: 28,
        color: "#111827",
      },
    } as Deck["slides"][number]["elements"][number]);

    setDeckData(queryClient, deck);

    const html = renderApp(queryClient);

    expect(html).toContain(
      "&quot;elementId&quot;:&quot;el_invalid&quot;,&quot;type&quot;:&quot;text&quot;,&quot;x&quot;:0,&quot;y&quot;:0,&quot;width&quot;:1,&quot;height&quot;:1,&quot;rotation&quot;:0",
    );
    expect(html).not.toContain(
      "&quot;elementId&quot;:&quot;el_invalid&quot;,&quot;type&quot;:&quot;text&quot;,&quot;x&quot;:null",
    );
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

function editorTextElement(
  elementId: string,
  x: number,
  y: number,
  text: string
): DeckElement {
  return {
    elementId,
    type: "text",
    role: "body",
    x,
    y,
    width: 300,
    height: 120,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    props: {
      text,
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: "normal",
      color: "#111827",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2
    }
  };
}

function jobPayload(
  status: "queued" | "running" | "succeeded",
  result: Record<string, unknown> | null = null
) {
  return {
    jobId: "job-pptx",
    projectId: "project-a",
    type: "pptx-import",
    status,
    progress: status === "succeeded" ? 100 : 10,
    message: status,
    result,
    error: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:01.000Z"
  };
}

function qualityReport() {
  return {
    compositeScore: 82,
    metrics: {
      geometry: 90,
      text: 80,
      color: 80,
      layer: 90,
      editability: 60,
      pixelSimilarity: null
    },
    weights: {
      geometry: 25,
      text: 15,
      color: 10,
      layer: 10,
      editability: 10,
      pixelSimilarity: 30
    },
    editabilityCoverage: 0.6,
    appliedCap: null,
    notes: ["pixel renderer unavailable"]
  };
}
