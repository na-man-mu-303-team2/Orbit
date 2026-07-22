import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  processPptxOoxmlGenerationJob,
  selectSlideImportRenderMode
} from "./pptx-ooxml-generation.processor";

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const payload = {
  jobId: "job-ooxml",
  projectId: "project-a",
  request: {
    fileId: "file_template"
  }
};

const storage: Pick<StoragePort, "getSignedReadUrl" | "putObject"> = {
  getSignedReadUrl: vi.fn(async () => "http://storage.local/template.pptx"),
  putObject: vi.fn(async (input: { key: string; contentType: string }) => ({
    key: input.key,
    url: "http://storage.local/design-asset",
    contentType: input.contentType,
    purpose: "design-asset" as const,
    size: 3
  }))
};

function createTransactionalDataSource(query: ReturnType<typeof vi.fn>) {
  const manager = { query };
  return {
    query,
    transaction: async (
      run: (transactionManager: typeof manager) => Promise<unknown>
    ) => run(manager)
  } as unknown as DataSource;
}

describe("processPptxOoxmlGenerationJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("stores editable visual elements, render thumbnails, current package, template blueprint, and job result", async () => {
    const insertedDecks: unknown[] = [];
    const insertedBlueprints: unknown[] = [];
    const insertedQualityReports: unknown[] = [];
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
      if (sql.includes("INSERT INTO decks")) {
        insertedDecks.push(params[2]);
      }
      if (sql.includes("INSERT INTO template_blueprints")) {
        insertedBlueprints.push(params[4]);
        insertedQualityReports.push(params[5]);
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://storage.local/template.pptx") {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        const form = init?.body as FormData;
        expect(Array.from(form.keys())).toEqual([
          "file_id",
          "import_preference",
          "file"
        ]);
        expect(form.get("file_id")).toBe("file_template");
        expect(form.get("import_preference")).toBe("editability-first");
        return new Response(JSON.stringify(workerResponse()));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlGenerationJob(
      createTransactionalDataSource(query),
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(storage.putObject).toHaveBeenCalledTimes(4);
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png", purpose: "design-asset" })
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: pptxMimeType, purpose: "design-asset" })
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining("notes-01.png"),
        contentType: "image/png",
        purpose: "design-asset"
      })
    );

    const deck = insertedDecks[0] as {
      metadata: {
        thumbnailSource?: string;
      };
      slides: Array<{
        importRenderMode?: string;
        elements: Array<Record<string, unknown>>;
        transition?: { type: string; durationMs: number };
        animations: Array<Record<string, unknown>>;
        ooxmlMotionCapabilities?: Record<string, unknown>;
        thumbnailUrl: string;
        speakerNotes: string;
        style: { backgroundImage?: { src?: string; fit?: string; opacity?: number } };
      }>;
    };
    expect(deck.metadata.thumbnailSource).toBe("import-render");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects"),
      ["project-a", "template"]
    );
    expect(deck.slides[0].thumbnailUrl).toMatch(
      /\/api\/v1\/projects\/project-a\/assets\/file_.*\/content/
    );
    expect(deck.slides[0].importRenderMode).toBe("editable");
    expect(deck.slides[0].speakerNotes).toBe("asset:notes_render_1");
    expect(deck.slides[0].style.backgroundImage).toBeUndefined();
    expect(deck.slides[0].transition).toEqual({
      type: "fade",
      durationMs: 700
    });
    expect(deck.slides[0].animations).toEqual([
      expect.objectContaining({
        animationId: "anim_imported_title",
        elementId: "el_slot_title",
        startMode: "on-click"
      })
    ]);
    expect(deck.slides[0].ooxmlMotionCapabilities).toEqual({
      transitionWritable: true,
      importedMainSequenceCoverage: "complete"
    });
    expect(deck.slides[0].elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: "el_imported_1_background",
          type: "rect",
          role: "background"
        }),
        expect.objectContaining({
          elementId: "el_slot_title",
          type: "text",
          role: "title",
          locked: false,
          props: expect.objectContaining({
            text: "Editable PPTX Title"
          })
        }),
        expect.objectContaining({
          elementId: "el_slot_media",
          type: "image",
          role: "media",
          locked: false,
          props: expect.objectContaining({
            src: expect.stringMatching(
              /\/api\/v1\/projects\/project-a\/assets\/file_.*\/content/
            )
          })
        })
      ])
    );
    expect(deck.slides[0].elements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ elementId: "el_ooxml_1_render" })
      ])
    );
    expect(deck.slides[0].elements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: "el_slot_title",
          type: "rect",
          props: expect.objectContaining({
            fill: "transparent",
            stroke: "transparent"
          })
        })
      ])
    );

    const blueprint = insertedBlueprints[0] as {
      sourceFileId: string;
      sourcePackageFileId: string;
      currentPackageFileId: string;
      slides: Array<{
        slideId: string;
        renderAssetFileId: string;
        notesPage: { status: string; renderAssetFileId?: string };
      }>;
    };
    expect(blueprint.sourceFileId).toBe("file_template");
    expect(blueprint.sourcePackageFileId).toBe("file_template");
    expect(blueprint.currentPackageFileId).toMatch(/^file_/);
    expect(blueprint.currentPackageFileId).not.toBe(
      blueprint.sourcePackageFileId
    );
    expect(blueprint.slides[0].slideId).toBe(
      "slide_ooxml_file_template_1"
    );
    expect(blueprint.slides[0].renderAssetFileId).toMatch(/^file_/);
    expect(blueprint.slides[0].notesPage).toMatchObject({
      status: "rendered",
      renderAssetFileId: expect.stringMatching(/^file_/)
    });
    expect(job.result).toMatchObject({
      deckId: "deck_ooxml_file_template",
      templateId: "template_file_template",
      sourceFileId: "file_template",
      currentPackageFileId: blueprint.currentPackageFileId
    });
    expect(JSON.stringify(job.result)).not.toContain("asset:notes_render_1");
    expect(insertedQualityReports[0]).toMatchObject({
      slideReports: [
        expect.objectContaining({
          selectedRenderMode: "editable",
          recommendedRenderMode: "editable",
          pixelEvaluation: "not-evaluated",
          unsupportedObjectCount: 0,
          fontSubstitutionCount: 0
        })
      ]
    });
  });

  it("stores identical generated bytes once and maps slide and notes refs to the same asset", async () => {
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
      if (sql.includes("INSERT INTO template_blueprints")) {
        insertedBlueprints.push(params[4]);
      }
      return [];
    });
    const generated = workerResponse();
    generated.assets[1]!.contentBase64 = generated.assets[0]!.contentBase64;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        if (String(input) === "http://storage.local/template.pptx") {
          return new Response("pptx-bytes");
        }
        if (String(input).endsWith("/ai/pptx-ooxml-generation")) {
          return new Response(JSON.stringify(generated));
        }
        return new Response("unexpected", { status: 500 });
      })
    );

    const job = await processPptxOoxmlGenerationJob(
      createTransactionalDataSource(query),
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(storage.putObject).toHaveBeenCalledTimes(3);
    expect(
      query.mock.calls.filter(([sql]) =>
        String(sql).includes("INSERT INTO project_assets")
      )
    ).toHaveLength(3);
    const blueprint = insertedBlueprints[0] as {
      slides: Array<{
        notesPage: { renderAssetFileId: string };
        renderAssetFileId: string;
      }>;
    };
    expect(blueprint.slides[0]!.notesPage.renderAssetFileId).toBe(
      blueprint.slides[0]!.renderAssetFileId
    );
  });

  it("keeps imported speaker notes when a notes preview asset cannot be saved", async () => {
    const insertedDecks: unknown[] = [];
    const insertedBlueprints: unknown[] = [];
    const insertedQualityReports: unknown[] = [];
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
      if (sql.includes("INSERT INTO decks")) insertedDecks.push(params[2]);
      if (sql.includes("INSERT INTO template_blueprints")) {
        insertedBlueprints.push(params[4]);
        insertedQualityReports.push(params[5]);
      }
      return [];
    });
    const storageWithNotesFailure: Pick<
      StoragePort,
      "getSignedReadUrl" | "putObject"
    > = {
      getSignedReadUrl: vi.fn(
        async () => "http://storage.local/template.pptx"
      ),
      putObject: vi.fn(async (input: { key: string; contentType: string }) => {
        if (input.key.includes("notes-01.png")) {
          throw new Error("synthetic notes asset failure");
        }
        return {
          key: input.key,
          url: "http://storage.local/design-asset",
          contentType: input.contentType,
          purpose: "design-asset" as const,
          size: 3
        };
      })
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "http://storage.local/template.pptx") {
          return new Response("pptx-bytes");
        }
        if (url.endsWith("/ai/pptx-ooxml-generation")) {
          const form = init?.body as FormData;
          expect(form.get("import_preference")).toBe("appearance-first");
          return new Response(
            JSON.stringify(
              workerResponse("synthetic-note-line-1\n\nsynthetic-note-line-2")
            )
          );
        }
        return new Response("unexpected", { status: 500 });
      })
    );

    const job = await processPptxOoxmlGenerationJob(
      createTransactionalDataSource(query),
      storageWithNotesFailure,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          fileId: "file_template",
          importPreference: "appearance-first"
        }
      }
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect((insertedDecks[0] as {
      slides: Array<{
        speakerNotes: string;
        importRenderMode?: string;
        elements: Array<Record<string, unknown>>;
      }>;
    }).slides[0])
      .toMatchObject({
        speakerNotes: "synthetic-note-line-1\n\nsynthetic-note-line-2",
        importRenderMode: "snapshot"
      });
    expect(
      (insertedDecks[0] as { slides: Array<{ elements: unknown[] }> }).slides[0]
        .elements
    ).not.toHaveLength(0);
    expect(
      (insertedBlueprints[0] as {
        slides: Array<{
          notesPage: { status: string; renderAssetFileId?: string };
        }>;
      }).slides[0].notesPage
    ).toEqual(
      expect.objectContaining({ status: "render-unavailable" })
    );
    expect(
      (insertedBlueprints[0] as {
        slides: Array<{ notesPage: { renderAssetFileId?: string } }>;
      }).slides[0].notesPage.renderAssetFileId
    ).toBeUndefined();
    expect(insertedQualityReports[0]).toMatchObject({
      slideReports: [
        expect.objectContaining({
          selectedRenderMode: "snapshot",
          recommendedRenderMode: "snapshot",
          pixelEvaluation: "not-evaluated"
        })
      ],
      notesDiagnostics: {
        rendered: 0,
        warnings: [
          { code: "PPTX_NOTES_PREVIEW_ASSET_FAILED", count: 1 }
        ]
      }
    });
    expect(JSON.stringify(job.result)).not.toContain("synthetic-note-line-1");
  });

  it("maps eight imported notes bodies and preview assets by slide", async () => {
    const insertedDecks: unknown[] = [];
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
      if (sql.includes("INSERT INTO decks")) insertedDecks.push(params[2]);
      if (sql.includes("INSERT INTO template_blueprints")) {
        insertedBlueprints.push(params[4]);
      }
      return [];
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "http://storage.local/template.pptx") {
          return new Response("pptx-bytes");
        }
        if (url.endsWith("/ai/pptx-ooxml-generation")) {
          return new Response(JSON.stringify(workerResponseWithEightNotes()));
        }
        return new Response("unexpected", { status: 500 });
      })
    );

    const job = await processPptxOoxmlGenerationJob(
      createTransactionalDataSource(query),
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    const deck = insertedDecks[0] as {
      slides: Array<{ speakerNotes: string }>;
    };
    const blueprint = insertedBlueprints[0] as {
      slides: Array<{
        sourceSlideIndex: number;
        notesPage: { status: string; renderAssetFileId: string };
      }>;
    };
    expect(deck.slides).toHaveLength(8);
    expect(deck.slides.map((slide) => slide.speakerNotes)).toEqual(
      Array.from({ length: 8 }, (_value, index) => `speaker-note-${index + 1}`)
    );
    expect(blueprint.slides).toHaveLength(8);
    expect(
      blueprint.slides.every(
        (slide, index) =>
          slide.sourceSlideIndex === index + 1 &&
          slide.notesPage.status === "rendered" &&
          /^file_/.test(slide.notesPage.renderAssetFileId)
      )
    ).toBe(true);
    expect(JSON.stringify(job.result)).not.toContain("speaker-note-");
  });

  it("uses the rendered slide background when fallback image assets are unresolved", async () => {
    const insertedDecks: unknown[] = [];
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
      if (sql.includes("INSERT INTO decks")) {
        insertedDecks.push(params[2]);
      }
      if (sql.includes("INSERT INTO template_blueprints")) {
        insertedBlueprints.push(params[4]);
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "http://storage.local/template.pptx") {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        return new Response(JSON.stringify(workerResponseWithUnresolvedFallback()));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlGenerationJob(
      createTransactionalDataSource(query),
      storage,
      "http://localhost:8000",
      payload
    );

    const deck = insertedDecks[0] as {
      slides: Array<{
        importRenderMode?: string;
        elements: Array<Record<string, unknown>>;
        animations: Array<Record<string, unknown>>;
        ooxmlMotionCapabilities: {
          importedMainSequenceCoverage: string;
        };
        style: { backgroundImage?: { src?: string; fit?: string; opacity?: number } };
      }>;
    };
    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(deck.slides[0].style.backgroundImage).toMatchObject({
      src: expect.stringMatching(
        /\/api\/v1\/projects\/project-a\/assets\/file_.*\/content/
      ),
      fit: "stretch",
      opacity: 1
    });
    expect(deck.slides[0].importRenderMode).toBe("snapshot");
    expect(deck.slides[0].elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: "el_ooxml_1_slide_99_fallback_image"
        })
      ])
    );
    expect(deck.slides[0].animations).toEqual([]);
    expect(
      deck.slides[0].ooxmlMotionCapabilities.importedMainSequenceCoverage
    ).toBe("partial");
    expect(insertedBlueprints[0]).toMatchObject({
      slides: [
        expect.objectContaining({
          ooxmlMotionCapabilities: expect.objectContaining({
            importedMainSequenceCoverage: "partial"
          })
        })
      ]
    });
    expect(job.result).toMatchObject({
      warnings: [
        expect.stringContaining(
          "OOXML visual tree importer failed; python-pptx fallback used:"
        )
      ]
    });
  });

  it("keeps resolved object fallback images as editable image elements", async () => {
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
      if (sql.includes("INSERT INTO decks")) {
        insertedDecks.push(params[2]);
      }
      return [];
    });
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "http://storage.local/template.pptx") {
        return new Response("pptx-bytes");
      }
      if (url.endsWith("/ai/pptx-ooxml-generation")) {
        return new Response(JSON.stringify(workerResponseWithResolvedFallback()));
      }

      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlGenerationJob(
      createTransactionalDataSource(query),
      storage,
      "http://localhost:8000",
      payload
    );

    const deck = insertedDecks[0] as {
      slides: Array<{
        importRenderMode?: string;
        elements: Array<{ elementId: string; props?: { src?: string } }>;
        style: { backgroundImage?: { src?: string } };
      }>;
    };
    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(deck.slides[0].importRenderMode).toBe("hybrid");
    expect(deck.slides[0].style.backgroundImage).toBeUndefined();
    expect(deck.slides[0].elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: "el_ooxml_1_slide_99_fallback_image",
          type: "image",
          props: expect.objectContaining({
            src: expect.stringMatching(
              /\/api\/v1\/projects\/project-a\/assets\/file_.*\/content/
            )
          })
        })
      ])
    );
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

    const job = await processPptxOoxmlGenerationJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PPTX_OOXML_GENERATION_SOURCE_FAILED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["topic", "prompt", "extraField"])(
    "rejects unsupported queue request field %s before source loading",
    async (field) => {
      const query = vi.fn(async (_sql: string, params: unknown[]) => [
        jobRow(
          params[1] as "running" | "succeeded" | "failed",
          params[2] as number,
          params[4] as Record<string, unknown> | null,
          params[5] as { code: string; message: string } | null
        )
      ]);
      vi.stubGlobal("fetch", vi.fn());

      const job = await processPptxOoxmlGenerationJob(
        { query } as unknown as DataSource,
        storage,
        "http://localhost:8000",
        {
          ...payload,
          request: { fileId: "file_template", [field]: "legacy value" }
        }
      );

      expect(job.status).toBe("failed");
      expect(job.error?.code).toBe("PPTX_OOXML_GENERATION_PAYLOAD_INVALID");
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("rejects an unknown import preference before source loading", async () => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => [
      jobRow(
        params[1] as "running" | "succeeded" | "failed",
        params[2] as number,
        params[4] as Record<string, unknown> | null,
        params[5] as { code: string; message: string } | null
      )
    ]);
    vi.stubGlobal("fetch", vi.fn());

    const job = await processPptxOoxmlGenerationJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          fileId: "file_template",
          importPreference: "balanced"
        }
      }
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PPTX_OOXML_GENERATION_PAYLOAD_INVALID");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("selectSlideImportRenderMode", () => {
  const visualElements = [
    {
      elementId: "el_safe_vector",
      type: "rect" as const,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        fill: "#ffffff",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0
      }
    }
  ];

  it.each([
    ["appearance-first", "not_evaluated", "not-evaluated", "snapshot"],
    ["appearance-first", "vectorization_failed", "failed", "snapshot"],
    ["appearance-first", "passed", "passed", "editable"],
    ["editability-first", "not_evaluated", "not-evaluated", "editable"]
  ] as const)(
    "selects %s / %s as %s diagnostics and %s rendering",
    (importPreference, status, pixelEvaluation, selectedRenderMode) => {
      expect(
        selectSlideImportRenderMode({
          importPreference,
          qualityReportSlide: {
            slideIndex: 1,
            status,
            ssim: status === "passed" ? 0.99 : null,
            reasons: [],
            fallback: "none"
          },
          slideIndex: 1,
          sourceElementSources: [],
          visualElements
        })
      ).toMatchObject({ pixelEvaluation, selectedRenderMode });
    }
  );

  it("fails closed when a relationship-backed source is missing from the visual tree", () => {
    expect(
      selectSlideImportRenderMode({
        importPreference: "editability-first",
        slideIndex: 1,
        sourceElementSources: [
          {
            elementId: "el_missing_media",
            relationshipId: "rId5"
          }
        ],
        visualElements
      })
    ).toMatchObject({
      selectedRenderMode: "snapshot",
      reasons: ["PPTX_RENDER_MODE_SNAPSHOT_RELATIONSHIP_ELEMENT_MISSING"]
    });
  });
});

