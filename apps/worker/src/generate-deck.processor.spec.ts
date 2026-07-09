import type { StoragePort } from "@orbit/storage";
import type { Deck } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processGenerateDeckJob } from "./generate-deck.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  request: {
    topic: "AI 덱 생성",
    designPrompt: "retro pixel palette",
    brief: {
      presentationContext: "internal planning",
      audienceText: "product team",
      presentationType: "planning proposal",
      durationMinutes: 12,
      referencePolicy: "references-first"
    },
    design: {
      stylePackId: "brandlogy-modern",
      paletteOverride: {
        primary: "#0EA5E9",
        text: "#0F172A",
        accentColor: "#0284C7"
      }
    },
    references: [{ fileId: "file_1" }],
    referenceKeywords: [{ text: "실시간 발표 피드백" }]
  }
};

const storage: Pick<StoragePort, "getSignedReadUrl" | "putObject"> = {
  getSignedReadUrl: vi.fn(async () => "http://storage.local/design.pptx"),
  putObject: vi.fn(async (input: { key: string; contentType: string }) => ({
    key: input.key,
    url: "http://storage.local/design-asset.png",
    contentType: input.contentType,
    purpose: "design-asset" as const,
    size: 4
  }))
};

describe("processGenerateDeckJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calls Python deck generation, saves the deck, and stores job results", async () => {
    const deck = createDeck();
    const warnings = ["근거 데이터가 없어 빈 차트 자리 표시자를 생성했습니다."];
    const deckValidation = validation({
      passed: false,
      layoutIssues: [
        {
          scope: "slide",
          path: "slides.0.elements",
          message: "Text elements overlap."
        }
      ],
      designIssues: [
        {
          scope: "element",
          path: "slides.0.elements.0.props.data",
          message: warnings[0]
        }
      ]
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            deckId: deck.deckId,
            deck,
            warnings,
            validation: deckValidation
          },
          null
        )
      ]);
    let pythonRequestBody = "";
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      pythonRequestBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ deck, warnings, validation: deckValidation })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/ai/generate-deck",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(pythonRequestBody)).toEqual(
      expect.objectContaining({
        designPrompt: "retro pixel palette",
        brief: expect.objectContaining({
          presentationContext: "internal planning",
          referencePolicy: "references-first"
        }),
        design: expect.objectContaining({
          stylePackId: "brandlogy-modern",
          paletteOverride: {
            primary: "#0EA5E9",
            text: "#0F172A",
            accentColor: "#0284C7"
          }
        }),
        referenceKeywords: [{ text: "실시간 발표 피드백" }]
      })
    );
    expect(JSON.parse(pythonRequestBody)).not.toHaveProperty("imageReviewMode");
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("INSERT INTO decks");
    const savedDeck = (query.mock.calls[1][1] as unknown[])[2] as Deck;
    const jobResult = (query.mock.calls[2][1] as unknown[])[4] as {
      deck: Deck;
    };
    expect(savedDeck.metadata.thumbnailSource).toBe("import-render");
    expect(savedDeck.slides[0].thumbnailUrl).toBe(
      "asset:generated_slide_render_slide_1"
    );
    expect(jobResult.deck.slides[0].thumbnailUrl).toBe(
      "asset:generated_slide_render_slide_1"
    );
    expect(job.result?.warnings).toEqual(warnings);
    expect(job.result).toMatchObject({ validation: { passed: false } });
  });

  it("marks the DB job failed when Python generation fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 15, null, {
          code: "PYTHON_WORKER_GENERATE_DECK_FAILED",
          message: "bad generation"
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad generation", { status: 500 }))
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe("bad generation");
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("passes explicit design-pack generation mode to Python deck generation", async () => {
    const deck = createDeck({
      slides: [
        {
          slideId: "slide_1",
          order: 1,
          title: "Design Pack",
          thumbnailUrl: "",
          style: { backgroundColor: "#FFFFFF" },
          speakerNotes: "",
          elements: [
            {
              elementId: "el_1_design_pack_background",
              type: "rect",
              role: "background",
              x: 0,
              y: 0,
              width: 1920,
              height: 1080,
              rotation: 0,
              opacity: 1,
              zIndex: 0,
              locked: true,
              visible: true,
              props: { fill: "#FFFFFF", stroke: "transparent" }
            }
          ]
        }
      ]
    });
    const deckValidation = validation();
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            deckId: deck.deckId,
            deck,
            warnings: [],
            validation: deckValidation
          },
          null
        )
      ]);
    let pythonRequestBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        pythonRequestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ deck, warnings: [], validation: deckValidation })
        );
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          ...payload.request,
          generationMode: "design-pack",
          slideCountRange: { min: 4, max: 4 }
        }
      }
    );

    expect(job.status).toBe("succeeded");
    expect(JSON.parse(pythonRequestBody)).toEqual(
      expect.objectContaining({
        projectId: "project-a",
        generationMode: "design-pack",
        slideCountRange: { min: 4, max: 4 }
      })
    );
  });

  it("imports PPTX design references and stores derived images before generation", async () => {
    const deck = createDeck({
      metadata: {
        language: "ko",
        locale: "ko-KR",
        sourceType: "ai",
        generatedBy: "ai",
        createdFrom: {
          topic: "AI ???앹꽦",
          references: [{ fileId: "file_1" }],
          designReferences: [{ fileId: "file_design" }]
        }
      },
      slides: [
        {
          slideId: "slide_1",
          order: 1,
          title: "AI ???앹꽦",
          thumbnailUrl: "",
          style: {},
          speakerNotes: "notes",
          elements: [
            {
              elementId: "el_1_imported_image_1",
              type: "image",
              role: "media",
              x: 100,
              y: 100,
              width: 320,
              height: 180,
              rotation: 0,
              opacity: 1,
              zIndex: 1,
              locked: false,
              visible: true,
              props: {
                src: "/api/v1/projects/project-a/assets/file_design_asset/content",
                alt: "Imported image",
                fit: "contain"
              }
            }
          ],
          keywords: [],
          aiNotes: {
            emphasisPoints: ["message"],
            sourceEvidence: [{ fileId: "file_1" }]
          }
        }
      ]
    });
    const deckValidation = validation();
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("UPDATE jobs")) {
        return [jobRow(params[1] as "running" | "succeeded" | "failed", params[2] as number, params[4] as Record<string, unknown> | null, params[5] as { code: string; message: string } | null)];
      }
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_design",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_design-template.pptx",
            mime_type:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            original_name: "template.pptx",
            size: 12,
            purpose: "pptx-import",
            status: "uploaded"
          }
        ];
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://storage.local/design.pptx") {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/design/import-pptx")) {
        return new Response(
          JSON.stringify({
            blueprint: {
              slides: [
                {
                  elements: [
                    {
                      type: "image",
                      props: { src: "asset:image_1" }
                    }
                  ]
                }
              ]
            },
            templateBlueprint: templateBlueprint(),
            qualityReport: qualityReport(),
            assets: [
              {
                assetId: "image_1",
                fileName: "image.png",
                mimeType: "image/png",
                contentBase64: Buffer.from("img").toString("base64")
              }
            ],
            warnings: []
          })
        );
      }

      expect(url).toBe("http://localhost:8000/ai/generate-deck");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        designReferences: [{ fileId: "file_design" }],
        templateBlueprint: expect.objectContaining({
          templateId: "template_file_design"
        }),
        designBlueprint: {
          slides: [
            {
              elements: [
                {
                  props: {
                    src: expect.stringMatching(
                      /^\/api\/v1\/projects\/project-a\/assets\/file_/
                    )
                  }
                }
              ]
            }
          ]
        }
      });
      return new Response(JSON.stringify({ deck, warnings: [], validation: deckValidation }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          ...payload.request,
          designReferences: [{ fileId: "file_design" }]
        }
      }
    );

    expect(job.status).toBe("succeeded");
    expect(storage.getSignedReadUrl).toHaveBeenCalledWith(
      "projects/project-a/assets/file_design-template.pptx"
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        purpose: "design-asset"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/design/import-pptx",
      expect.objectContaining({ method: "POST" })
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("template_blueprints"))
    ).toBe(true);
  });

  it("fails when a design reference is not an uploaded PPTX asset", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("UPDATE jobs")) {
        return [jobRow(params[1] as "running" | "succeeded" | "failed", params[2] as number, params[4] as Record<string, unknown> | null, params[5] as { code: string; message: string } | null)];
      }
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_design",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_design.pdf",
            mime_type: "application/pdf",
            original_name: "template.pdf",
            size: 12,
            purpose: "reference-material",
            status: "uploaded"
          }
        ];
      }
      return [];
    });
    vi.stubGlobal("fetch", vi.fn());

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          ...payload.request,
          designReferences: [{ fileId: "file_design" }]
        }
      }
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("GENERATE_DECK_DESIGN_REFERENCE_FAILED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads a stored template blueprint when templateBlueprintId is provided", async () => {
    const deck = createDeck();
    const deckValidation = validation();
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("UPDATE jobs")) {
        return [
          jobRow(
            params[1] as "running" | "succeeded" | "failed",
            params[2] as number,
            params[4] as Record<string, unknown> | null,
            params[5] as { code: string; message: string } | null
          )
        ];
      }
      if (sql.includes("FROM template_blueprints")) {
        return [
          {
            template_id: "template_file_design",
            project_id: "project-a",
            deck_id: "deck_import_file_design",
            source_file_id: "file_design",
            blueprint_json: templateBlueprint(),
            quality_report_json: qualityReport(),
            deck_json: createDeck({
              deckId: "deck_import_file_design",
              metadata: { language: "ko", locale: "ko-KR", sourceType: "import" },
              slides: [
                {
                  slideId: "slide_import_file_design_1",
                  order: 1,
                  title: "Template",
                  thumbnailUrl: "",
                  style: {},
                  speakerNotes: "",
                  elements: [
                    {
                      elementId: "el_imported_1_title",
                      type: "text",
                      role: "title",
                      x: 120,
                      y: 96,
                      width: 1200,
                      height: 120,
                      rotation: 0,
                      opacity: 1,
                      zIndex: 2,
                      locked: false,
                      visible: true,
                      props: {
                        text: "Template title",
                        fontSize: 52,
                        fontWeight: "bold"
                      }
                    }
                  ]
                }
              ]
            })
          }
        ];
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:8000/ai/generate-deck");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        templateBlueprintId: "template_file_design",
        templateBlueprint: expect.objectContaining({
          templateId: "template_file_design"
        }),
        designBlueprint: {
          slides: [
            {
              elements: [
                expect.objectContaining({
                  elementId: "el_imported_1_title"
                })
              ]
            }
          ]
        }
      });
      return new Response(JSON.stringify({ deck, warnings: [], validation: deckValidation }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          ...payload.request,
          designReferences: [],
          templateBlueprintId: "template_file_design"
        }
      }
    );

    expect(job.status).toBe("succeeded");
    expect(storage.getSignedReadUrl).not.toHaveBeenCalled();
  });
});

