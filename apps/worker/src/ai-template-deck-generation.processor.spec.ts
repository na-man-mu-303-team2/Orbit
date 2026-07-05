import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processAiTemplateDeckGenerationJob } from "./ai-template-deck-generation.processor";

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const payload = {
  jobId: "job-template",
  projectId: "project-a",
  request: {
    topic: "ORBIT",
    prompt: "핵심 메시지",
    designPrompt: "차분한 리포트",
    targetDurationMinutes: 10,
    slideCountRange: { min: 4, max: 6 },
    assets: [
      { fileId: "file_content", role: "content" },
      { fileId: "file_design", role: "design" }
    ]
  }
};

const storage: Pick<StoragePort, "getSignedReadUrl" | "putObject"> = {
  getSignedReadUrl: vi.fn(async (key: string) => `http://storage.local/${key}`),
  putObject: vi.fn(async (input: { key: string; contentType: string }) => ({
    key: input.key,
    url: "http://storage.local/generated",
    contentType: input.contentType,
    purpose: "design-asset" as const,
    size: 3
  }))
};

describe("processAiTemplateDeckGenerationJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("extracts content and converts the design PPTX before saving the final AI deck", async () => {
    const insertedDecks: unknown[] = [];
    const insertedSnapshots: unknown[][] = [];
    const insertedBlueprints: unknown[] = [];
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
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_content",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_content.pdf",
            mime_type: "application/pdf",
            original_name: "content.pdf",
            size: 12,
            purpose: "reference-material",
            status: "uploaded"
          },
          {
            file_id: "file_design",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_design.pptx",
            mime_type: pptxMimeType,
            original_name: "design.pptx",
            size: 24,
            purpose: "pptx-import",
            status: "uploaded"
          }
        ];
      }
      if (sql.includes("INSERT INTO decks")) {
        insertedDecks.push(params[2]);
      }
      if (sql.includes("INSERT INTO deck_snapshots")) {
        insertedSnapshots.push(params);
      }
      if (sql.includes("INSERT INTO template_blueprints")) {
        insertedBlueprints.push(params[4]);
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://storage.local/")) {
        return new Response(url.endsWith(".pptx") ? "pptx-bytes" : "content-bytes");
      }
      if (url.endsWith("/documents/parse")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                referenceDocumentId: "file_content",
                fileName: "content.pdf",
                kind: "pdf",
                status: "succeeded",
                rawText: "reference",
                cleanedText: "cleaned reference",
                keywords: [{ keyword: "ORBIT" }]
              }
            ]
          })
        );
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        return new Response(JSON.stringify(ooxmlGenerationResponse()));
      }
      if (url.endsWith("/ai/generate-deck")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          topic: "ORBIT",
          references: [{ fileId: "file_content" }],
          designReferences: [{ fileId: "file_design" }],
          referenceKeywords: [{ text: "ORBIT" }],
          referenceContext: [
            {
              fileId: "file_content",
              title: "content.pdf",
              content: "cleaned reference"
            }
          ],
          slideCountRange: { min: 4, max: 6 },
          templateBlueprint: expect.objectContaining({
            templateId: "template_file_design"
          })
        });
        expect(body.templateBlueprint.slides).toHaveLength(10);
        expect(body.templateBlueprint.slides[0].slots[0].slotRole).toBe("title");
        expect(body.templateBlueprint.slides[0].slots[1].slotRole).toBe("body");
        expect(
          body.templateBlueprint.slides[0].slots.map(
            (slot: { usage: string }) => slot.usage
          )
        ).toEqual(["content-slot", "content-slot", "content-slot"]);
        return new Response(JSON.stringify(generateDeckResponse()));
      }
      if (url.endsWith("/ai/pptx-ooxml-apply-slot-texts")) {
        const form = init?.body as FormData;
        const blueprint = JSON.parse(String(form.get("template_blueprint")));
        expect(blueprint.slides.map((slide: { sourceSlideIndex: number }) => slide.sourceSlideIndex))
          .toEqual([1, 2, 3, 4, 5]);
        expect(blueprint.slides.map((slide: { cloneSourceSlideIndex: number }) => slide.cloneSourceSlideIndex))
          .toEqual([3, 3, 3, 3, 3]);
        expect(blueprint.slides[0].cloneSourceSlidePart).toBe("ppt/slides/slide3.xml");
        expect(blueprint.slides[0].slots[0].slotRole).toBe("title");
        expect(blueprint.slides[0].slots[1].slotRole).toBe("body");
        const slotTexts = JSON.parse(String(form.get("slot_texts")));
        expect(slotTexts).toHaveLength(15);
        expect(slotTexts[0]).toBe("ORBIT");
        expect(slotTexts[1]).toContain("1");
        expect(slotTexts[2]).toBe("ORBIT");
        expect(slotTexts[3]).toBe("ORBIT 2");
        return new Response(JSON.stringify(ooxmlApplyResponse()));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processAiTemplateDeckGenerationJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/documents/parse",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/ai/pptx-ooxml-generation",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/ai/pptx-ooxml-apply-slot-texts",
      expect.objectContaining({ method: "POST" })
    );
    const deck = insertedDecks[0] as {
      metadata: { thumbnailSource?: string };
      slides: Array<{ thumbnailUrl: string }>;
    };
    expect(deck.slides).toHaveLength(5);
    expect(deck.metadata.thumbnailSource).toBe("import-render");
    for (const slide of deck.slides) {
      expect(slide.thumbnailUrl).toMatch(
        /\/api\/v1\/projects\/project-a\/assets\/file_.*\/content/
      );
    }
    expect(insertedSnapshots).toHaveLength(1);
    expect(insertedSnapshots[0][1]).toBe("project-a");
    expect(insertedSnapshots[0][2]).toBe("deck_ai_project_a");
    expect(insertedSnapshots[0][3]).toEqual(deck);
    const blueprint = insertedBlueprints.at(-1) as {
      currentPackageFileId: string;
      slides: Array<{ renderAssetFileId: string; sourceSlideIndex: number }>;
    };
    expect(blueprint.currentPackageFileId).toMatch(/^file_/);
    expect(blueprint.slides.map((slide) => slide.sourceSlideIndex)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(blueprint.slides[0].renderAssetFileId).toMatch(/^file_/);
    expect(job.result).toMatchObject({
      deckId: "deck_ai_project_a",
      sourceFileId: "file_design",
      currentPackageFileId: blueprint.currentPackageFileId,
      contentReferenceFileIds: ["file_content"]
    });
  });

  it("sends slide body text to caption template slots", async () => {
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
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_content",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_content.pdf",
            mime_type: "application/pdf",
            original_name: "content.pdf",
            size: 12,
            purpose: "reference-material",
            status: "uploaded"
          },
          {
            file_id: "file_design",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_design.pptx",
            mime_type: pptxMimeType,
            original_name: "design.pptx",
            size: 24,
            purpose: "pptx-import",
            status: "uploaded"
          }
        ];
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://storage.local/")) {
        return new Response(url.endsWith(".pptx") ? "pptx-bytes" : "content-bytes");
      }
      if (url.endsWith("/documents/parse")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                referenceDocumentId: "file_content",
                fileName: "content.pdf",
                kind: "pdf",
                status: "succeeded",
                rawText: "reference",
                cleanedText: "cleaned reference",
                keywords: []
              }
            ]
          })
        );
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        return new Response(
          JSON.stringify(ooxmlGenerationResponse(captionTemplateBlueprint()))
        );
      }
      if (url.endsWith("/ai/generate-deck")) {
        return new Response(JSON.stringify(generateDeckResponse()));
      }
      if (url.endsWith("/ai/pptx-ooxml-apply-slot-texts")) {
        const form = init?.body as FormData;
        const blueprint = JSON.parse(String(form.get("template_blueprint")));
        const slotTexts = JSON.parse(String(form.get("slot_texts")));
        expect(blueprint.slides[0].slots[1].slotRole).toBe("caption");
        expect(slotTexts[1]).toContain("1");
        return new Response(JSON.stringify(ooxmlApplyResponse()));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processAiTemplateDeckGenerationJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
  });

  it("uses a both-role PPTX as content context and design reference", async () => {
    const bothPayload = {
      ...payload,
      request: {
        ...payload.request,
        assets: [{ fileId: "file_design", role: "both" }]
      }
    };
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
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_design",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_design.pptx",
            mime_type: pptxMimeType,
            original_name: "design.pptx",
            size: 24,
            purpose: "pptx-import",
            status: "uploaded"
          }
        ];
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://storage.local/")) {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/documents/parse")) {
        const form = init?.body as FormData;
        expect(form.getAll("file_ids")).toEqual(["file_design"]);
        return new Response(
          JSON.stringify({
            files: [
              {
                referenceDocumentId: "file_design",
                fileName: "design.pptx",
                kind: "pptx",
                status: "succeeded",
                rawText: "PPTX source text",
                cleanedText: "PPTX cleaned source text",
                keywords: [{ keyword: "PPTX keyword" }]
              }
            ]
          })
        );
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        return new Response(JSON.stringify(ooxmlGenerationResponse()));
      }
      if (url.endsWith("/ai/generate-deck")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          references: [{ fileId: "file_design" }],
          designReferences: [{ fileId: "file_design" }],
          referenceKeywords: [{ text: "PPTX keyword" }],
          referenceContext: [
            {
              fileId: "file_design",
              title: "design.pptx",
              content: "PPTX cleaned source text"
            }
          ]
        });
        return new Response(JSON.stringify(generateDeckResponse("file_design")));
      }
      if (url.endsWith("/ai/pptx-ooxml-apply-slot-texts")) {
        return new Response(JSON.stringify(ooxmlApplyResponse()));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processAiTemplateDeckGenerationJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      bothPayload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(job.result).toMatchObject({
      sourceFileId: "file_design",
      contentReferenceFileIds: ["file_design"]
    });
  });

  it("fails without saving the deck when final render thumbnails are incomplete", async () => {
    const insertedDecks: unknown[] = [];
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
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_content",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_content.pdf",
            mime_type: "application/pdf",
            original_name: "content.pdf",
            size: 12,
            purpose: "reference-material",
            status: "uploaded"
          },
          {
            file_id: "file_design",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_design.pptx",
            mime_type: pptxMimeType,
            original_name: "design.pptx",
            size: 24,
            purpose: "pptx-import",
            status: "uploaded"
          }
        ];
      }
      if (sql.includes("INSERT INTO decks")) {
        insertedDecks.push(params[2]);
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("http://storage.local/")) {
        return new Response(url.endsWith(".pptx") ? "pptx-bytes" : "content-bytes");
      }
      if (url.endsWith("/documents/parse")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                referenceDocumentId: "file_content",
                fileName: "content.pdf",
                kind: "pdf",
                status: "succeeded",
                rawText: "reference",
                cleanedText: "cleaned reference",
                keywords: [{ keyword: "ORBIT" }]
              }
            ]
          })
        );
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        return new Response(JSON.stringify(ooxmlGenerationResponse()));
      }
      if (url.endsWith("/ai/generate-deck")) {
        return new Response(JSON.stringify(generateDeckResponse()));
      }
      if (url.endsWith("/ai/pptx-ooxml-apply-slot-texts")) {
        return new Response(JSON.stringify(ooxmlApplyResponse(4)));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processAiTemplateDeckGenerationJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("AI_TEMPLATE_DECK_GENERATION_SAVE_FAILED");
    expect(job.error?.message).toContain("asset:slide_render_5");
    expect(insertedDecks).toHaveLength(0);
  });
});

