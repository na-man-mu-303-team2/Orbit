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

const storage: Pick<
  StoragePort,
  "getSignedReadUrl" | "putObject" | "removeObject"
> = {
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
  removeObject: vi.fn(async () => undefined),
};

describe("processPptxOoxmlSyncJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
        return new Response(
          JSON.stringify(
            workerResponse([
              {
                operationType: "update_element_props",
                slideId: "slide_1",
                elementId: "el_title",
              },
              {
                operationType: "update_element_props",
                slideId: "slide_1",
                elementId: "el_image",
              },
            ]),
          ),
        );
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

  it("fails closed before saving assets when Python reports an unsupported edit", async () => {
    const { dataSource, query } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_image",
          props: { crop: { left: 0.1, top: 0, right: 0, bottom: 0 } },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(
              JSON.stringify({
                ...workerResponse([]),
                unsupportedOperations: [
                  {
                    operationType: "update_element_props",
                    slideId: "slide_1",
                    elementId: "el_image",
                    reasonCode: "PROPS_FIELDS_UNSUPPORTED",
                  },
                ],
              }),
            ),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({
      code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
      retryable: false,
    });
    expect(job.error?.message).toBe(
      "update_element_props:PROPS_FIELDS_UNSUPPORTED:slide_1:el_image",
    );
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE template_blueprints"),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("DELETE FROM deck_patches"),
      ),
    ).toBe(false);
  });

  it("parses unsafe motion reference coverage as a non-retryable unsupported edit", async () => {
    const { dataSource } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Changed title" },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(
              JSON.stringify({
                ...workerResponse([]),
                unsupportedOperations: [
                  {
                    operationType: "update_element_props",
                    slideId: "slide_1",
                    elementId: "el_title",
                    reasonCode: "MOTION_REFERENCE_COVERAGE_UNSAFE",
                  },
                ],
              }),
            ),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error).toEqual({
      code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
      message:
        "update_element_props:MOTION_REFERENCE_COVERAGE_UNSAFE:slide_1:el_title",
      retryable: false,
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("fails closed when Python acknowledges a different operation target", async () => {
    const { dataSource, query } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Changed" },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(
              JSON.stringify(
                workerResponse([
                  {
                    operationType: "update_element_props",
                    slideId: "slide_1",
                    elementId: "el_other",
                  },
                ]),
              ),
            ),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({
      code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
      retryable: false,
    });
    expect(job.error?.message).toBe(
      "update_element_props:SYNC_RESPONSE_INCOMPLETE:slide_1:el_title",
    );
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE template_blueprints"),
      ),
    ).toBe(false);
  });

  it("fails closed when Python applies an operation although no OOXML operation was sent", async () => {
    const { dataSource } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [{ type: "update_deck", title: "Package-neutral title" }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(
              JSON.stringify(
                workerResponse([
                  {
                    operationType: "update_element_props",
                    slideId: "slide_1",
                    elementId: "el_title",
                  },
                ]),
              ),
            ),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({
      code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
      retryable: false,
    });
    expect(job.error?.message).toBe(
      "update_element_props:SYNC_RESPONSE_INCOMPLETE:slide_1:el_title",
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "duplicate",
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Changed title" },
        },
      ],
      appliedOperations: [
        {
          operationType: "update_element_props" as const,
          slideId: "slide_1",
          elementId: "el_title",
        },
        {
          operationType: "update_element_props" as const,
          slideId: "slide_1",
          elementId: "el_title",
        },
      ],
    },
    {
      name: "reordered",
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Changed title" },
        },
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_image",
          props: { src: "data:image/png;base64,AQID" },
        },
      ],
      appliedOperations: [
        {
          operationType: "update_element_props" as const,
          slideId: "slide_1",
          elementId: "el_image",
        },
        {
          operationType: "update_element_props" as const,
          slideId: "slide_1",
          elementId: "el_title",
        },
      ],
    },
  ])(
    "fails closed for $name applied operation acknowledgements",
    async ({ appliedOperations, operations }) => {
      const { dataSource } = createDataSource({
        deckVersion: 2,
        syncedVersion: 1,
        operations,
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL) =>
          String(input).endsWith("current.pptx")
            ? new Response("pptx-bytes")
            : new Response(JSON.stringify(workerResponse(appliedOperations))),
        ),
      );

      const job = await processPptxOoxmlSyncJob(
        dataSource,
        storage,
        "http://localhost:8000",
        payload,
      );

      expect(job.status).toBe("failed");
      expect(job.error).toMatchObject({
        code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
        retryable: false,
      });
      expect(storage.putObject).not.toHaveBeenCalled();
    },
  );

  it("rejects unsupported visual patch types before calling Python", async () => {
    const { dataSource, query } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [
        {
          type: "add_animation",
          slideId: "slide_1",
          animation: {
            animationId: "anim_1",
            elementId: "el_title",
            type: "fade-in",
            order: 1,
            durationMs: 300,
            delayMs: 0,
            easing: "ease-in-out",
          },
        },
      ],
    });
    const fetchMock = vi.fn(async () => new Response("pptx-bytes"));
    vi.stubGlobal("fetch", fetchMock);

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({
      code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
      retryable: false,
    });
    expect(job.error?.message).toBe(
      "add_animation:OPERATION_TYPE_UNSUPPORTED:slide_1",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO project_assets"),
      ),
    ).toBe(false);
  });

  it.each([500, 501])(
    "syncs %i visual operations in deterministic batches and saves only the final package",
    async (operationCount) => {
      let savedBlueprint: Record<string, unknown> | null = null;
      const { dataSource } = createDataSource({
        deckVersion: 2,
        syncedVersion: 1,
        operations: frameOperations(operationCount),
        onBlueprintUpdate: (blueprint) => {
          savedBlueprint = blueprint;
          return true;
        },
      });
      const pythonBatchSizes: number[] = [];
      const renderFlags: string[] = [];
      let pythonCallCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          if (String(input).endsWith("current.pptx")) {
            return new Response("pptx-bytes");
          }

          pythonCallCount += 1;
          const form = init?.body as FormData;
          const batch = JSON.parse(String(form.get("operations"))) as Array<{
            type: "update_element_frame";
            slideId: string;
            elementId: string;
          }>;
          const packageText = Buffer.from(
            await (form.get("file") as Blob).arrayBuffer(),
          ).toString();
          const blueprint = JSON.parse(
            String(form.get("template_blueprint")),
          ) as ReturnType<typeof templateBlueprint>;
          pythonBatchSizes.push(batch.length);
          renderFlags.push(String(form.get("render")));
          expect(packageText).toBe(
            pythonCallCount === 1
              ? "pptx-bytes"
              : `package-${pythonCallCount - 1}`,
          );
          if (pythonCallCount > 1) {
            expect(blueprint.slides[0]!.elementSources).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ elementId: "el_batch_source" }),
              ]),
            );
          }

          return new Response(
            JSON.stringify({
              ...workerResponse(
                batch.map((operation) => ({
                  operationType: operation.type,
                  slideId: operation.slideId,
                  elementId: operation.elementId,
                })),
              ),
              assets: [
                {
                  assetId: "current_package",
                  fileName: "current.pptx",
                  mimeType: pptxMimeType,
                  contentBase64: Buffer.from(
                    `package-${pythonCallCount}`,
                  ).toString("base64"),
                },
              ],
              elementSources:
                pythonCallCount === 1 ? [batchElementSource()] : [],
              warnings: [`batch-${pythonCallCount}`],
            }),
          );
        }),
      );

      const job = await processPptxOoxmlSyncJob(
        dataSource,
        storage,
        "http://localhost:8000",
        payload,
      );

      const expectedBatchSizes = operationCount === 500 ? [500] : [500, 1];
      expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
      expect(pythonBatchSizes).toEqual(expectedBatchSizes);
      expect(renderFlags).toEqual(
        operationCount === 500 ? ["true"] : ["false", "true"],
      );
      expect(job.result).toMatchObject({
        warnings: operationCount === 500 ? ["batch-1"] : ["batch-1", "batch-2"],
      });
      expect(storage.putObject).toHaveBeenCalledOnce();
      expect(
        Buffer.from(vi.mocked(storage.putObject).mock.calls[0]![0].body),
      ).toEqual(
        Buffer.from(operationCount === 500 ? "package-1" : "package-2"),
      );
      expect(savedBlueprint).toMatchObject({
        slides: [
          expect.objectContaining({
            elementSources: expect.arrayContaining([
              expect.objectContaining({ elementId: "el_batch_source" }),
            ]),
          }),
        ],
      });
    },
  );

  it("keeps consecutive shared-shape frame rounds whole at the batch boundary", async () => {
    const sharedShapeBlueprint = templateBlueprint(1);
    sharedShapeBlueprint.slides[0]!.elementSources.push(
      sharedShapeElementSource("el_shared_left"),
      sharedShapeElementSource("el_shared_right"),
    );
    const sharedFrames = [
      { x: 200, y: 160, width: 500, height: 180 },
      { x: 300, y: 200, width: 500, height: 180 },
    ];
    const operations = [
      ...frameOperations(499),
      ...sharedFrames.flatMap((frame) =>
        ["el_shared_left", "el_shared_right"].map((elementId) => ({
          type: "update_element_frame" as const,
          slideId: "slide_1",
          elementId,
          frame,
        })),
      ),
    ];
    const { dataSource } = createDataSource({
      blueprint: sharedShapeBlueprint,
      deckVersion: 2,
      syncedVersion: 1,
      operations,
    });
    const pythonBatches: Array<
      Array<{
        type: "update_element_frame";
        slideId: string;
        elementId: string;
      }>
    > = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith("current.pptx")) {
          return new Response("pptx-bytes");
        }

        const form = init?.body as FormData;
        const batch = JSON.parse(String(form.get("operations"))) as Array<{
          type: "update_element_frame";
          slideId: string;
          elementId: string;
        }>;
        pythonBatches.push(batch);
        return new Response(
          JSON.stringify(
            workerResponse(
              batch.map((operation) => ({
                operationType: operation.type,
                slideId: operation.slideId,
                elementId: operation.elementId,
              })),
            ),
          ),
        );
      }),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(pythonBatches.map((batch) => batch.length)).toEqual([499, 4]);
    expect(pythonBatches[1]?.map((operation) => operation.elementId)).toEqual([
      "el_shared_left",
      "el_shared_right",
      "el_shared_left",
      "el_shared_right",
    ]);
  });

  it("keeps a shared-shape delete round whole at the batch boundary", async () => {
    const sharedShapeBlueprint = templateBlueprint(1);
    sharedShapeBlueprint.slides[0]!.elementSources.push(
      sharedShapeElementSource("el_shared_left"),
      sharedShapeElementSource("el_shared_right"),
    );
    const operations = [
      ...frameOperations(499),
      ...["el_shared_left", "el_shared_right"].map((elementId) => ({
        type: "delete_element" as const,
        slideId: "slide_1",
        elementId,
      })),
    ];
    const { dataSource } = createDataSource({
      blueprint: sharedShapeBlueprint,
      deckVersion: 2,
      syncedVersion: 1,
      operations,
    });
    const pythonBatchSizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith("current.pptx")) {
          return new Response("pptx-bytes");
        }

        const form = init?.body as FormData;
        const batch = JSON.parse(String(form.get("operations"))) as Array<{
          type: "delete_element" | "update_element_frame";
          slideId: string;
          elementId: string;
        }>;
        pythonBatchSizes.push(batch.length);
        return new Response(
          JSON.stringify(
            workerResponse(
              batch.map((operation) => ({
                operationType: operation.type,
                slideId: operation.slideId,
                elementId: operation.elementId,
              })),
            ),
          ),
        );
      }),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(pythonBatchSizes).toEqual([499, 2]);
  });

  it("removes an applied delete locator before a later add reuses its numeric shape ID", async () => {
    const replacementElementId = "el_replacement";
    const operations = [
      ...frameOperations(499),
      {
        type: "delete_element" as const,
        slideId: "slide_1",
        elementId: "el_title",
      },
      {
        type: "add_element" as const,
        slideId: "slide_1",
        element: authoredRectangleElement(replacementElementId),
      },
    ];
    const savedBlueprints: Array<ReturnType<typeof templateBlueprint>> = [];
    const { dataSource } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations,
      onBlueprintUpdate: (blueprint) => {
        savedBlueprints.push(blueprint as ReturnType<typeof templateBlueprint>);
        return true;
      },
    });
    let pythonCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith("current.pptx")) {
          return new Response("pptx-bytes");
        }

        pythonCallCount += 1;
        const form = init?.body as FormData;
        const batch = JSON.parse(String(form.get("operations"))) as Array<{
          type: "add_element" | "delete_element" | "update_element_frame";
          slideId: string;
          elementId?: string;
          element?: { elementId: string };
        }>;
        if (pythonCallCount === 2) {
          const nextBlueprint = JSON.parse(
            String(form.get("template_blueprint")),
          ) as ReturnType<typeof templateBlueprint>;
          expect(
            nextBlueprint.slides[0]!.elementSources.some(
              (source) => source.elementId === "el_title",
            ),
          ).toBe(false);
        }

        return new Response(
          JSON.stringify({
            ...workerResponse(
              batch.map((operation) => ({
                operationType: operation.type,
                slideId: operation.slideId,
                elementId: operation.elementId ?? operation.element?.elementId,
              })),
            ),
            elementSources:
              pythonCallCount === 2
                ? [replacementElementSource(replacementElementId)]
                : [],
          }),
        );
      }),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status, JSON.stringify(job.error)).toBe("succeeded");
    expect(pythonCallCount).toBe(2);
    expect(
      savedBlueprints[0]?.slides[0]!.elementSources.map((source) => ({
        elementId: source.elementId,
        shapeId: source.shapeId,
      })),
    ).toEqual(
      expect.arrayContaining([
        { elementId: replacementElementId, shapeId: "2" },
      ]),
    );
    expect(
      savedBlueprints[0]?.slides[0]!.elementSources.some(
        (source) => source.elementId === "el_title",
      ),
    ).toBe(false);
    expect(
      savedBlueprints[0]?.slides[0]!.elementSources.filter(
        (source) => source.shapeId === "2",
      ),
    ).toHaveLength(1);
  });

  it("fails atomically when the second batch reports an unsupported operation", async () => {
    const { dataSource, query } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: frameOperations(501),
    });
    let pythonCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith("current.pptx")) {
          return new Response("pptx-bytes");
        }

        pythonCallCount += 1;
        const form = init?.body as FormData;
        const batch = JSON.parse(String(form.get("operations"))) as Array<{
          type: "update_element_frame";
          slideId: string;
          elementId: string;
        }>;
        if (pythonCallCount === 1) {
          return new Response(
            JSON.stringify({
              ...workerResponse(
                batch.map((operation) => ({
                  operationType: operation.type,
                  slideId: operation.slideId,
                  elementId: operation.elementId,
                })),
              ),
              assets: [
                {
                  assetId: "current_package",
                  fileName: "current.pptx",
                  mimeType: pptxMimeType,
                  contentBase64: Buffer.from("package-1").toString("base64"),
                },
              ],
              elementSources: [batchElementSource()],
              warnings: ["batch-1"],
            }),
          );
        }

        expect(
          Buffer.from(
            await (form.get("file") as Blob).arrayBuffer(),
          ).toString(),
        ).toBe("package-1");
        expect(
          JSON.parse(String(form.get("template_blueprint"))).slides[0]
            .elementSources,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ elementId: "el_batch_source" }),
          ]),
        );
        return new Response(
          JSON.stringify({
            ...workerResponse([]),
            unsupportedOperations: [
              {
                operationType: "update_element_frame",
                slideId: "slide_1",
                elementId: "el_500",
                reasonCode: "FRAME_FIELDS_UNSUPPORTED",
              },
            ],
          }),
        );
      }),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(pythonCallCount).toBe(2);
    expect(job.error).toMatchObject({
      code: "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
      message: "update_element_frame:FRAME_FIELDS_UNSUPPORTED:slide_1:el_500",
      retryable: false,
    });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE template_blueprints"),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("DELETE FROM deck_patches"),
      ),
    ).toBe(false);
  });

  it("stores only safe status and IDs when Python returns sensitive error text", async () => {
    const sensitiveText =
      "https://storage.local/current.pptx?signature=secret private slide text";
    const { dataSource } = createDataSource({
      deckVersion: 2,
      syncedVersion: 1,
      operations: [
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_title",
          props: { text: "Changed" },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(sensitiveText, { status: 503 }),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.error).toEqual({
      code: "PPTX_OOXML_SYNC_FAILED",
      message:
        "PPTX_OOXML_SYNC_FAILED:status=503:projectId=project-a:deckId=deck_a",
    });
    expect(JSON.stringify(job)).not.toContain(sensitiveText);
    expect(storage.putObject).not.toHaveBeenCalled();
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
          : new Response(
              JSON.stringify({
                ...workerResponse([
                  {
                    operationType: "update_element_props",
                    slideId: "slide_1",
                    elementId: "el_title",
                  },
                ]),
                assets: [
                  ...workerResponse([]).assets,
                  {
                    assetId: "slide_render_1",
                    fileName: "slide-1.png",
                    mimeType: "image/png",
                    contentBase64: Buffer.from("png").toString("base64"),
                  },
                ],
              }),
            ),
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
    const writtenObjectKeys = vi
      .mocked(storage.putObject)
      .mock.calls.map(([input]) => input.key);
    expect(writtenObjectKeys).toHaveLength(2);
    expect(storage.removeObject).toHaveBeenCalledTimes(2);
    for (const objectKey of writtenObjectKeys) {
      expect(storage.removeObject).toHaveBeenCalledWith(objectKey);
    }
  });

  it("preserves the original sync failure when storage cleanup also fails", async () => {
    const { dataSource } = createDataSource({
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
    vi.mocked(storage.removeObject).mockRejectedValueOnce(
      new Error("provider cleanup details"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("current.pptx")
          ? new Response("pptx-bytes")
          : new Response(
              JSON.stringify(
                workerResponse([
                  {
                    operationType: "update_element_props",
                    slideId: "slide_1",
                    elementId: "el_title",
                  },
                ]),
              ),
            ),
      ),
    );

    const job = await processPptxOoxmlSyncJob(
      dataSource,
      storage,
      "http://localhost:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({
      code: "PPTX_OOXML_SYNC_FAILED",
      message: "PPTX_OOXML_SYNC_FAILED:projectId=project-a:deckId=deck_a",
    });
    expect(warn).toHaveBeenCalledWith(
      {
        event: "pptx_ooxml.sync.storage_cleanup_failed",
        jobId: "job-sync",
        projectId: "project-a",
        deckId: "deck_a",
        failedObjectCount: 1,
      },
      "PPTX OOXML sync storage cleanup failed.",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "provider cleanup details",
    );
  });
});

function createDataSource(input: {
  blueprint?: ReturnType<typeof templateBlueprint>;
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
          params[5] as {
            code: string;
            message: string;
            retryable?: boolean;
          } | null,
        ),
      ];
    }
    if (sql.includes("pg_advisory_xact_lock")) return [{ locked: true }];
    if (sql.includes("FROM template_blueprints")) {
      return [
        {
          template_id: "template_a",
          blueprint_json:
            input.blueprint ?? templateBlueprint(input.syncedVersion),
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

function frameOperations(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: "update_element_frame",
    slideId: "slide_1",
    elementId: `el_${index}`,
    frame: { x: index, y: index, width: 100, height: 100 },
  }));
}

