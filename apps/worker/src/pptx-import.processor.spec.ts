import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processPptxImportJob } from "./pptx-import.processor";

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const payload = {
  jobId: "job-pptx",
  projectId: "project-a",
  fileId: "file_template"
};

const storage: Pick<StoragePort, "getSignedReadUrl" | "putObject"> = {
  getSignedReadUrl: vi.fn(async () => "http://storage.local/template.pptx"),
  putObject: vi.fn(async (input: { key: string; contentType: string }) => ({
    key: input.key,
    url: "http://storage.local/design-asset.png",
    contentType: input.contentType,
    purpose: "design-asset" as const,
    size: 3
  }))
};

describe("processPptxImportJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("imports PPTX assets and preserves success when Brief extraction falls back", async () => {
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
            file_id: "file_template",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_template-template.pptx",
            mime_type: pptxMimeType,
            original_name: "template.pptx",
            size: 12,
            purpose: "pptx-import",
            status: "uploaded"
          }
        ];
      }
      return [];
    });
    let briefUnavailable = false;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "http://storage.local/template.pptx") {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/design/import-pptx")) {
        return new Response(
          JSON.stringify({
            blueprint: {
              theme: importedTheme(),
              slides: [
                {
                  style: { layout: "title-content", backgroundColor: "#ffffff" },
                  elements: [
                    {
                      elementId: "el_imported_1_title",
                      type: "text",
                      role: "title",
                      x: 100,
                      y: 80,
                      width: 800,
                      height: 120,
                      rotation: 0,
                      opacity: 1,
                      zIndex: 1,
                      locked: false,
                      visible: true,
                      props: { text: "Imported title", fontSize: 44 }
                    },
                    {
                      elementId: "el_imported_1_image",
                      type: "image",
                      role: "media",
                      x: 900,
                      y: 200,
                      width: 420,
                      height: 240,
                      rotation: 0,
                      opacity: 1,
                      zIndex: 2,
                      locked: false,
                      visible: true,
                      props: {
                        src: "asset:image_1",
                        alt: "Imported",
                        fit: "contain",
                        focusX: 0.5,
                        focusY: 0.5
                      }
                    }
                  ]
                }
              ]
            },
            templateBlueprint: {
              templateId: "template_file_template",
              sourceFileId: "file_template",
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
                      bounds: { x: 100, y: 80, width: 800, height: 120 },
                      source: { type: "placeholder", placeholderType: "title" }
                    }
                  ]
                }
              ]
            },
            qualityReport: qualityReport(),
            assets: [
              {
                assetId: "image_1",
                fileName: "image.png",
                mimeType: "image/png",
                contentBase64: Buffer.from("img").toString("base64")
              }
            ],
            warnings: ["pixel renderer unavailable"]
          })
        );
      }
      if (url.endsWith("/ai/extract-presentation-brief")) {
        if (briefUnavailable) {
          return new Response("unavailable", { status: 503 });
        }
        return new Response(
          JSON.stringify({
            briefDraft: {
              audience: "decision-maker",
              purpose: "report",
              evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
              targetDurationMinutes: 12,
              desiredOutcome: "가져온 자료의 핵심 결정을 검토한다.",
              requirements: [],
              terminology: [],
              challengeTopics: []
            },
            briefExtraction: { status: "ai", warnings: [] }
          })
        );
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxImportJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(storage.getSignedReadUrl).toHaveBeenCalledWith(
      "projects/project-a/assets/file_template-template.pptx"
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png", purpose: "design-asset" })
    );
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))).toBe(
      true
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO template_blueprints"))
    ).toBe(true);
    expect(job.result).toMatchObject({
      deckId: "deck_import_file_template",
      templateId: "template_file_template",
      briefDraft: {
        audience: "decision-maker",
        purpose: "report"
      },
      briefExtraction: { status: "ai", warnings: [] },
      warnings: ["pixel renderer unavailable"]
    });

    briefUnavailable = true;
    const fallbackJob = await processPptxImportJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(fallbackJob.status).toBe("succeeded");
    expect(fallbackJob.result).toMatchObject({
      briefDraft: {
        audience: "novice",
        purpose: "inform",
        targetDurationMinutes: 5
      },
      briefExtraction: {
        status: "fallback",
        warnings: ["brief-extraction-unavailable"]
      }
    });
  });

  it("fails when the source asset is not a PPTX import upload", async () => {
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
            file_id: "file_template",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_template.pdf",
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

    const job = await processPptxImportJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PPTX_IMPORT_SOURCE_FAILED");
    expect(fetch).not.toHaveBeenCalled();
  });
});

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    job_id: "job-pptx",
    project_id: "project-a",
    type: "pptx-import",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:01.000Z"
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

function importedTheme() {
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
      border: "#dbe3f0"
    },
    typography: {
      headingFontFamily: "Inter",
      bodyFontFamily: "Inter",
      titleSize: 56,
      headingSize: 36,
      bodySize: 22,
      captionSize: 16
    },
    effects: {
      borderRadius: 8
    }
  };
}
