import { applyDeckPatch, createDemoDeck } from "@orbit/editor-core";
import {
  createAddAnimationWithKeywordTriggerPatch,
  createDefaultAnimation,
  createUpdateAnimationKeywordTriggerPatch,
  createUpsertAdvanceSlideKeywordActionPatch
} from "../../../../../../packages/editor-core/src/index";
import { demoIds } from "@orbit/shared";
import type {
  AiSuggestion,
  Deck,
  DeckPatch,
  DeckElement,
  ListAiSuggestionsResponse,
  TableElementProps
} from "@orbit/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EditorShell,
  EditorStateNotice,
  applyDeckPatchAcknowledgement,
  buildSlideThumbnailPatch,
  buildPatchBatch,
  consumeScheduledUndoRedoPersistLabel,
  createDistributeSelectionPatch,
  flushEditorPersistenceBeforeManualAction,
  getSpeakerNotesDanglingOccurrenceSaveBlock,
  getImportedSlideThumbnailRefreshSlideIds,
  getPatchThumbnailRefreshSlideIds,
  getEditorValidationItems,
  mergeDeckIntoQueryCache,
  resolveHistoryNavigation,
  shouldApplyManualSaveResult,
  shouldRefreshImportedSlideThumbnails,
  shouldPromptSpeakerNotesDraftDiscard,
  shouldPromptSpeakerNotesOverwrite,
  shouldHydrateDeckFromQuery,
  uploadAndImportPptxTemplate
} from "./EditorShell";
import {
  createExpandTextWidthToFitFrame,
  createShrinkToFitTextProps,
  createSingleLineTextFit,
  parseTableDataDraft,
  tableDataDraft
} from "./components/SelectionQuickBar";
import { ValidationPanel } from "../ai/quality/ValidationPanel";
import { measureTextContentBounds } from "../canvas/text/textLayout";
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

  it("flushes scheduled undo redo persistence before manual save queues", async () => {
    const calls: string[] = [];
    let pendingPatchCount = 2;

    await flushEditorPersistenceBeforeManualAction({
      flushScheduledUndoRedoPersist: async () => {
        calls.push("undo-redo");
      },
      waitForSaveQueue: async () => {
        calls.push("save-queue");
      },
      hasPendingPatchInputs: () => pendingPatchCount > 0,
      flushPendingSaveBatch: async () => {
        calls.push(`patch-${pendingPatchCount}`);
        pendingPatchCount -= 1;
      }
    });

    expect(calls).toEqual(["undo-redo", "save-queue", "patch-2", "patch-1"]);
  });

  it("consumes a scheduled undo redo persist timer once", () => {
    const timer = setTimeout(() => undefined, 10_000);
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = {
      current: timer
    };
    const labelRef: { current: string | null } = { current: "undo" };
    const clearTimer = vi.fn((scheduledTimer: ReturnType<typeof setTimeout>) =>
      clearTimeout(scheduledTimer)
    );

    expect(
      consumeScheduledUndoRedoPersistLabel({
        clearTimer,
        labelRef,
        timerRef
      })
    ).toBe("undo");
    expect(clearTimer).toHaveBeenCalledWith(timer);
    expect(timerRef.current).toBeNull();
    expect(labelRef.current).toBeNull();

    expect(
      consumeScheduledUndoRedoPersistLabel({
        clearTimer,
        labelRef,
        timerRef
      })
    ).toBeNull();
    expect(clearTimer).toHaveBeenCalledTimes(1);
  });

  it("consumes a restored undo redo persist label without a timer", () => {
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = {
      current: null
    };
    const labelRef: { current: string | null } = { current: "redo" };
    const clearTimer = vi.fn();

    expect(
      consumeScheduledUndoRedoPersistLabel({
        clearTimer,
        labelRef,
        timerRef
      })
    ).toBe("redo");
    expect(clearTimer).not.toHaveBeenCalled();
    expect(labelRef.current).toBeNull();
  });

  it("resolves undo redo history navigation without state updater side effects", () => {
    const previousDeck = { ...createDemoDeck(), title: "Previous deck" };
    const currentDeck = {
      ...createDemoDeck(),
      title: "Current deck",
      version: previousDeck.version + 1
    };

    const transition = resolveHistoryNavigation({
      currentDeck,
      currentSlideIndex: 1,
      stack: [{ deck: previousDeck, slideIndex: 999 }]
    });

    expect(transition).toMatchObject({
      currentEntry: { deck: currentDeck, slideIndex: 1 },
      nextStack: [],
      targetEntry: { deck: previousDeck },
      targetSlideIndex: previousDeck.slides.length - 1
    });
    expect(
      resolveHistoryNavigation({
        currentDeck,
        currentSlideIndex: 0,
        stack: []
      })
    ).toBeNull();
  });

  it("prompts before discarding a dirty speaker notes draft", () => {
    expect(
      shouldPromptSpeakerNotesDraftDiscard({
        draft: "수정 중인 메모",
        isEditing: true,
        savedDraftBase: "기존 메모"
      })
    ).toBe(true);
    expect(
      shouldPromptSpeakerNotesDraftDiscard({
        draft: "기존 메모",
        isEditing: true,
        savedDraftBase: "기존 메모"
      })
    ).toBe(false);
    expect(
      shouldPromptSpeakerNotesDraftDiscard({
        draft: "수정 중인 메모",
        isEditing: false,
        savedDraftBase: "기존 메모"
      })
    ).toBe(false);
  });

  it("prompts before overwriting externally changed speaker notes", () => {
    expect(
      shouldPromptSpeakerNotesOverwrite({
        currentNotes: "AI 제안으로 바뀐 메모",
        draft: "사용자가 입력한 메모",
        savedDraftBase: "기존 메모"
      })
    ).toBe(true);
    expect(
      shouldPromptSpeakerNotesOverwrite({
        currentNotes: "AI 제안으로 바뀐 메모",
        draft: "AI 제안으로 바뀐 메모",
        savedDraftBase: "기존 메모"
      })
    ).toBe(false);
    expect(
      shouldPromptSpeakerNotesOverwrite({
        currentNotes: "기존 메모",
        draft: "사용자가 입력한 메모",
        savedDraftBase: "기존 메모"
      })
    ).toBe(false);
  });

  it("blocks speaker notes saves that would orphan keyword occurrence actions", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0],
      speakerNotes: "ORBIT 흐름은 ORBIT 대본으로 설명합니다.",
      actions: [
        {
          actionId: "act_1",
          trigger: {
            kind: "keyword-occurrence" as const,
            keywordId: "kw_1",
            occurrenceId: "kwo_slide_1_kw_1_10_15"
          },
          effect: {
            kind: "go-to-next-slide" as const
          }
        }
      ]
    };

    const block = getSpeakerNotesDanglingOccurrenceSaveBlock(
      slide,
      "앞에 추가 ORBIT 흐름은 ORBIT 대본으로 설명합니다."
    );

    expect(block).toMatchObject({
      danglingActions: [
        {
          slideId: "slide_1",
          actionId: "act_1",
          keywordId: "kw_1",
          occurrenceId: "kwo_slide_1_kw_1_10_15",
          effectKind: "go-to-next-slide"
        }
      ]
    });
  });

  it("allows speaker notes saves when only legacy keyword actions exist", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0],
      speakerNotes: "ORBIT 흐름은 ORBIT 대본으로 설명합니다.",
      actions: [
        {
          actionId: "act_1",
          trigger: {
            kind: "keyword" as const,
            keywordId: "kw_1"
          },
          effect: {
            kind: "go-to-next-slide" as const
          }
        }
      ]
    };

    expect(
      getSpeakerNotesDanglingOccurrenceSaveBlock(
        slide,
        "앞에 추가 ORBIT 흐름은 ORBIT 대본으로 설명합니다."
      )
    ).toBeNull();
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
    expect(html).toContain("차트");
    expect(html).not.toContain("Data Contract");
    expect(html).toContain("발표 메모");
    expect(html).toContain("저장됨");
    expect(html).toContain("AI 검증");
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

  it("returns a warning for duplicated readable text", () => {
    const deck = createDemoDeck();
    deck.slides[0].elements = [
      editorTextElement("text_a", 100, 100, "반복되는 본문 문장입니다."),
      editorTextElement("text_b", 500, 100, "반복되는 본문 문장입니다.")
    ];

    const items = getEditorValidationItems(deck, deck.slides[0]);

    expect(items).toContainEqual(
      expect.objectContaining({
        elementIds: ["text_a", "text_b"],
        message: "같은 텍스트가 여러 요소에 반복되어 있습니다.",
        severity: "warning"
      })
    );
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

  it("marks imported PPTX slide renders for thumbnail refresh", () => {
    const deck = createDemoDeck();

    deck.slides[0].thumbnailUrl = "asset:slide_render_1";

    expect(shouldRefreshImportedSlideThumbnails(deck)).toBe(true);
    expect(getImportedSlideThumbnailRefreshSlideIds(deck)).toEqual([
      deck.slides[0].slideId
    ]);

    deck.slides[0].thumbnailUrl =
      "http://assets.example.test/slide-01-thumbnail-v2.png";

    expect(shouldRefreshImportedSlideThumbnails(deck)).toBe(false);

    deck.deckId = "deck_ooxml_file_template";
    deck.metadata.sourceType = "import";

    expect(shouldRefreshImportedSlideThumbnails(deck)).toBe(true);

    deck.metadata.thumbnailSource = "canvas";

    expect(shouldRefreshImportedSlideThumbnails(deck)).toBe(false);
  });

  it("builds a slide thumbnail patch without resending the full deck", () => {
    const baseDeck = createDemoDeck();
    const renderedDeck = structuredClone(baseDeck);

    renderedDeck.slides[0].thumbnailUrl =
      "/api/v1/projects/project-a/assets/file-thumb/content";

    expect(buildSlideThumbnailPatch(baseDeck, renderedDeck)).toMatchObject({
      baseVersion: baseDeck.version,
      deckId: baseDeck.deckId,
      operations: [
        {
          slideId: baseDeck.slides[0].slideId,
          thumbnailUrl: renderedDeck.slides[0].thumbnailUrl,
          type: "update_slide"
        }
      ],
      source: "system"
    });
  });

  it("marks import-render thumbnails as canvas thumbnails after rendering", () => {
    const baseDeck = createDemoDeck();
    const renderedDeck = structuredClone(baseDeck);

    baseDeck.metadata.sourceType = "import";
    baseDeck.metadata.thumbnailSource = "import-render";
    baseDeck.slides[0].thumbnailUrl =
      "/api/v1/projects/project-a/assets/file-render/content";
    renderedDeck.metadata = baseDeck.metadata;
    renderedDeck.slides[0].thumbnailUrl =
      "/api/v1/projects/project-a/assets/file-thumb/content";

    expect(buildSlideThumbnailPatch(baseDeck, renderedDeck)).toMatchObject({
      operations: [
        {
          slideId: baseDeck.slides[0].slideId,
          thumbnailUrl: renderedDeck.slides[0].thumbnailUrl,
          type: "update_slide"
        },
        {
          metadata: {
            thumbnailSource: "canvas"
          },
          type: "update_deck"
        }
      ]
    });
  });

  it("finds visual patch slides for autosave thumbnail refresh", () => {
    const deck = createDemoDeck();
    const firstSlide = deck.slides[0]!;
    const secondSlide = deck.slides[1]!;
    const firstElement = firstSlide.elements[0]!;

    expect(
      getPatchThumbnailRefreshSlideIds(deck, {
        baseVersion: deck.version,
        deckId: deck.deckId,
        operations: [
          {
            frame: { x: 240 },
            slideId: firstSlide.slideId,
            elementId: firstElement.elementId,
            type: "update_element_frame"
          },
          {
            slideId: firstSlide.slideId,
            speakerNotes: "notes",
            type: "update_speaker_notes"
          }
        ],
        source: "user"
      })
    ).toEqual([firstSlide.slideId]);

    expect(
      getPatchThumbnailRefreshSlideIds(deck, {
        baseVersion: deck.version,
        deckId: deck.deckId,
        operations: [{ theme: { backgroundColor: "#ffffff" }, type: "update_theme" }],
        source: "user"
      })
    ).toEqual([firstSlide.slideId, secondSlide.slideId]);
  });

  it("keeps table quickbar edits in editable table props", () => {
    const table: TableElementProps = {
      borderColor: "#CBD5E1",
      borderWidth: 1,
      columnWidths: [120, 120],
      rowHeights: [40, 40],
      rows: [
        [
          {
            align: "center",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            colSpan: 1,
            fill: "#EFF6FF",
            fontSize: 18,
            fontWeight: "bold",
            rowSpan: 1,
            text: "A",
            verticalAlign: "middle"
          },
          {
            align: "center",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            colSpan: 1,
            fill: "#EFF6FF",
            fontSize: 18,
            fontWeight: "bold",
            rowSpan: 1,
            text: "B",
            verticalAlign: "middle"
          }
        ]
      ]
    };

    expect(tableDataDraft(table)).toBe("A\tB");

    const patch = parseTableDataDraft("Name\tScore\nAda\t95", table, 240, 120);

    expect(patch).toMatchObject({
      columnWidths: [120, 120],
      rowHeights: [40, 40],
      rows: [
        [{ text: "Name" }, { text: "Score" }],
        [{ text: "Ada" }, { text: "95" }]
      ]
    });
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
    ).toBe(true);

    expect(
      shouldApplyManualSaveResult({
        snapshotDeck: deck,
        currentDeck: {
          ...deck,
          projectId: "project_other"
        }
      }),
    ).toBe(false);

    expect(
      shouldApplyManualSaveResult({
        snapshotDeck: deck,
        currentDeck: {
          ...deck,
          title: "same version but different edit"
        }
      }),
    ).toBe(false);
  });

  it("rebuilds queued patch producers against the latest deck", () => {
    const deck = createDemoDeck();
    const remoteSlide = {
      ...structuredClone(deck.slides[0]),
      order: deck.slides.length + 1,
      slideId: "slide_remote",
      title: "Remote slide"
    };
    const latestDeck = {
      ...deck,
      slides: [...deck.slides, remoteSlide],
      version: deck.version + 1
    };
    const createCascadePatch = (currentDeck: Deck): DeckPatch => ({
      baseVersion: currentDeck.version,
      deckId: currentDeck.deckId,
      operations: currentDeck.slides.map((slide) => ({
        slideId: slide.slideId,
        style: {
          backgroundColor: "#111111"
        },
        type: "update_slide_style" as const
      })),
      source: "user"
    });

    const stalePatch = createCascadePatch(deck);

    expect(
      buildPatchBatch(latestDeck, [createCascadePatch]).patch.operations
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slideId: remoteSlide.slideId })
      ])
    );
    expect(
      buildPatchBatch(latestDeck, [stalePatch]).patch.operations
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slideId: remoteSlide.slideId })
      ])
    );
  });

  it("rebuilds the persisted deck from a lightweight patch acknowledgement", () => {
    const deck = createDemoDeck();
    const patch: DeckPatch = {
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [{ type: "update_deck", title: "Ack title" }]
    };
    const applied = applyDeckPatch(deck, patch, {
      createdAt: "2026-07-10T00:00:00.000Z"
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const acknowledgement = {
      deckId: deck.deckId,
      version: applied.deck.version,
      changeRecord: applied.changeRecord,
      updatedAt: applied.changeRecord.createdAt
    };

    expect(applyDeckPatchAcknowledgement(deck, patch, acknowledgement)).toEqual(
      applied.deck
    );
    expect(() =>
      applyDeckPatchAcknowledgement(deck, patch, {
        ...acknowledgement,
        version: acknowledgement.version + 1
      })
    ).toThrow("acknowledgement version");
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
    expect(validationItems).toContainEqual(
      expect.objectContaining({
        elementId: "el_overflow",
        issue: "textOverflow"
      })
    );
    expect(messages).toContain("텍스트와 배경 대비가 낮습니다.");
    expect(riskElementIds).not.toContain("el_1_imported_icon_customShape");
    expect(riskElementIds).toContain("el_manual_customShape");
  });

  it("renders a bulk apply button for text overflow warnings", () => {
    const html = renderToString(
      <ValidationPanel
        items={[
          {
            elementId: "el_overflow",
            issue: "textOverflow",
            message: "텍스트가 상자 높이를 넘을 수 있습니다.",
            severity: "warning"
          }
        ]}
      />
    );

    expect(html).toContain("모두 반영하기");
  });

  it("keeps a warning when title text still wraps", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0];
    const titleElement = editorTextElement(
      "el_wrapped_title",
      100,
      100,
      "발표 준비, AI로 1시간에서 3분으로 단축"
    );
    const bodyElement = editorTextElement(
      "el_wrapped_body",
      100,
      500,
      "본문은 여러 줄이어도 제목 경고가 아닙니다."
    );

    slide.elements = [
      {
        ...titleElement,
        role: "title",
        width: 180,
        height: 300,
        props: {
          ...titleElement.props,
          fontSize: 48
        }
      },
      {
        ...bodyElement,
        width: 180,
        height: 300,
        props: {
          ...bodyElement.props,
          fontSize: 48
        }
      }
    ];

    const titleWrapItems = getEditorValidationItems(deck, slide).filter(
      (item) => item.issue === "titleWrap"
    );

    expect(titleWrapItems).toContainEqual(
      expect.objectContaining({ elementId: "el_wrapped_title" })
    );
    expect(titleWrapItems).not.toContainEqual(
      expect.objectContaining({ elementId: "el_wrapped_body" })
    );
  });

  it("reports wrapped short labels separately from title wraps", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0];
    const labelElement = editorTextElement("el_wrapped_label", 100, 420, "PitchDeck");
    const bodyElement = editorTextElement("el_body", 100, 520, "Short body");

    slide.elements = [
      {
        ...labelElement,
        role: undefined,
        width: 40,
        height: 80,
        props: {
          ...labelElement.props,
          fontSize: 24
        }
      },
      {
        ...bodyElement,
        width: 40,
        height: 80,
        props: {
          ...bodyElement.props,
          fontSize: 24
        }
      }
    ];

    const validationItems = getEditorValidationItems(deck, slide);

    expect(validationItems).toContainEqual(
      expect.objectContaining({
        elementId: "el_wrapped_label",
        issue: "labelWrap"
      })
    );
    expect(validationItems).not.toContainEqual(
      expect.objectContaining({
        elementId: "el_wrapped_label",
        issue: "titleWrap"
      })
    );
    expect(validationItems).not.toContainEqual(
      expect.objectContaining({
        elementId: "el_body",
        issue: "labelWrap"
      })
    );
  });

  it("reports short captions that are too narrow for a single line", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0];
    const captionElement = editorTextElement("el_narrow_caption", 100, 420, "PitchDeck");

    slide.elements = [
      {
        ...captionElement,
        role: "caption",
        width: 42,
        height: 80,
        props: {
          ...captionElement.props,
          fontSize: 24
        }
      }
    ];

    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({
        elementId: "el_narrow_caption",
        issue: "labelWrap"
      })
    );
  });

  it("uses imported run font size when validating short captions", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0];
    const captionElement = editorTextElement("el_imported_caption", 100, 420, "PitchDeck");

    slide.elements = [
      {
        ...captionElement,
        role: "caption",
        width: 138,
        height: 27,
        props: {
          ...captionElement.props,
          fontSize: 16,
          paragraphs: [
            {
              text: "PitchDeck",
              runs: [
                {
                  text: "PitchDeck",
                  baseline: "normal",
                  fontFamily: "Arial",
                  fontSize: 42,
                  fontWeight: "bold",
                  color: "#111827"
                }
              ],
              align: "left",
              lineHeight: 1.15,
              spaceBefore: 0,
              spaceAfter: 0,
              indent: 0
            }
          ]
        }
      }
    ];

    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({
        elementId: "el_imported_caption",
        issue: "labelWrap"
      })
    );
  });

  it("renders a bulk apply button for title wrap warnings", () => {
    const html = renderToString(
      <ValidationPanel
        items={[
          {
            elementId: "el_wrapped_title",
            issue: "titleWrap",
            message: "제목이 여러 줄로 줄바꿈되었습니다.",
            severity: "warning"
          }
        ]}
      />
    );

    expect(html).toContain("모두 반영하기");
  });

  it("renders a bulk apply button for label wrap warnings", () => {
    const html = renderToString(
      <ValidationPanel
        items={[
          {
            elementId: "el_wrapped_label",
            issue: "labelWrap",
            message: "짧은 라벨이 여러 줄로 줄바꿈되었습니다.",
            severity: "warning"
          }
        ]}
      />
    );

    expect(html).toContain("모두 반영하기");
  });

  it("measures wrapped text line count", () => {
    const metrics = measureTextContentBounds({
      align: "left",
      fontFamily: "Arial",
      fontSize: 24,
      fontStyle: "normal",
      lineHeight: 1.2,
      text: "wrapped text should take more than one line",
      width: 80
    });

    expect(metrics.lineCount).toBeGreaterThan(1);
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

  it("shrinks imported rich text using the primary run font size", () => {
    const element = {
      elementId: "el_imported_overflow",
      type: "text",
      role: "caption",
      x: 0,
      y: 0,
      width: 138,
      height: 27,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        text: "PitchDeck",
        paragraphs: [
          {
            text: "PitchDeck",
            runs: [
              {
                text: "PitchDeck",
                baseline: "normal",
                fontFamily: "Arial",
                fontSize: 42,
                fontWeight: "bold",
                color: "#111827"
              }
            ],
            align: "left",
            lineHeight: 1.15,
            spaceBefore: 0,
            spaceAfter: 0,
            indent: 0
          }
        ],
        fontSize: 16,
        fontWeight: "normal",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.15
      }
    } as Extract<Deck["slides"][number]["elements"][number], { type: "text" }>;

    const props = createShrinkToFitTextProps(element);
    const plainProps = props as Record<string, unknown>;

    expect(props.fontSize as number).toBeLessThan(42);
    expect(plainProps.paragraphs).toBeNull();
    expect(plainProps.runs).toBeNull();
    expect(plainProps.fontFamily).toBe("Arial");
    expect(plainProps.fontWeight).toBe("bold");
  });

  it("expands text width only when width can resolve overflow", () => {
    const element = {
      elementId: "el_overflow",
      type: "text",
      role: "body",
      x: 0,
      y: 0,
      width: 80,
      height: 52,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        text: "자동 줄바꿈으로 넘치는 텍스트입니다.",
        fontSize: 20,
        fontWeight: "normal",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    } as Extract<Deck["slides"][number]["elements"][number], { type: "text" }>;

    expect(createExpandTextWidthToFitFrame(element, 500)).toBeGreaterThan(80);

    expect(
      createExpandTextWidthToFitFrame(
        {
          ...element,
          props: {
            ...element.props,
            text: "한 줄\n두 줄\n세 줄"
          }
        },
        500
      )
    ).toBeNull();
  });

  it("builds a one-line text fit from explicit line breaks", () => {
    const element = {
      elementId: "el_overflow",
      type: "text",
      role: "body",
      x: 0,
      y: 0,
      width: 80,
      height: 52,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        text: "좋은 PR 작성법\n- 작업 내용 요약\n- 확인 방법 제시",
        fontSize: 20,
        fontWeight: "normal",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    } as Extract<Deck["slides"][number]["elements"][number], { type: "text" }>;

    const fit = createSingleLineTextFit(element);

    expect(fit.text).toBe("좋은 PR 작성법 - 작업 내용 요약 - 확인 방법 제시");
    expect(fit.width).toBeGreaterThan(element.width);
  });

  it("keeps one-line text fit within the provided max width", () => {
    const element = {
      elementId: "el_title",
      type: "text",
      role: "title",
      x: 0,
      y: 0,
      width: 120,
      height: 72,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        text: "AI가 바꾸는 발표 준비의 혁신",
        fontSize: 42,
        fontWeight: "bold",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    } as Extract<Deck["slides"][number]["elements"][number], { type: "text" }>;

    const fit = createSingleLineTextFit(element, {}, { maxWidth: 260, minFontSize: 20 });

    expect(fit.fits).toBe(true);
    expect(fit.width).toBeLessThanOrEqual(260);
    expect(fit.props.fontSize as number).toBeLessThanOrEqual(42);
  });

  it("reports when one-line text fit cannot satisfy the frame", () => {
    const element = {
      elementId: "el_label",
      type: "text",
      role: "caption",
      x: 0,
      y: 0,
      width: 40,
      height: 24,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        text: "Presentation",
        fontSize: 24,
        fontWeight: "bold",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    } as Extract<Deck["slides"][number]["elements"][number], { type: "text" }>;

    const fit = createSingleLineTextFit(element, {}, { maxWidth: 60, minFontSize: 20 });

    expect(fit.fits).toBe(false);
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

  it("stores new animation triggers on the selected speaker note occurrence", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0],
      speakerNotes: "ORBIT 흐름은 ORBIT 대본으로 설명합니다."
    };
    const deckWithRepeatedKeyword = {
      ...deck,
      slides: [slide, ...deck.slides.slice(1)]
    };
    const animation = createDefaultAnimation(
      deckWithRepeatedKeyword,
      slide,
      "el_1"
    );
    const patch = createAddAnimationWithKeywordTriggerPatch(
      deckWithRepeatedKeyword,
      slide.slideId,
      animation,
      "kw_1",
      "kwo_slide_1_kw_1_10_15"
    );

    const result = applyDeckPatch(deckWithRepeatedKeyword, patch);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.slides[0].actions.at(-1)?.trigger).toEqual({
        kind: "keyword-occurrence",
        keywordId: "kw_1",
        occurrenceId: "kwo_slide_1_kw_1_10_15"
      });
    }
  });

  it("stores next-slide triggers on the selected speaker note occurrence", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0],
      speakerNotes: "ORBIT 흐름은 ORBIT 대본으로 설명합니다."
    };
    const deckWithRepeatedKeyword = {
      ...deck,
      slides: [slide, ...deck.slides.slice(1)]
    };
    const patch = createUpsertAdvanceSlideKeywordActionPatch(
      deckWithRepeatedKeyword,
      slide.slideId,
      "kw_1",
      true,
      "kwo_slide_1_kw_1_10_15"
    );

    expect(patch).not.toBeNull();
    expect(deckWithRepeatedKeyword.slides[0].actions).toEqual([]);
    expect(patch?.operations).toEqual([
      {
        type: "add_slide_action",
        slideId: slide.slideId,
        action: expect.objectContaining({
          trigger: {
            kind: "keyword-occurrence",
            keywordId: "kw_1",
            occurrenceId: "kwo_slide_1_kw_1_10_15"
          },
          effect: {
            kind: "go-to-next-slide"
          }
        })
      }
    ]);
    const result = applyDeckPatch(deckWithRepeatedKeyword, patch!);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.slides[0].actions.at(-1)?.trigger).toEqual({
        kind: "keyword-occurrence",
        keywordId: "kw_1",
        occurrenceId: "kwo_slide_1_kw_1_10_15"
      });
      expect(result.deck.slides[0].actions.at(-1)?.effect).toEqual({
        kind: "go-to-next-slide"
      });
    }
  });

  it("reconnects legacy animation triggers to a selected speaker note occurrence", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0],
      speakerNotes: "ORBIT 흐름은 ORBIT 대본으로 설명합니다.",
      animations: [
        {
          animationId: "anim_1",
          elementId: "el_1",
          order: 1,
          type: "fade-in" as const,
          durationMs: 300,
          delayMs: 0,
          easing: "ease-out" as const
        }
      ],
      actions: [
        {
          actionId: "act_1",
          trigger: {
            kind: "keyword" as const,
            keywordId: "kw_1"
          },
          effect: {
            kind: "play-animation" as const,
            animationId: "anim_1"
          }
        }
      ]
    };
    const deckWithLegacyAction = {
      ...deck,
      slides: [slide, ...deck.slides.slice(1)]
    };
    const patch = createUpdateAnimationKeywordTriggerPatch(
      deckWithLegacyAction,
      slide.slideId,
      "anim_1",
      "kw_1",
      "kwo_slide_1_kw_1_10_15"
    );

    const result = applyDeckPatch(deckWithLegacyAction, patch);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.slides[0].actions[0]?.trigger).toEqual({
        kind: "keyword-occurrence",
        keywordId: "kw_1",
        occurrenceId: "kwo_slide_1_kw_1_10_15"
      });
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

  it("does not hydrate newer query data over local optimistic edits", () => {
    const currentDeck = {
      ...createDemoDeck(),
      version: 2
    } as Deck;
    const persistedDeck = {
      ...currentDeck,
      title: "stale save response",
      version: 3
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
): Extract<DeckElement, { type: "text" }> {
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
