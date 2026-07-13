import type { StoragePort } from "@orbit/storage";
import type { Deck, Job } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  embedDeckImageAssets,
  processDeckExportJob
} from "./deck-export.processor";

const storage: Pick<StoragePort, "putObject" | "getSignedReadUrl"> = {
  getSignedReadUrl: vi.fn(async () => "http://storage.local/image.png"),
  putObject: vi.fn(async (input: { key: string; contentType: string }) => ({
    key: input.key,
    url: "http://storage.local/export.pptx",
    contentType: input.contentType,
    purpose: "export-result" as const,
    size: 4,
  })),
};

describe("processDeckExportJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("exports the deck snapshot through Python and stores a PPTX asset", async () => {
    const deck = createDeck();
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 20, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            deckId: deck.deckId,
            fileId: "file_export",
            url: "/api/v1/projects/project-a/assets/file_export/content",
            format: "pptx",
            warnings: [],
          },
          null,
        ),
      ]);
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        format: "pptx",
        deck: {
          deckId: deck.deckId,
          slides: deck.slides,
        },
      });
      return new Response(
        JSON.stringify({
          contentBase64: Buffer.from("pptx").toString("base64"),
          warnings: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processDeckExportJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        jobId: "job-export",
        projectId: "project-a",
        deck,
        format: "pptx",
      },
    );

    expect(job.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/ai/export-deck-pptx",
      expect.objectContaining({ method: "POST" }),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        purpose: "export-result",
      }),
    );
    expect(query.mock.calls[1][0]).toContain("INSERT INTO project_assets");
    expect(job.result).toMatchObject({
      deckId: deck.deckId,
      format: "pptx",
      warnings: [],
    });
  });

  it("embeds internal image assets only in the PPTX export payload", async () => {
    const deck = createDeck();
    deck.slides[0].elements.push({
      elementId: "el_image",
      type: "image",
      role: "media",
      x: 100,
      y: 100,
      width: 400,
      height: 240,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      props: {
        src: "/api/v1/projects/project-a/assets/file_image/content",
        alt: "Product",
        fit: "cover",
        focusX: 0.5,
        focusY: 0.5
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      )
    );
    const query = vi.fn(async () => [
      {
        file_id: "file_image",
        storage_key: "projects/project-a/assets/file_image.png",
        mime_type: "image/png"
      }
    ]);

    const embedded = await embedDeckImageAssets(
      { query } as unknown as DataSource,
      storage,
      "project-a",
      deck
    );
    const image = embedded.slides[0].elements.find(
      (element) => element.type === "image"
    );

    expect(image?.props.src).toBe("data:image/png;base64,AQID");
    expect(deck.slides[0].elements.find((element) => element.type === "image")?.props.src).toBe(
      "/api/v1/projects/project-a/assets/file_image/content"
    );
  });
});

function createDeck(): Deck {
  return {
    deckId: "deck_ai_1",
    projectId: "project-a",
    title: "AI Export",
    version: 1,
    targetDurationMinutes: 10,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "ai",
      generatedBy: "ai",
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    },
    theme: {
      name: "brandlogy-modern",
      fontFamily: "Pretendard",
      backgroundColor: "#FFFFFF",
      textColor: "#111827",
      accentColor: "#2563EB",
      palette: {
        primary: "#2563EB",
        secondary: "#F472B6",
        surface: "#FFFFFF",
        muted: "#F8FAFC",
        border: "#DBEAFE",
      },
      typography: {
        headingFontFamily: "Pretendard",
        bodyFontFamily: "Pretendard",
        titleSize: 56,
        headingSize: 40,
        bodySize: 24,
        captionSize: 16,
      },
      effects: { borderRadius: 8 },
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "Opening",
        thumbnailUrl: "",
        style: {
          backgroundColor: "#FFFFFF",
          textColor: "#111827",
          accentColor: "#2563EB",
          layout: "title",
        },
        speakerNotes: "",
        elements: [],
        keywords: [],
        semanticCues: [],
        animations: [],
        actions: [],
      },
    ],
  };
}

function jobRow(
  status: Job["status"],
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
) {
  return {
    job_id: "job-export",
    project_id: "project-a",
    type: "deck-export",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}
