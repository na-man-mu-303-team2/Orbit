import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processGenerateDeckJob } from "./generate-deck.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  request: {
    topic: "AI 덱 생성",
    designPrompt: "retro pixel palette",
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
        referenceKeywords: [{ text: "실시간 발표 피드백" }]
      })
    );
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("INSERT INTO decks");
    expect(job.result?.warnings).toEqual(warnings);
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
          animations: [],
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
