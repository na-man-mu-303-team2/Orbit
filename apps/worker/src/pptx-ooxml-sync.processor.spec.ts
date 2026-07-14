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
  getSignedReadUrl: vi.fn(async (key: string) =>
    key.endsWith("image.png")
      ? "http://storage.local/image.png"
      : "http://storage.local/current.pptx",
  ),
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

  it("coalesces to the latest stored version, embeds project images, and conditionally compacts patches", async () => {
    let savedBlueprint: Record<string, unknown> | null = null;
    const { dataSource, query } = createDataSource({
      deckVersion: 3,
      syncedVersion: 1,
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Updated title" },
        },
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_image",
          props: {
            src: "/api/v1/projects/project-a/assets/file_image/content",
          },
        },
      ],
      onBlueprintUpdate: (blueprint) => {
        savedBlueprint = blueprint;
        return true;
      },
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("current.pptx")) return new Response("pptx-bytes");
      if (url.endsWith("image.png")) {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      if (url.endsWith("/ai/pptx-ooxml-sync")) {
        const form = init?.body as FormData;
        expect(form.get("synced_deck_version")).toBe("3");
        expect(JSON.parse(String(form.get("operations")))).toEqual([
          expect.objectContaining({
            type: "update_element_props",
            props: { text: "Updated title" },
          }),
          expect.objectContaining({
            type: "update_element_props",
            props: { src: "data:image/png;base64,AQID" },
          }),
        ]);
        return new Response(JSON.stringify(workerResponse()));
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(job.result).toMatchObject({ syncedDeckVersion: 3 });
    expect(savedBlueprint).toMatchObject({
      currentPackageFileId: expect.stringMatching(/^file_/),
      ooxmlSyncedDeckVersion: 3,
    });
    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["project-a:deck_a"],
    );
    const conditionalUpdate = query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE template_blueprints"),
    );
    expect(String(conditionalUpdate?.[0])).toContain(
      "ooxmlSyncedDeckVersion')::integer, 0) < $5",
    );
    expect(conditionalUpdate?.[1]?.[4]).toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM deck_patches"),
      ["project-a", "deck_a", 3],
    );
  });

  it("treats a lower queued version as a no-op after a newer package is synced", async () => {
    const { dataSource, query } = createDataSource({
      deckVersion: 3,
      syncedVersion: 3,
      operations: [],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      currentPackageFileId: "file_current",
      syncedDeckVersion: 3,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE template_blueprints"),
      ),
    ).toBe(false);
  });

  it("does not compact patches when the conditional blueprint update loses to a newer version", async () => {
    const { dataSource, query } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Version two" },
        },
      ],
      onBlueprintUpdate: () => false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(JSON.stringify(workerResponse())),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PPTX_OOXML_SYNC_FAILED");
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("DELETE FROM deck_patches"),
      ),
    ).toBe(false);
  });
});

function createDataSource(input: {
  deckVersion: number;
  syncedVersion: number;
  operations: unknown[];
  onBlueprintUpdate?: (blueprint: Record<string, unknown>) => boolean;
}) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
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
    if (sql.includes("pg_advisory_xact_lock")) return [{ locked: true }];
    if (sql.includes("FROM template_blueprints")) {
      return [
        {
          template_id: "template_a",
          blueprint_json: templateBlueprint(input.syncedVersion),
          quality_report_json: {},
        },
      ];
    }
    if (sql.includes("SELECT deck_json, version")) {
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
          version: input.deckVersion,
        },
      ];
    }
    if (sql.includes("FROM project_assets") && sql.includes("ANY($1)")) {
      return [
        {
          file_id: "file_image",
          project_id: "project-a",
          storage_key: "projects/project-a/assets/image.png",
          mime_type: "image/png",
          status: "uploaded",
        },
      ];
    }
    if (sql.includes("FROM project_assets")) {
      return [
        {
          file_id: "file_current",
          project_id: "project-a",
          storage_key: "projects/project-a/assets/current.pptx",
          mime_type: pptxMimeType,
          original_name: "current.pptx",
          size: 12,
          purpose: "design-asset",
          status: "uploaded",
        },
      ];
    }
    if (sql.includes("FROM deck_patches")) {
      return [{ operations: input.operations }];
    }
    if (sql.includes("INSERT INTO project_assets")) return [];
    if (sql.includes("UPDATE template_blueprints")) {
      const accepted =
        input.onBlueprintUpdate?.(params[3] as Record<string, unknown>) ?? true;
      return accepted ? [{ template_id: "template_a" }] : [];
    }
    if (sql.includes("DELETE FROM deck_patches")) return [];
    return [];
  });
  const manager = { query };
  const dataSource = {
    query,
    transaction: vi.fn(async (callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  } as unknown as DataSource;
  return { dataSource, query };
}

function templateBlueprint(syncedVersion: number) {
  return {
    templateId: "template_a",
    sourceFileId: "file_source",
    sourcePackageFileId: "file_source",
    currentPackageFileId: "file_current",
    ooxmlSyncedDeckVersion: syncedVersion,
    slides: [
      {
        slideIndex: 1,
        sourceSlideIndex: 1,
        renderAssetFileId: "file_render_1",
        elementSources: [
          {
            elementId: "el_title",
            slidePart: "ppt/slides/slide1.xml",
            shapeId: "2",
            sourceType: "slide",
            writable: true,
          },
          {
            elementId: "el_image",
            slidePart: "ppt/slides/slide1.xml",
            shapeId: "3",
            relationshipId: "rId2",
            sourceType: "image",
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