function batchElementSource() {
  return {
    elementId: "el_batch_source",
    elementType: "text",
    ooxmlOrigin: "authored",
    ooxmlEditCapabilities: {
      richText: "none",
      crop: "none",
      tableCellText: false,
    },
    slidePart: "ppt/slides/slide1.xml",
    shapeId: "502",
    sourceType: "slide",
    writable: true,
  };
}

function sharedShapeElementSource(elementId: string) {
  return {
    elementId,
    elementType: "text" as const,
    ooxmlOrigin: "imported" as const,
    ooxmlEditCapabilities: {
      richText: "none" as const,
      crop: "none" as const,
      tableCellText: false,
    },
    slidePart: "ppt/slides/slide1.xml",
    shapeId: "90",
    sourceType: "shape" as const,
    writable: true,
  };
}

function authoredRectangleElement(elementId: string) {
  return {
    elementId,
    type: "rect" as const,
    role: "content" as const,
    x: 120,
    y: 120,
    width: 320,
    height: 180,
    rotation: 0,
    opacity: 1,
    zIndex: 5,
    locked: false,
    visible: true,
    props: {
      fill: "#336699",
      stroke: "transparent",
      strokeWidth: 0,
      borderRadius: 0,
    },
  };
}

function replacementElementSource(elementId: string) {
  return {
    elementId,
    elementType: "rect" as const,
    ooxmlOrigin: "authored" as const,
    ooxmlEditCapabilities: {
      richText: "none" as const,
      crop: "none" as const,
      tableCellText: false,
    },
    slidePart: "ppt/slides/slide1.xml",
    shapeId: "2",
    sourceType: "slide" as const,
    writable: true,
  };
}

function workerResponse(
  appliedOperations: Array<{
    operationType:
      | "add_element"
      | "update_element_frame"
      | "update_element_props"
      | "delete_element";
    slideId?: string;
    elementId?: string;
  }>,
) {
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
    appliedOperations,
    unsupportedOperations: [],
    warnings: [],
  };
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string; retryable?: boolean } | null,
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