function ooxmlGenerationResponse(template = templateBlueprint(10)) {
  return {
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    blueprint: {
      theme: theme(),
      slides: [
        {
          sourceSlideIndex: 1,
          style: { layout: "title-content" },
          elements: [
            {
              elementId: "el_title",
              type: "text",
              role: "title",
              x: 100,
              y: 80,
              width: 900,
              height: 120,
              rotation: 0,
              opacity: 1,
              zIndex: 1,
              locked: false,
              visible: true,
              props: {
                text: "Template",
                fontSize: 48,
                fontWeight: "bold",
                color: "#111827",
                align: "left",
                verticalAlign: "top",
                lineHeight: 1.2
              }
            }
          ]
        }
      ]
    },
    templateBlueprint: template,
    qualityReport: qualityReport(),
    assets: [
      {
        assetId: "current_package",
        fileName: "design.pptx",
        mimeType: pptxMimeType,
        contentBase64: Buffer.from("pptx").toString("base64")
      },
      ...renderAssets("png", 10)
    ],
    warnings: []
  };
}

function ooxmlApplyResponse(renderCount = 10) {
  return {
    assets: [
      {
        assetId: "current_package",
        fileName: "design.pptx",
        mimeType: pptxMimeType,
        contentBase64: Buffer.from("final-pptx").toString("base64")
      },
      ...renderAssets("final-png", renderCount)
    ],
    warnings: []
  };
}