function createDeck(overrides: Record<string, unknown> = {}) {
  return {
    deckId: "deck_ai_1",
    projectId: "project-a",
    title: "AI 덱 생성 발표안",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "ai",
      generatedBy: "ai",
      createdFrom: {
        topic: "AI 덱 생성",
        references: [{ fileId: "file_1" }]
      }
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "AI 덱 생성",
        thumbnailUrl: "",
        style: {},
        speakerNotes: "notes",
        elements: [],
        keywords: [],
        animations: [],
        actions: [],
        aiNotes: {
          emphasisPoints: ["message"],
          sourceEvidence: [{ fileId: "file_1" }]
        }
      }
    ],
    ...overrides
  };
}

function validation(
  overrides: Partial<{
    passed: boolean;
    layoutIssues: Array<Record<string, unknown>>;
    contentIssues: Array<Record<string, unknown>>;
    designIssues: Array<Record<string, unknown>>;
    presentationIssues: Array<Record<string, unknown>>;
  }> = {}
) {
  return {
    passed: true,
    layoutIssues: [],
    contentIssues: [],
    designIssues: [],
    presentationIssues: [],
    ...overrides
  };
}

function templateBlueprint() {
  return {
    templateId: "template_file_design",
    sourceFileId: "file_design",
    slides: [
      {
        slideIndex: 1,
        sourceSlideIndex: 1,
        slots: [
          {
            elementId: "el_imported_1_title",
            usage: "content-slot",
            slotRole: "title",
            replaceMode: "replace",
            confidence: 0.95,
            bounds: { x: 120, y: 96, width: 1200, height: 120 },
            source: { type: "placeholder", name: "Title 1" }
          }
        ]
      }
    ]
  };
}

function qualityReport() {
  return {
    compositeScore: 84,
    weights: {
      geometry: 25,
      text: 15,
      color: 10,
      layer: 10,
      editability: 10,
      pixelSimilarity: 30
    },
    metrics: {
      geometry: 0.9,
      text: 0.8,
      color: 0.8,
      layer: 0.9,
      editability: 0.8,
      pixelSimilarity: null
    },
    editabilityCoverage: 0.8,
    capsApplied: [],
    warnings: []
  };
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    job_id: "job-1",
    project_id: "project-a",
    type: "ai-deck-generation",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-06-27T00:00:00.000Z",
    updated_at: "2026-06-27T00:00:01.000Z"
  };
}
