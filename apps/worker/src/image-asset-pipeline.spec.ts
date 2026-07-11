import type { GeneratedImageProvider, PublicImageSearchProvider } from "@orbit/ai";
import { deckSchema } from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyBrandKitLogoAsset,
  resolveDeckImageAssets
} from "./image-asset-pipeline";

describe("image asset pipeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("copies a Brand Kit logo into the generated project and locks its elements", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          file_id: "file_logo",
          project_id: "project_brand",
          storage_key: "projects/project_brand/assets/logo.png",
          original_name: "logo.png",
          mime_type: "image/png",
          size: 24
        }
      ])
      .mockResolvedValueOnce([]);
    const getSignedReadUrl = vi.fn(async () => "http://storage.local/logo.png");
    const putObject = vi.fn(async () => ({
      key: "key",
      url: "url",
      contentType: "image/png",
      purpose: "design-asset" as const,
      size: 24
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pngHeader(1280, 720), { status: 200 }))
    );

    const result = await applyBrandKitLogoAsset(
      { query } as unknown as DataSource,
      { getSignedReadUrl, putObject } as Pick<
        StoragePort,
        "getSignedReadUrl" | "putObject"
      >,
      imageDeck("ai-generated"),
      {
        id: "brand_kit_1",
        organizationId: "organization_1",
        name: "ORBIT",
        version: 1,
        values: {
          logoAssetId: "file_logo",
          palette: {
            primary: "#2563EB",
            secondary: "#0F766E",
            background: "#FFFFFF",
            surface: "#FFFFFF",
            muted: "#E0F2FE",
            border: "#BAE6FD",
            text: "#0F172A",
            accentColor: "#F472B6"
          },
          forbiddenColors: [],
          typography: {
            headingFontFamily: "Pretendard",
            bodyFontFamily: "Pretendard",
            fallbackFamily: "Arial"
          },
          tone: "professional",
          mediaPolicy: "balanced",
          writingStyle: "",
          coverRules: "",
          footerRules: "",
          approvedAssetIds: [],
          lockedFields: ["logo"]
        }
      }
    );

    expect(getSignedReadUrl).toHaveBeenCalledWith(
      "projects/project_brand/assets/logo.png"
    );
    expect(putObject).toHaveBeenCalledOnce();
    expect(query.mock.calls[1]?.[0]).toContain("'brand-kit'");
    const logo = result.deck.slides[0].elements.find((element) =>
      element.elementId.endsWith("_brand_kit_logo")
    );
    expect(logo).toMatchObject({ type: "image", role: "footer", locked: true });
    expect(logo?.type === "image" ? logo.props.src : "").toMatch(
      /^\/api\/v1\/projects\/project_1\/assets\/file_.*\/content$/
    );
  });

  it("retries AI generation once, stores provenance, and replaces the placeholder", async () => {
    const generate = vi
      .fn<GeneratedImageProvider["generate"]>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        body: pngHeader(1280, 720),
        mimeType: "image/png",
        fileName: "generated.png",
        provider: "openai",
        checkedAt: "2026-07-11T00:00:00.000Z",
        generationPrompt: "prompt"
      });
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ user_count: "0", organization_count: "0" }])
      .mockResolvedValueOnce([]);
    const putObject = vi.fn(async () => ({
      key: "key",
      url: "url",
      contentType: "image/png",
      purpose: "design-asset" as const,
      size: 24
    }));

    const result = await resolveDeckImageAssets(
      { query } as unknown as DataSource,
      { putObject } as Pick<StoragePort, "putObject">,
      imageDeck("ai-generated"),
      {
        generated: { generate },
        maxPerDeck: 4,
        maxPerUserPerDay: 30,
        maxPerOrganizationPerDay: 100
      },
      { userId: "user_1" }
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(putObject).toHaveBeenCalledOnce();
    expect(query.mock.calls[1]?.[0]).toContain("INSERT INTO project_assets");
    expect(result.warnings).toEqual([]);
    const image = result.deck.slides[0].elements.find(
      (element) => element.type === "image"
    );
    expect(image?.props.src).toMatch(
      /^\/api\/v1\/projects\/project_1\/assets\/file_.*\/content$/
    );
    expect(result.deck.slides[0].aiNotes?.visualPlan?.asset).toMatchObject({
      provider: "openai"
    });
  });

  it("retains a public image placeholder when license metadata is missing", async () => {
    const search = vi.fn<PublicImageSearchProvider["search"]>(async () => ({
      body: new Uint8Array([1]),
      mimeType: "image/jpeg",
      fileName: "public.jpg",
      provider: "openverse",
      sourceUrl: "https://example.com/image"
    }));
    const query = vi.fn(async () => [
      { user_count: "0", organization_count: "0" }
    ]);

    const result = await resolveDeckImageAssets(
      { query } as unknown as DataSource,
      { putObject: vi.fn() } as unknown as Pick<StoragePort, "putObject">,
      imageDeck("public-assets"),
      {
        publicSearch: { search },
        maxPerDeck: 4,
        maxPerUserPerDay: 30,
        maxPerOrganizationPerDay: 100
      },
      { userId: "user_1" }
    );

    expect(result.deck.slides[0].elements.some((element) => element.elementId.endsWith("_media_placeholder"))).toBe(true);
    expect(result.warnings[0]).toContain("source and license are required");
  });
});

function imageDeck(policy: "ai-generated" | "public-assets") {
  return deckSchema.parse({
    deckId: "deck_1",
    projectId: "project_1",
    title: "Image deck",
    version: 1,
    metadata: { language: "ko", locale: "ko-KR", sourceType: "ai" },
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
        title: "Visual evidence",
        style: {},
        elements: [
          {
            elementId: "el_media_placeholder",
            type: "rect",
            role: "media",
            x: 1200,
            y: 700,
            width: 480,
            height: 100,
            props: { fill: "#E0F2FE" }
          },
          {
            elementId: "el_media_caption",
            type: "text",
            role: "caption",
            x: 1220,
            y: 720,
            width: 440,
            height: 60,
            props: { text: "placeholder" }
          }
        ],
        aiNotes: {
          visualPlan: {
            visualType: "image",
            imageNeeded: true,
            imageSourcePolicy: policy,
            reason: "Show the product in use"
          }
        }
      }
    ]
  });
}

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