function generateDeckResponse(referenceFileId = "file_content") {
  const selection = [3, 3, 3, 3, 3];
  return {
    deck: {
      deckId: "deck_ai_project_a",
      projectId: "project-a",
      title: "ORBIT",
      version: 1,
      targetDurationMinutes: 10,
      metadata: {
        language: "ko",
        locale: "ko-KR",
        sourceType: "ai",
        generatedBy: "ai",
        audience: "general",
        purpose: "inform",
        tone: "professional",
        createdFrom: {
          topic: "ORBIT",
          references: [{ fileId: referenceFileId }],
          designReferences: [{ fileId: "file_design" }]
        }
      },
      canvas: {
        preset: "wide-16-9",
        width: 1920,
        height: 1080,
        aspectRatio: "16:9"
      },
      theme: theme(),
      slides: selection.map((_, index) => deckSlide(index + 1, referenceFileId))
    },
    templateSelection: selection.map((sourceSlideIndex, index) => ({
      generatedOrder: index + 1,
      sourceSlideIndex,
      selectionReason: `matched source slide ${sourceSlideIndex}`
    })),
    warnings: [],
    validation: {
      passed: true,
      layoutIssues: [],
      contentIssues: [],
      designIssues: [],
      presentationIssues: []
    }
  };
}