function workerResponse(speakerNotes = "asset:notes_render_1") {
  return {
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    templateBlueprint: {
      templateId: "template_file_template",
      sourceFileId: "file_template",
      sourcePackageFileId: "file_template",
      currentPackageFileId: "asset:current_package",
      slides: [
        {
          slideIndex: 1,
          sourceSlideIndex: 1,
          sourceSlidePart: "ppt/slides/slide1.xml",
          ooxmlOrigin: "imported",
          ooxmlMotionCapabilities: {
            transitionWritable: true,
            importedMainSequenceCoverage: "complete"
          },
          notesPage: {
            status: "rendered",
            sourceNotesPart: "ppt/notesSlides/notesSlide1.xml",
            sourceNotesMasterPart: "ppt/notesMasters/notesMaster1.xml",
            bodyShapeId: "3",
            bodyWritable: true,
            notesWidthEmu: 6858000,
            notesHeightEmu: 9144000,
            renderAssetFileId: "asset:notes_render_1",
            hasNonBodyContent: true
          },
          renderAssetFileId: "asset:slide_render_1",
          slots: [
            {
              elementId: "el_slot_title",
              usage: "content-slot",
              slotRole: "title",
              replaceMode: "replace",
              confidence: 0.95,
              bounds: { x: 100, y: 80, width: 800, height: 120 },
              source: {
                type: "placeholder",
                placeholderType: "title",
                slidePart: "ppt/slides/slide1.xml",
                shapeId: "2"
              }
            },
            {
              elementId: "el_slot_media",
              usage: "media-slot",
              slotRole: "image",
              replaceMode: "replace",
              confidence: 0.7,
              bounds: { x: 900, y: 200, width: 420, height: 240 },
              source: {
                type: "image",
                slidePart: "ppt/slides/slide1.xml",
                shapeId: "5",
                relationshipId: "rId2"
              }
            }
          ]
        }
      ]
    },
    blueprint: {
      theme: {
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
      },
      slides: [
        {
          sourceSlideIndex: 1,
          speakerNotes,
          transition: { type: "fade", durationMs: 700 },
          animations: [
            {
              animationId: "anim_imported_title",
              elementId: "el_slot_title",
              type: "fade-in",
              order: 1,
              durationMs: 500,
              delayMs: 0,
              easing: "ease-out",
              startMode: "on-click"
            }
          ],
          style: {
            layout: "title-content",
            backgroundColor: "#ffffff",
            textColor: "#111827",
            accentColor: "#2563eb",
            fontFamily: "Inter"
          },
          elements: [
            {
              elementId: "el_imported_1_background",
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
              props: {
                fill: "#ffffff",
                stroke: "transparent",
                strokeWidth: 0,
                borderRadius: 0
              }
            },
            {
              elementId: "el_slot_title",
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
              props: {
                text: "Editable PPTX Title",
                fontFamily: "Inter",
                fontSize: 44,
                fontWeight: "bold",
                color: "#111827",
                align: "left",
                verticalAlign: "top",
                lineHeight: 1.2
              }
            },
            {
              elementId: "el_slot_media",
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
                alt: "Imported image",
                fit: "contain",
                focusX: 0.5,
                focusY: 0.5
              }
            }
          ]
        }
      ]
    },
    qualityReport: qualityReport(),
    assets: [
      {
        assetId: "slide_render_1",
        fileName: "slide-01.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("png").toString("base64")
      },
      {
        assetId: "notes_render_1",
        fileName: "notes-01.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("notes").toString("base64")
      },
      {
        assetId: "current_package",
        fileName: "template.pptx",
        mimeType: pptxMimeType,
        contentBase64: Buffer.from("pptx").toString("base64")
      },
      {
        assetId: "image_1",
        fileName: "image-01.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("image").toString("base64")
      }
    ],
    warnings: ["media slot preserved"]
  };
}

