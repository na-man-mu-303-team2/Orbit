import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processPptxImportJob } from "./pptx-import.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  fileId: "file-1"
};

describe("processPptxImportJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the uploaded PPTX asset, imports it through Python worker, and saves the deck", async () => {
    const deck = createDeck();
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([assetRow()])
      .mockResolvedValueOnce([jobRow("running", 45, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            deckId: deck.deckId,
            deck,
            warnings: []
          },
          null
        )
      ]);
    const storage = {
      getSignedReadUrl: vi.fn(async () => "http://storage.local/file-1.pptx")
    } as unknown as StoragePort;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);

      if (url === "http://storage.local/file-1.pptx") {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }

      return new Response(JSON.stringify({ deck, warnings: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxImportJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(storage.getSignedReadUrl).toHaveBeenCalledWith(
      "projects/project-a/assets/file-1/team-update.pptx"
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/pptx/import",
      expect.objectContaining({ method: "POST" })
    );
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[3][0]).toContain("INSERT INTO decks");
  });

  it("marks the DB job failed when the uploaded asset does not exist", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        jobRow("failed", 10, null, {
          code: "PPTX_IMPORT_ASSET_NOT_FOUND",
          message: "Uploaded PPTX asset not found: file-1"
        })
      ]);

    const job = await processPptxImportJob(
      { query } as unknown as DataSource,
      {} as StoragePort,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe("Uploaded PPTX asset not found: file-1");
    expect(query).toHaveBeenCalledTimes(3);
  });
});

function createDeck() {
  return {
    deckId: "deck_project-a",
    projectId: "project-a",
    title: "team-update",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "import"
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    theme: {
      name: "Orbit Import",
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
        borderRadius: 10,
        shadow: {
          color: "#111827",
          blur: 18,
          offsetX: 0,
          offsetY: 8,
          opacity: 0.16
        }
      }
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "Intro",
        thumbnailUrl: "",
        style: {},
        speakerNotes: "hello",
        elements: [],
        keywords: [],
        animations: [],
        aiNotes: {
          emphasisPoints: [],
          sourceEvidence: [{ fileId: "file-1" }]
        }
      }
    ]
  };
}

function assetRow() {
  return {
    file_id: "file-1",
    project_id: "project-a",
    storage_key: "projects/project-a/assets/file-1/team-update.pptx",
    original_name: "team-update.pptx",
    mime_type:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    status: "uploaded"
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
    type: "pptx-import",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-06-29T00:00:00.000Z",
    updated_at: "2026-06-29T00:00:01.000Z"
  };
}