function deckSlide(order: number, referenceFileId: string) {
  return {
    slideId: `slide_${order}`,
    order,
    title: order === 1 ? "ORBIT" : `ORBIT ${order}`,
    thumbnailUrl: "",
    style: { layout: "title-content" },
    speakerNotes: "발표 대본",
    elements: [
      {
        elementId: `el_${order}_imported_0_text`,
        type: "text",
        role: "body",
        x: 100,
        y: 240,
        width: 900,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        locked: false,
        visible: true,
        props: {
          text: `핵심 메시지 ${order}`,
          fontSize: 32,
          color: "#111827",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      }
    ],
    keywords: [
      {
        keywordId: `kw_${order}_1`,
        text: "ORBIT",
        synonyms: [],
        abbreviations: []
      }
    ],
    animations: [],
    actions: [],
    aiNotes: {
      emphasisPoints: [`핵심 메시지 ${order}`],
      sourceEvidence: [{ fileId: referenceFileId }]
    }
  };
}

function templateBlueprint(slideCount = 1) {
  return {
    templateId: "template_file_design",
    sourceFileId: "file_design",
    sourcePackageFileId: "file_design",
    currentPackageFileId: "asset:current_package",
    slides: Array.from({ length: slideCount }, (_, index) =>
      templateBlueprintSlide(index + 1)
    )
  };
}

function captionTemplateBlueprint() {
  const blueprint = templateBlueprint(10);
  return {
    ...blueprint,
    slides: blueprint.slides.map((slide) =>
      slide.sourceSlideIndex === 3
        ? {
            ...slide,
            slots: slide.slots.map((slot) =>
              slot.elementId === "el_body_3"
                ? { ...slot, slotRole: "caption" as const }
                : slot
            )
          }
        : slide
    )
  };
}

function templateBlueprintSlide(sourceSlideIndex: number) {
  return {
    slideIndex: sourceSlideIndex,
    sourceSlideIndex,
    slideRole: sourceSlideIndex === 1 ? "cover" : "body",
    layoutType: "title-content",
    contentCapacity: "medium",
    renderAssetFileId: `asset:slide_render_${sourceSlideIndex}`,
    slots: [
      {
        elementId: `el_title_${sourceSlideIndex}`,
        usage: "fixed-text",
        slotRole: "title",
        replaceMode: "preserve",
        confidence: 0.45,
        bounds: { x: 100, y: 80, width: 900, height: 120 },
        source: {
          type: "slide",
          slidePart: `ppt/slides/slide${sourceSlideIndex}.xml`,
          shapeId: "2",
          writable: true
        }
      },
      {
        elementId: `el_body_${sourceSlideIndex}`,
        usage: "fixed-text",
        slotRole: "body",
        replaceMode: "preserve",
        confidence: 0.45,
        bounds: { x: 100, y: 240, width: 900, height: 180 },
        source: {
          type: "slide",
          slidePart: `ppt/slides/slide${sourceSlideIndex}.xml`,
          shapeId: "3",
          writable: true
        }
      },
      {
        elementId: `el_label_${sourceSlideIndex}`,
        usage: "content-slot",
        slotRole: "label",
        replaceMode: "replace",
        confidence: 0.65,
        bounds: { x: 100, y: 440, width: 300, height: 60 },
        source: {
          type: "slide",
          slidePart: `ppt/slides/slide${sourceSlideIndex}.xml`,
          shapeId: "4",
          writable: true
        }
      }
    ]
  };
}

function renderAssets(content: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const slideNumber = index + 1;
    return {
      assetId: `slide_render_${slideNumber}`,
      fileName: `slide-${String(slideNumber).padStart(2, "0")}.png`,
      mimeType: "image/png",
      contentBase64: Buffer.from(content).toString("base64")
    };
  });
}

function theme() {
  return {
    name: "Imported PPTX",
    fontFamily: "Inter",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    accentColor: "#2563eb",
    palette: {
      primary: "#2563eb",
      secondary: "#7c3aed",
      surface: "#ffffff",
      muted: "#f3f4f6",
      border: "#d1d5db"
    },
    typography: {
      headingFontFamily: "Inter",
      bodyFontFamily: "Inter",
      titleSize: 56,
      headingSize: 40,
      bodySize: 24,
      captionSize: 16
    },
    effects: { borderRadius: 8 }
  };
}

function qualityReport() {
  return {
    compositeScore: 84,
    metrics: {
      geometry: 90,
      text: 82,
      color: 86,
      layer: 88,
      editability: 80,
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
    editabilityCoverage: 0.8,
    appliedCap: null,
    slideReports: [],
    notes: []
  };
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    job_id: "job-template",
    project_id: "project-a",
    type: "ai-template-deck-generation",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-07-04T00:00:00.000Z",
    updated_at: "2026-07-04T00:00:01.000Z"
  };
}