function workerResponseWithUnresolvedFallback() {
  const response = workerResponse();
  response.warnings = [
    "OOXML visual tree importer failed; python-pptx fallback used: synthetic importer failure"
  ];
  response.blueprint.slides[0].elements = [
    {
      elementId: "el_ooxml_1_slide_99_fallback_image",
      type: "image",
      role: "decoration",
      x: 120,
      y: 90,
      width: 480,
      height: 260,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      props: {
        src: "asset:shape_render_1_slide_99",
        alt: "Unsupported preset",
        fit: "stretch",
        focusX: 0.5,
        focusY: 0.5
      }
    }
  ];
  (response.templateBlueprint.slides[0] as typeof response.templateBlueprint.slides[0] & {
    elementSources: Array<Record<string, unknown>>;
  }).elementSources = [
    {
      elementId: "el_ooxml_1_slide_99_fallback_image",
      slidePart: "ppt/slides/slide1.xml",
      shapeId: "99",
      sourceType: "shape",
      writable: false,
      fallbackReason: "unsupported-preset"
    }
  ];
  response.assets = response.assets.filter((asset) => asset.assetId !== "image_1");
  return response;
}

function workerResponseWithResolvedFallback() {
  const response = workerResponseWithUnresolvedFallback();
  response.assets.push({
    assetId: "shape_render_1_slide_99",
    fileName: "shape-render.png",
    mimeType: "image/png",
    contentBase64: Buffer.from("shape").toString("base64")
  });
  return response;
}

