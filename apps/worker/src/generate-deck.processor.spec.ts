import type { StoragePort } from "@orbit/storage";
import { deckSchema, type Deck, type GenerateDeckJobResult } from "@orbit/shared";
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
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
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
        JSON.stringify({
          deck,
          warnings,
          validation: deckValidation,
          diagnostics: diagnostics({ validationIssueCount: 2 })
        })
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
    expect(timeoutSpy).toHaveBeenCalledWith(120_000);
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
    expect(jobResult).toMatchObject({
      diagnostics: {
        referencePolicy: "references-first",
        validationIssueCount: 2
      }
    });
    expect(job.result?.warnings).toEqual(warnings);
    expect(job.result).toMatchObject({ validation: { passed: false } });
  });

  it("applies semantic repair once and persists remaining shared QA issues", async () => {
    const deck = deckSchema.parse(createDeck({
      metadata: {
        ...createDeck().metadata,
        presentationProfile: "proposal"
      }
    }));
    const firstSlide = deck.slides[0];
    if (!firstSlide.aiNotes) throw new Error("semantic fixture notes missing");
    firstSlide.aiNotes.emphasisPoints = [
      "고객 전환율을 높입니다",
      "구매 여정을 단축합니다"
    ];
    firstSlide.aiNotes.sourceLedger = [
      {
        claim: "서버 지연 시간은 20ms입니다",
        source: "report",
        sourceType: "uploaded",
        confidence: 0.9,
        usedInSlideId: firstSlide.slideId
      }
    ];
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            deck,
            warnings: [],
            validation: validation(),
            diagnostics: diagnostics()
          })
        )
      )
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    const result = (query.mock.calls[2][1] as unknown[])[4] as GenerateDeckJobResult;
    expect(result.warnings).toContain(
      "Semantic QA bounded repair applied once."
    );
    expect(result.deck.slides[0].aiNotes?.emphasisPoints).toEqual([
      "고객 전환율을 높입니다"
    ]);
    expect(result.validation).toMatchObject({
      passed: false,
      presentationIssues: [expect.objectContaining({ code: "EVIDENCE_MISMATCH" })]
    });
    expect(result.diagnostics).toMatchObject({ validationIssueCount: 1 });
  });

  it("persists the resolved Saved Design Pack snapshot on design-pack decks", async () => {
    const deck = createDeck();
    const snapshot = {
      id: "design_pack_1",
      name: "Personal report",
      version: 2,
      baseStylePackId: "brandlogy-modern",
      preferences: {
        palette: { primary: "#2563EB" },
        typography: {},
        tone: "professional",
        density: "medium",
        titleStyle: "action",
        layoutPreference: "varied",
        imageDensity: "low",
        mediaPolicy: "balanced",
        referencePolicy: "topic-only",
        qaStrictness: "standard"
      }
    } as const;
    const query = dynamicJobQuery();
    let pythonRequestBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        if (String(input).endsWith("/ai/review-deck-visuals")) {
          return visualPassResponse();
        }
        pythonRequestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            deck,
            warnings: [],
            validation: validation(),
            diagnostics: diagnostics()
          })
        );
      })
    );

    await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: {
          ...payload.request,
          generationMode: "design-pack",
          design: {
            ...payload.request.design,
            engineVersion: "program-v2"
          },
          savedDesignPack: { id: snapshot.id, version: snapshot.version }
        },
        designPackSnapshot: snapshot
      }
    );

    const saveCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO decks")
    );
    const savedDeck = saveCall?.[1]?.[2] as Deck;
    expect(savedDeck.metadata.designPackSnapshot).toMatchObject(snapshot);
    expect(
      savedDeck.metadata.designPackSnapshot?.preferences.typography
    ).toMatchObject({ titleSizeScale: 1, bodySizeScale: 1 });
    const designProgramContext = JSON.parse(pythonRequestBody).designProgramContext;
    expect(designProgramContext.savedDesignPreferences).toMatchObject(
      snapshot.preferences
    );
  });

  it("publishes a program-v2 deck only after rendered visual QA passes", async () => {
    const deck = programV2Deck();
    const query = dynamicJobQuery();
    const events: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/ai/generate-deck")) {
        return generateDeckResponse(deck);
      }
      if (url.endsWith("/ai/review-deck-visuals")) {
        return visualPassResponse();
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload(),
      undefined,
      (event) => events.push(event)
    );

    expect(job.status).toBe("succeeded");
    expect(job.result?.diagnostics).toMatchObject({
      visualQaStatus: "passed",
      visualReviewAttempts: 1,
      visualRepairAttempts: 0,
      visualIssueCodes: []
    });
    const deckInsertCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO decks")
    );
    expect(deckInsertCalls).toHaveLength(1);
    const savedDeck = deckInsertCalls[0]?.[1]?.[2] as Deck;
    expect(savedDeck.metadata.designProgramSnapshot?.backgroundSequence).toEqual(
      savedDeck.slides.map(
        (slide) => slide.aiNotes?.compositionPlan?.backgroundMode
      )
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "http://localhost:8000/ai/generate-deck",
      "http://localhost:8000/ai/review-deck-visuals"
    ]);
    expect(
      query.mock.calls
        .filter(([sql]) => String(sql).includes("UPDATE jobs"))
        .map(([, params]) => params[2])
    ).toEqual([15, 45, 65, 75, 95, 100]);
    expect(events).toEqual([
      "ai-ppt.design-program.created",
      "ai-ppt.composition.completed",
      "ai-ppt.asset.resolved",
      "ai-ppt.visual-review.completed",
      "ai-ppt.deck.published"
    ]);
  });

  it("embeds stored image assets only in the visual review request", async () => {
    const deck = programV2DeckWithResolvedMedia();
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
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
            file_id: "file_visual",
            storage_key: "projects/project-a/assets/file_visual.png",
            mime_type: "image/png"
          }
        ];
      }
      return [];
    });
    const reviewStorage = {
      ...storage,
      getSignedReadUrl: vi.fn(async () => "http://storage.local/visual.png")
    };
    let reviewImageSource = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url === "http://storage.local/visual.png") {
          return new Response(new Uint8Array([1, 2, 3]));
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          const body = JSON.parse(String(init?.body));
          reviewImageSource = body.deck.slides[0].elements.find(
            (element: { role?: string }) => element.role === "media"
          ).props.src;
          return visualPassResponse();
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      reviewStorage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(reviewImageSource).toBe("data:image/png;base64,AQID");
    const savedDeck = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO decks")
    )?.[1]?.[2] as Deck;
    const savedImage = savedDeck.slides[0].elements.find(
      (element) => element.role === "media"
    );
    expect(savedImage?.type === "image" ? savedImage.props.src : "").toBe(
      "/api/v1/projects/project-a/assets/file_visual/content"
    );
  });

  it("applies one bounded visual repair and reviews the rendered deck again", async () => {
    const deck = programV2Deck();
    const query = dynamicJobQuery();
    let reviewCount = 0;
    const repairBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          reviewCount += 1;
          return reviewCount === 1
            ? visualFailureResponse("FOCAL_POINT_WEAK")
            : visualPassResponse();
        }
        if (url.endsWith("/ai/repair-deck-visuals")) {
          repairBodies.push(JSON.parse(String(init?.body)));
          return visualRepairResponse(deck);
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(job.result?.diagnostics).toMatchObject({
      visualQaStatus: "passed",
      visualReviewAttempts: 2,
      visualRepairAttempts: 1,
      visualIssueCodes: []
    });
    expect(repairBodies).toHaveLength(1);
    expect(repairBodies[0]?.actions).toEqual([
      expect.objectContaining({
        action: "increaseFocalScale",
        slideId: "slide_1"
      })
    ]);
  });

  it("publishes after bounded repair when only one advisory slide remains", async () => {
    const deck = programV2Deck();
    const query = dynamicJobQuery();
    let repairCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          return visualFailureResponse("BALANCE_WEAK");
        }
        if (url.endsWith("/ai/repair-deck-visuals")) {
          repairCount += 1;
          return visualRepairResponse(deck);
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(repairCount).toBe(2);
    expect(job.result).toMatchObject({
      validation: {
        passed: true,
        designIssues: []
      },
      diagnostics: {
        visualQaStatus: "passed",
        visualReviewAttempts: 3,
        visualRepairAttempts: 2,
        visualIssueCodes: ["BALANCE_WEAK"]
      },
      warnings: [expect.stringContaining("advisory issue")]
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("retains a twice-repaired blocking visual failure without publishing", async () => {
    const deck = programV2Deck();
    const query = dynamicJobQuery();
    let repairCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          return visualFailureResponse("IMAGE_CONTENT_MISMATCH");
        }
        if (url.endsWith("/ai/repair-deck-visuals")) {
          repairCount += 1;
          return visualRepairResponse(deck);
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe(
      "GENERATE_DECK_VISUAL_QUALITY_GATE_FAILED"
    );
    expect(repairCount).toBe(2);
    expect(job.result).toMatchObject({
      validation: {
        passed: false,
        designIssues: [
          expect.objectContaining({ code: "IMAGE_CONTENT_MISMATCH" })
        ]
      },
      diagnostics: {
        visualQaStatus: "failed",
        visualReviewAttempts: 3,
        visualRepairAttempts: 2,
        visualIssueCodes: ["IMAGE_CONTENT_MISMATCH"]
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(false);
  });

  it("converts an unresolved optional image to a no-media composition", async () => {
    const deck = programV2DeckWithOptionalMedia();
    const noMediaDeck = deckSchema.parse({
      ...deck,
      metadata: {
        ...deck.metadata,
        designProgramSnapshot: {
          ...deck.metadata.designProgramSnapshot,
          compositionIds: ["minimal-cover"]
        }
      },
      slides: [
        {
          ...deck.slides[0],
          elements: [],
          aiNotes: {
            ...deck.slides[0].aiNotes,
            visualPlan: {
              ...deck.slides[0].aiNotes?.visualPlan,
              imageNeeded: false
            },
            compositionPlan: {
              compositionId: "minimal-cover",
              variant: "light",
              backgroundMode: "light",
              focalType: "title",
              assetRole: "none",
              requiredAsset: false
            }
          }
        }
      ]
    });
    const query = dynamicJobQuery();
    let fallbackBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url.endsWith("/ai/repair-deck-visuals")) {
          fallbackBody = JSON.parse(String(init?.body));
          return visualRepairResponse(noMediaDeck);
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          return visualPassResponse();
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(fallbackBody).toMatchObject({
      actions: [],
      dropOptionalMediaSlideIds: ["slide_1"]
    });
    expect(
      (job.result as GenerateDeckJobResult).deck.slides[0].elements.some(
        (element) => element.elementId.endsWith("_media_placeholder")
      )
    ).toBe(false);
  });

  it("publishes a hybrid program-v2 deck below the resolved media floor with a warning", async () => {
    const deck = programV2DeckWithResolvedMediaCount(2);
    const query = dynamicJobQuery();
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/ai/generate-deck")) {
        return generateDeckResponse(deck);
      }
      if (url.endsWith("/ai/review-deck-visuals")) {
        return visualPassResponse();
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      hybridProgramV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      validation: {
        passed: false,
        designIssues: [
          expect.objectContaining({ code: "MEDIA_BUDGET_UNDERSUPPLIED" })
        ]
      }
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/ai/review-deck-visuals")
      )
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("publishes a hybrid program-v2 deck with three resolved media assets", async () => {
    const deck = programV2DeckWithResolvedMediaCount(3);
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          return visualPassResponse();
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      hybridProgramV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("publishes hybrid media without the full source mix with a warning", async () => {
    const deck = programV2DeckWithResolvedMediaCount(3);
    for (const slide of deck.slides) {
      if (!slide.aiNotes?.visualPlan || !slide.aiNotes.compositionPlan) continue;
      slide.aiNotes.visualPlan.imageSourcePolicy = "official-assets";
      slide.aiNotes.compositionPlan.assetRole = "evidence";
    }
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) return generateDeckResponse(deck);
        if (url.endsWith("/ai/review-deck-visuals")) return visualPassResponse();
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      hybridProgramV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      validation: {
        designIssues: [
          expect.objectContaining({ code: "MEDIA_MIX_UNDERSUPPLIED" })
        ]
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("publishes repeated visual assets in a hybrid deck with a warning", async () => {
    const deck = programV2DeckWithResolvedMediaCount(4);
    const repeatedAssetUrl =
      deck.slides[0].aiNotes?.visualPlan?.asset?.sourceAssetUrl;
    const secondEvidence = deck.slides[2];
    const secondAsset = secondEvidence.aiNotes?.visualPlan?.asset;
    if (
      !repeatedAssetUrl ||
      !secondEvidence.aiNotes?.visualPlan ||
      !secondEvidence.aiNotes.compositionPlan ||
      !secondAsset
    ) {
      throw new Error("Hybrid fixture is missing visual plans");
    }
    secondEvidence.aiNotes.visualPlan.imageSourcePolicy = "official-assets";
    secondEvidence.aiNotes.visualPlan.asset = {
      ...secondAsset,
      provider: "official-web",
      sourceUrl: "https://official.example/product",
      sourceAssetUrl: repeatedAssetUrl,
      sourceAuthority: "official",
      usageBasis: "official-reference"
    };
    secondEvidence.aiNotes.compositionPlan.assetRole = "evidence";
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) return generateDeckResponse(deck);
        if (url.endsWith("/ai/review-deck-visuals")) return visualPassResponse();
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      hybridProgramV2Payload()
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      validation: {
        designIssues: [
          expect.objectContaining({ code: "MEDIA_ASSET_DUPLICATED" })
        ]
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("publishes repeated visual assets in a public-assets deck with a warning", async () => {
    const deck = programV2DeckWithResolvedMediaCount(2);
    const repeatedAssetUrl =
      deck.slides[0].aiNotes?.visualPlan?.asset?.sourceAssetUrl;
    if (!repeatedAssetUrl) throw new Error("Public asset fixture is incomplete");
    for (const [index, slide] of deck.slides.entries()) {
      if (!slide.aiNotes?.visualPlan) {
        throw new Error("Public asset fixture is missing a visual plan");
      }
      slide.aiNotes.visualPlan.imageSourcePolicy = "public-assets";
      slide.aiNotes.visualPlan.asset = {
        ...slide.aiNotes.visualPlan.asset,
        fileId: `file_public_${index + 1}`,
        provider: "openverse",
        sourceUrl: "https://example.com/library",
        sourceAssetUrl: repeatedAssetUrl,
        sourceAuthority: "independent",
        usageBasis: "licensed"
      };
    }
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) return generateDeckResponse(deck);
        if (url.endsWith("/ai/review-deck-visuals")) return visualPassResponse();
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
    const programPayload = programV2Payload();

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...programPayload,
        request: {
          ...programPayload.request,
          design: {
            ...programPayload.request.design,
            mediaPolicy: "public-assets"
          },
          visualPlanPolicy: { mediaPolicy: "public-assets" }
        }
      }
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      validation: {
        designIssues: [
          expect.objectContaining({ code: "MEDIA_ASSET_DUPLICATED" })
        ]
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("fails program-v2 explicitly when rendered visual QA is unavailable", async () => {
    const deck = programV2Deck();
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        String(input).endsWith("/ai/generate-deck")
          ? generateDeckResponse(deck)
          : new Response("vision provider unavailable", { status: 503 })
      )
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("GENERATE_DECK_VISUAL_QA_UNAVAILABLE");
    expect(job.result).toMatchObject({
      deck: { deckId: deck.deckId },
      diagnostics: {
        visualQaStatus: "failed",
        visualReviewAttempts: 1,
        visualRepairAttempts: 0
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(false);
  });

  it("retains the latest repaired candidate when a later visual review is unavailable", async () => {
    const deck = programV2Deck();
    const repairedDeck = deckSchema.parse({
      ...deck,
      title: "Latest repaired candidate"
    });
    const query = dynamicJobQuery();
    let reviewCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/ai/generate-deck")) {
          return generateDeckResponse(deck);
        }
        if (url.endsWith("/ai/review-deck-visuals")) {
          reviewCount += 1;
          return reviewCount === 1
            ? visualFailureResponse("FOCAL_POINT_WEAK")
            : new Response("vision provider unavailable", { status: 503 });
        }
        if (url.endsWith("/ai/repair-deck-visuals")) {
          return visualRepairResponse(repairedDeck);
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      programV2Payload()
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("GENERATE_DECK_VISUAL_QA_UNAVAILABLE");
    expect(job.result).toMatchObject({
      deck: { title: "Latest repaired candidate" },
      diagnostics: {
        visualReviewAttempts: 2,
        visualRepairAttempts: 1
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(false);
  });

  it("fails before saving a deck when blocking validation issues remain", async () => {
    const deck = createDeck();
    const deckValidation = validation({
      passed: false,
      contentIssues: [
        {
          code: "CONTENT_REQUIRED",
          scope: "slide",
          severity: "error",
          blocking: true,
          path: "slides.0.title",
          message: "Slide title is required."
        }
      ]
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => [
        jobRow(
          "failed",
          75,
          params[4] as Record<string, unknown>,
          params[5] as { code: string; message: string }
        )
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ deck, warnings: [], validation: deckValidation })
        )
      )
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("GENERATE_DECK_VALIDATION_BLOCKING");
    expect(query).toHaveBeenCalledTimes(2);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(false);
    expect(job.result).toMatchObject({
      validation: { passed: false },
      diagnostics: { referencePolicy: "topic-only" }
    });
  });

  it("publishes a design-pack deck with non-blocking quality warnings", async () => {
    const deck = createDeck();
    const deckValidation = validation({
      passed: false,
      designIssues: [
        {
          code: "TEXT_OVERFLOW",
          scope: "element",
          severity: "warning",
          blocking: false,
          path: "slides.0.elements.0",
          message: "Text overflows."
        }
      ],
      presentationIssues: [
        {
          code: "SPEAKER_NOTES_SHORT",
          scope: "deck",
          severity: "warning",
          blocking: false,
          path: "slides",
          message: "Speaker notes are six characters below the target."
        },
        {
          code: "LAYOUT_DIVERSITY_LOW",
          scope: "deck",
          severity: "warning",
          blocking: false,
          path: "slides",
          message: "Core geometry diversity is below the target."
        }
      ]
    });
    const query = dynamicJobQuery();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            deck,
            warnings: [],
            validation: deckValidation,
            diagnostics: diagnostics({ validationIssueCount: 1 })
          })
        )
      )
    );
    const generate = vi.fn();

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: { ...payload.request, generationMode: "design-pack" },
        imageAssetScope: { userId: "user-1" }
      },
      {
        generated: { generate },
        maxPerDeck: 4,
        maxPerUserPerDay: 20,
      }
    );

    expect(job.status).toBe("succeeded");
    expect(job.error).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    expect(job.result).toMatchObject({
      deck: { deckId: deck.deckId },
      validation: {
        passed: false,
        presentationIssues: [
          expect.objectContaining({ code: "SPEAKER_NOTES_SHORT" }),
          expect.objectContaining({ code: "LAYOUT_DIVERSITY_LOW" })
        ]
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(true);
  });

  it("keeps an unresolved media candidate out of the decks table", async () => {
    const deck = deckSchema.parse(
      createDeck({
        metadata: {
          ...createDeck().metadata,
          presentationProfile: "general-inform"
        },
        slides: [
          {
            ...createDeck().slides[0],
            elements: [
              {
                elementId: "el_1_design_pack_visual_media_placeholder",
                type: "rect",
                role: "media",
                x: 1114,
                y: 256,
                width: 686,
                height: 520,
                rotation: 0,
                opacity: 1,
                zIndex: 3,
                locked: false,
                visible: true,
                props: {
                  fill: "#eeeeee",
                  stroke: "transparent",
                  strokeWidth: 0,
                  borderRadius: 8
                }
              }
            ],
            aiNotes: {
              ...createDeck().slides[0].aiNotes,
              visualPlan: {
                visualType: "image",
                imageNeeded: true,
                imageSourcePolicy: "ai-generated",
                reason: "Show the product"
              }
            }
          }
        ]
      })
    );
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => [
        jobRow(
          "failed",
          90,
          params[4] as Record<string, unknown>,
          params[5] as { code: string; message: string }
        )
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            deck,
            warnings: [],
            validation: validation(),
            diagnostics: diagnostics()
          })
        )
      )
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      {
        ...payload,
        request: { ...payload.request, generationMode: "design-pack" }
      }
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("GENERATE_DECK_QUALITY_GATE_FAILED");
    expect(job.result).toMatchObject({
      validation: {
        passed: false,
        designIssues: [
          expect.objectContaining({ code: "MEDIA_PLACEHOLDER_UNRESOLVED" })
        ]
      }
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO decks"))
    ).toBe(false);
  });

  it("marks the DB job failed when Python generation fails", async () => {
    const safeMessage =
      "Art Director could not create a valid design plan. Please retry deck generation.";
    const responseBody = JSON.stringify({ detail: safeMessage });
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 15, null, {
          code: "PYTHON_WORKER_GENERATE_DECK_FAILED",
          message: responseBody
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(responseBody, { status: 503 }))
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      storage,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe(responseBody);
    expect(job.error?.message).toContain(safeMessage);
    expect(job.error?.message).not.toContain("validation error");
    expect(job.error?.message).not.toContain("input_value");
    expect(query.mock.calls[1]?.[1]?.[5]).toEqual({
      code: "PYTHON_WORKER_GENERATE_DECK_FAILED",
      message: responseBody
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("passes explicit design-pack generation mode to Python deck generation", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
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
    expect(timeoutSpy).toHaveBeenCalledWith(300_000);
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

function programV2Payload() {
  return {
    ...payload,
    request: {
      ...payload.request,
      generationMode: "design-pack" as const,
      design: {
        ...payload.request.design,
        engineVersion: "program-v2" as const
      }
    }
  };
}

function hybridProgramV2Payload() {
  const base = programV2Payload();
  return {
    ...base,
    request: {
      ...base.request,
      design: {
        ...base.request.design,
        mediaPolicy: "hybrid" as const
      },
      visualPlanPolicy: { mediaPolicy: "hybrid" as const }
    }
  };
}

function programV2Deck() {
  const base = createDeck();
  return deckSchema.parse({
    ...base,
    metadata: {
      ...base.metadata,
      designProgramSnapshot: designProgramSnapshot()
    },
    slides: [
      {
        ...base.slides[0],
        elements: [
          {
            elementId: "el_1_program_v2_title",
            type: "text",
            role: "title",
            x: 120,
            y: 220,
            width: 1320,
            height: 180,
            rotation: 0,
            opacity: 1,
            zIndex: 3,
            locked: false,
            visible: true,
            props: {
              text: "Visual deck",
              fontFamily: "Pretendard",
              fontSize: 64,
              color: "#111827"
            }
          }
        ],
        aiNotes: {
          ...base.slides[0].aiNotes,
          visualPlan: {
            visualType: "minimal-cover",
            imageNeeded: false,
            imageSourcePolicy: "minimal",
            reason: "Native composition"
          },
          compositionPlan: {
            compositionId: "minimal-cover",
            variant: "light",
            backgroundMode: "light",
            focalType: "title",
            primaryFocalElementId: "el_1_program_v2_title",
            assetRole: "none",
            requiredAsset: false
          }
        }
      }
    ]
  });
}

function programV2DeckWithOptionalMedia() {
  const base = programV2Deck();
  return deckSchema.parse({
    ...base,
    metadata: {
      ...base.metadata,
      designProgramSnapshot: {
        ...designProgramSnapshot(),
        compositionIds: ["hero-split"]
      }
    },
    slides: [
      {
        ...base.slides[0],
        elements: [
          ...base.slides[0].elements,
          {
            elementId: "el_1_program_v2_media_placeholder",
            type: "rect",
            role: "media",
            x: 1114,
            y: 220,
            width: 686,
            height: 520,
            rotation: 0,
            opacity: 1,
            zIndex: 4,
            locked: false,
            visible: true,
            props: {
              fill: "#E2E8F0",
              stroke: "#64748B",
              strokeWidth: 2,
              borderRadius: 8
            }
          }
        ],
        aiNotes: {
          ...base.slides[0].aiNotes,
          visualPlan: {
            visualType: "hero-image",
            imageNeeded: true,
            imageSourcePolicy: "ai-generated",
            reason: "Optional atmosphere"
          },
          compositionPlan: {
            compositionId: "hero-split",
            variant: "light",
            backgroundMode: "light",
            focalType: "title",
            primaryFocalElementId: "el_1_program_v2_title",
            assetRole: "atmosphere",
            requiredAsset: false
          }
        }
      }
    ]
  });
}

function programV2DeckWithResolvedMedia() {
  const deck = programV2DeckWithOptionalMedia();
  return deckSchema.parse({
    ...deck,
    slides: [
      {
        ...deck.slides[0],
        elements: deck.slides[0].elements.map((element) =>
          element.elementId.endsWith("_media_placeholder")
            ? {
                ...element,
                elementId: element.elementId.replace(
                  "_media_placeholder",
                  "_media_asset"
                ),
                type: "image",
                props: {
                  src: "/api/v1/projects/project-a/assets/file_visual/content",
                  alt: "Official product visual",
                  fit: "cover"
                }
              }
            : element
        ),
        aiNotes: {
          ...deck.slides[0].aiNotes,
          visualPlan: {
            ...deck.slides[0].aiNotes?.visualPlan,
            asset: {
              fileId: "file_visual",
              provider: "official-web",
              sourceUrl: "https://official.example/product",
              sourceAssetUrl: "https://official.example/product.png",
              sourceAuthority: "official",
              usageBasis: "official-reference"
            }
          }
        }
      }
    ]
  });
}

function programV2DeckWithResolvedMediaCount(count: number) {
  const base = programV2DeckWithResolvedMedia();
  const source = base.slides[0];
  const slides = Array.from({ length: count }, (_, index) => {
    const order = index + 1;
    const isEvidence = index === 0;
    const replaceElementId = (value: string) =>
      value.replace("el_1_", `el_${order}_`);
    return {
      ...source,
      slideId: `slide_${order}`,
      order,
      title: `Visual deck ${order}`,
      elements: source.elements.map((element) => ({
        ...element,
        elementId: replaceElementId(element.elementId),
        props:
          element.type === "image"
            ? {
                ...element.props,
                src: `https://assets.example/visual-${order}.png`
              }
            : element.props
      })),
      aiNotes: {
        ...source.aiNotes,
        visualPlan: {
          ...source.aiNotes?.visualPlan,
          imageSourcePolicy: isEvidence ? "official-assets" : "ai-generated",
          asset: {
            ...source.aiNotes?.visualPlan?.asset,
            fileId: `file_visual_${order}`,
            provider: isEvidence ? "official-web" : "openai",
            ...(isEvidence
              ? {
                  sourceUrl: "https://official.example/product",
                  sourceAssetUrl: "https://official.example/product.png",
                  sourceAuthority: "official" as const,
                  usageBasis: "official-reference" as const
                }
              : {
                  sourceUrl: undefined,
                  sourceAssetUrl: undefined,
                  sourceAuthority: undefined,
                  usageBasis: "generated" as const
                })
          }
        },
        compositionPlan: {
          ...source.aiNotes?.compositionPlan,
          assetRole: isEvidence ? "evidence" : "atmosphere",
          primaryFocalElementId: replaceElementId(
            source.aiNotes?.compositionPlan?.primaryFocalElementId ??
              "el_1_program_v2_title"
          )
        }
      }
    };
  });
  return deckSchema.parse({
    ...base,
    metadata: {
      ...base.metadata,
      designProgramSnapshot: {
        ...designProgramSnapshot(),
        backgroundSequence: Array.from({ length: count }, () => "light"),
        compositionIds: Array.from({ length: count }, () => "hero-split")
      }
    },
    slides
  });
}

function designProgramSnapshot() {
  return {
    version: "program-v2",
    visualConcept: "Editorial product reveal",
    paletteRoles: {
      dominant: "#FFFFFF",
      surface: "#F3F4F6",
      text: "#111827",
      focal: "#6D28D9",
      secondary: "#06B6D4"
    },
    typography: {
      headingFont: "Pretendard",
      bodyFont: "Pretendard",
      typeScale: { cover: 64, title: 40, body: 22, caption: 14 }
    },
    backgroundSequence: ["light" as const],
    imageStyle: "Official evidence with expressive atmosphere",
    surfaceStyle: "Flat editorial fields",
    compositionIds: ["minimal-cover" as const]
  };
}

function generateDeckResponse(deck: Deck) {
  return new Response(
    JSON.stringify({
      deck,
      warnings: [],
      validation: validation(),
      diagnostics: diagnostics()
    })
  );
}

function visualPassResponse() {
  return new Response(
    JSON.stringify({
      review: { passed: true, issues: [], repairActions: [] },
      warnings: []
    })
  );
}

function visualFailureResponse(
  code: "FOCAL_POINT_WEAK" | "BALANCE_WEAK" | "IMAGE_CONTENT_MISMATCH"
) {
  return new Response(
    JSON.stringify({
      review: {
        passed: false,
        issues: [{ code, slideOrder: 1, message: "Visual hierarchy is weak." }],
        repairActions: [
          {
            action: "increaseFocalScale",
            slideId: "slide_1",
            targetElementId: "el_1_program_v2_title",
            compositionId: null,
            backgroundMode: null,
            reason: "Strengthen the primary focal point."
          }
        ]
      },
      warnings: []
    })
  );
}

function visualRepairResponse(deck: Deck) {
  return new Response(
    JSON.stringify({
      deck,
      validation: validation(),
      assetSlideIds: [],
      warnings: []
    })
  );
}

function dynamicJobQuery() {
  return vi.fn(async (sql: string, params: unknown[] = []) => {
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
    return [];
  });
}

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

function diagnostics(overrides: Record<string, unknown> = {}) {
  return {
    referencePolicy: "references-first",
    uploadedSourceCount: 1,
    webSourceCount: 0,
    repairAttempted: false,
    repairReasons: [],
    uniqueCoreLayoutCount: 1,
    validationIssueCount: 0,
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
