import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processPptxOoxmlSyncJob } from "./pptx-ooxml-sync.processor";

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const payload = {
  jobId: "job-sync",
  projectId: "project-a",
  deckId: "deck_a",
  changeId: "change-a",
  targetDeckVersion: 2,
};

const storage: Pick<StoragePort, "getSignedReadUrl" | "putObject"> = {
  getSignedReadUrl: vi.fn(async () => "http://storage.local/current.pptx"),
  putObject: vi.fn(async (input: { key: string; contentType: string }) => ({
    key: input.key,
    url: "http://storage.local/design-asset",
    contentType: input.contentType,
    purpose: "design-asset" as const,
    size: 3,
  })),
};

describe("processPptxOoxmlSyncJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("syncs unsynced deck patches into the current PPTX package", async () => {
    const updatedBlueprints: unknown[] = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("UPDATE jobs")) {
        return [
          jobRow(
            params[1] as "running" | "succeeded" | "failed",
            params[2] as number,
            params[4] as Record<string, unknown> | null,
            params[5] as { code: string; message: string } | null,
          ),
        ];
      }
      if (sql.includes("FROM template_blueprints")) {
        return [
          {
            template_id: "template_a",
            blueprint_json: templateBlueprint(),
            quality_report_json: qualityReport(),
          },
        ];
      }
      if (sql.includes("FROM project_assets")) {
        return [
          {
            file_id: "file_current",
            project_id: "project-a",
            storage_key: "projects/project-a/assets/file_current-current.pptx",
            mime_type: pptxMimeType,
            original_name: "current.pptx",
            size: 12,
            purpose: "design-asset",
            status: "uploaded",
          },
        ];
      }
      if (sql.includes("SELECT deck_json")) {
        return [
          {
            deck_json: {
              canvas: {
                preset: "wide-16-9",
                width: 1920,
                height: 1080,
                aspectRatio: "16:9",
              },
            },
          },
        ];
      }
      if (sql.includes("FROM deck_patches")) {
        return [
          {
            operations: [
              {
                type: "update_element_props",
                slideId: "slide_import_file_1_1",
                elementId: "el_title",
                props: { text: "Updated title" },
              },
              { type: "update_deck", title: "Ignored by OOXML sync" },
            ],
          },
        ];
      }
      if (sql.includes("INSERT INTO project_assets")) {
        return [];
      }
      if (sql.includes("UPDATE template_blueprints")) {
        updatedBlueprints.push(params[3]);
        return [];
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://storage.local/current.pptx") {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/ai/pptx-ooxml-sync")) {
        const form = init?.body as FormData;
        expect(JSON.parse(String(form.get("operations")))).toEqual([
          {
            type: "update_element_props",
            slideId: "slide_import_file_1_1",
            elementId: "el_title",
            props: { text: "Updated title" },
          },
        ]);
        return new Response(JSON.stringify(workerResponse()));
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlSyncJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    expect(job.result).toMatchObject({
      deckId: "deck_a",
      templateId: "template_a",
      syncedDeckVersion: 2,
    });
    expect(updatedBlueprints[0]).toMatchObject({
      currentPackageFileId: expect.stringMatching(/^file_/),
      ooxmlSyncedDeckVersion: 2,
      slides: [
        {
          renderAssetFileId: expect.stringMatching(/^file_/),
        },
      ],
    });
  });
});

function templateBlueprint() {
  return {
    templateId: "template_a",
    sourceFileId: "file_source",
    sourcePackageFileId: "file_source",
    currentPackageFileId: "file_current",
    ooxmlSyncedDeckVersion: 1,
    slides: [
      {
        slideIndex: 1,
        sourceSlideIndex: 1,
        elementSources: [
          {
            elementId: "el_title",
            slidePart: "ppt/slides/slide1.xml",
            shapeId: "2",
            sourceType: "slide",
            writable: true,
          },
        ],
        slots: [],
      },
    ],
  };
}

function workerResponse() {
  return {
    assets: [
      {
        assetId: "current_package",
        fileName: "current.pptx",
        mimeType: pptxMimeType,
        contentBase64: Buffer.from("pptx").toString("base64"),
      },
      {
        assetId: "slide_render_1",
        fileName: "slide-01.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("png").toString("base64"),
      },
    ],
    elementSources: [],
    warnings: [],
  };
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
) {
  return {
    job_id: "job-sync",
    project_id: "project-a",
    type: "pptx-ooxml-sync",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:01.000Z",
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
      pixelSimilarity: null,
    },
    weights: {
      geometry: 25,
      text: 15,
      color: 10,
      layer: 10,
      editability: 10,
      pixelSimilarity: 30,
    },
    editabilityCoverage: 0.6,
    appliedCap: null,
    notes: [],
  };
}