function workerResponseWithEightNotes() {
  const response = workerResponse();
  const templateSlide = response.templateBlueprint.slides[0];
  const blueprintSlide = response.blueprint.slides[0];
  const currentPackage = response.assets.find(
    (asset) => asset.assetId === "current_package"
  );
  if (!templateSlide || !blueprintSlide || !currentPackage) {
    throw new Error("worker response fixture is incomplete");
  }

  response.templateBlueprint.slides = Array.from(
    { length: 8 },
    (_value, index) => {
      const slideNumber = index + 1;
      return {
        ...structuredClone(templateSlide),
        slideIndex: slideNumber,
        sourceSlideIndex: slideNumber,
        sourceSlidePart: `ppt/slides/slide${slideNumber}.xml`,
        renderAssetFileId: `asset:slide_render_${slideNumber}`,
        notesPage: {
          ...structuredClone(templateSlide.notesPage),
          sourceNotesPart: `ppt/notesSlides/notesSlide${slideNumber}.xml`,
          renderAssetFileId: `asset:notes_render_${slideNumber}`
        },
        slots: []
      };
    }
  );
  response.blueprint.slides = Array.from(
    { length: 8 },
    (_value, index) => ({
      ...structuredClone(blueprintSlide),
      sourceSlideIndex: index + 1,
      speakerNotes: `speaker-note-${index + 1}`,
      animations: [],
      elements: []
    })
  );
  response.qualityReport.notesDiagnostics = {
    total: 8,
    imported: 8,
    rendered: 8,
    writable: 8,
    warnings: []
  };
  response.assets = [
    currentPackage,
    ...Array.from({ length: 8 }, (_value, index) => ({
      assetId: `slide_render_${index + 1}`,
      fileName: `slide-${index + 1}.png`,
      mimeType: "image/png",
      contentBase64: Buffer.from(`slide-${index + 1}`).toString("base64")
    })),
    ...Array.from({ length: 8 }, (_value, index) => ({
      assetId: `notes_render_${index + 1}`,
      fileName: `notes-${index + 1}.png`,
      mimeType: "image/png",
      contentBase64: Buffer.from(`notes-${index + 1}`).toString("base64")
    }))
  ];
  return response;
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    job_id: "job-ooxml",
    project_id: "project-a",
    type: "pptx-ooxml-generation",
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
    notesDiagnostics: {
      total: 1,
      imported: 1,
      rendered: 1,
      writable: 1,
      warnings: []
    },
    slideReports: [
      {
        slideIndex: 1,
        status: "not_evaluated",
        ssim: null,
        reasons: [],
        fallback: "none"
      }
    ],
    notes: ["OOXML package rendered to slide PNG"]
  };
}
