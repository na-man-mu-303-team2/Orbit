import type {
  GeneratedImageProvider,
  PublicImageSearchProvider,
} from "@orbit/ai";
import { createDemoDeck } from "@orbit/editor-core";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSlideImageAssets } from "./image-asset-pipeline";

describe("resolveSlideImageAssets", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves one redesign placeholder through the existing budget and storage boundary", async () => {
    const deck = imageDeck();
    const generate = vi.fn<GeneratedImageProvider["generate"]>(async () => ({
      body: pngHeader(1280, 720),
      mimeType: "image/png",
      fileName: "redesign.png",
      provider: "openai",
      checkedAt: "2026-07-22T00:00:00.000Z",
    }));
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ user_count: "0" }])
      .mockResolvedValueOnce([]);
    const putObject = vi.fn(async () => ({
      key: "stored-key",
      url: "stored-url",
      contentType: "image/png",
      purpose: "design-asset" as const,
      size: 24,
    }));

    const result = await resolveSlideImageAssets(
      { query } as unknown as DataSource,
      { putObject } as Pick<StoragePort, "putObject">,
      deck,
      imageRequest("atmosphere"),
      {
        generated: { generate },
        maxPerDeck: 4,
        maxPerUserPerDay: 30,
      },
      { userId: "user-1" },
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: "square",
        prompt: expect.stringContaining("Do not include text"),
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      "Keep the center visually quiet",
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      "Palette: #2563EB, #0F766E, #EFF6FF",
    );
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "design-asset" }),
    );
    expect(String(query.mock.calls[1]?.[0])).toContain(
      "INSERT INTO project_assets",
    );
    expect(result.warnings).toEqual([]);
    expect(result.deck.slides[0]?.elements).toContainEqual(
      expect.objectContaining({
        elementId: "el_redesign_media_asset",
        type: "image",
        props: expect.objectContaining({ alt: "Calm abstract collaboration" }),
      }),
    );
  });

  it("retains the styled placeholder without calling the provider when budget is exhausted", async () => {
    const deck = imageDeck();
    const generate = vi.fn<GeneratedImageProvider["generate"]>();

    const result = await resolveSlideImageAssets(
      {
        query: vi.fn(async () => [{ user_count: "30" }]),
      } as unknown as DataSource,
      { putObject: vi.fn() } as unknown as Pick<StoragePort, "putObject">,
      deck,
      imageRequest("atmosphere"),
      {
        generated: { generate },
        maxPerDeck: 1,
        maxPerUserPerDay: 30,
      },
      { userId: "user-1" },
    );

    expect(generate).not.toHaveBeenCalled();
    expect(result.deck).toEqual(deck);
    expect(result.warnings).toEqual([
      "Daily image asset budget retained the styled media fallback.",
    ]);
  });

  it("turns a provider exception into a bounded warning and keeps the layout", async () => {
    const deck = imageDeck();
    const generate = vi.fn<GeneratedImageProvider["generate"]>(async () => {
      throw new Error("SECRET_PROVIDER_DETAIL");
    });

    const result = await resolveSlideImageAssets(
      {
        query: vi.fn(async () => [{ user_count: "0" }]),
      } as unknown as DataSource,
      { putObject: vi.fn() } as unknown as Pick<StoragePort, "putObject">,
      deck,
      imageRequest("atmosphere"),
      {
        generated: { generate },
        maxPerDeck: 1,
        maxPerUserPerDay: 30,
      },
      { userId: "user-1" },
    );

    expect(result.deck).toEqual(deck);
    expect(result.warnings).toHaveLength(1);
    expect(JSON.stringify(result.warnings)).not.toContain(
      "SECRET_PROVIDER_DETAIL",
    );
    expect(result.diagnostics[0]).toMatchObject({ provider: "openai" });
  });

  it("enforces the 25 second timeout even when the provider ignores abort", async () => {
    vi.useFakeTimers();
    const deck = imageDeck();
    const generate = vi.fn<GeneratedImageProvider["generate"]>(
      () => new Promise(() => undefined),
    );
    const pending = resolveSlideImageAssets(
      {
        query: vi.fn(async () => [{ user_count: "0" }]),
      } as unknown as DataSource,
      { putObject: vi.fn() } as unknown as Pick<StoragePort, "putObject">,
      deck,
      imageRequest("atmosphere"),
      {
        generated: { generate },
        maxPerDeck: 1,
        maxPerUserPerDay: 30,
      },
      { userId: "user-1" },
    );

    await vi.advanceTimersByTimeAsync(25_000);
    const result = await pending;

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.deck).toEqual(deck);
    expect(result.warnings).toHaveLength(1);
  });

  it("uses licensed search for evidence and never substitutes generated imagery", async () => {
    const deck = imageDeck();
    const generate = vi.fn<GeneratedImageProvider["generate"]>();
    const search = vi.fn<PublicImageSearchProvider["search"]>(async () => ({
      body: pngHeader(1280, 720),
      mimeType: "image/png",
      fileName: "evidence.png",
      provider: "openverse",
      sourceUrl: "https://example.com/evidence",
      sourceAssetUrl: "https://images.example.com/evidence.png",
      author: "Creator",
      license: "cc-by",
      checkedAt: "2026-07-22T00:00:00.000Z",
      usageBasis: "licensed",
    }));
    const query = vi.fn(async () => []);

    const result = await resolveSlideImageAssets(
      { query } as unknown as DataSource,
      { putObject: vi.fn() } as unknown as Pick<StoragePort, "putObject">,
      deck,
      imageRequest("evidence"),
      {
        generated: { generate },
        publicSearch: { search },
        maxPerDeck: 1,
        maxPerUserPerDay: 30,
      },
      { userId: "user-1" },
    );

    expect(search).toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(result.deck.slides[0]?.elements).toContainEqual(
      expect.objectContaining({ type: "image" }),
    );
  });

  it("does not fall back to generated imagery when evidence search fails", async () => {
    const deck = imageDeck();
    const generate = vi.fn<GeneratedImageProvider["generate"]>();
    const search = vi.fn<PublicImageSearchProvider["search"]>(async () => {
      throw new Error("Openverse returned no licensed image candidate");
    });

    const result = await resolveSlideImageAssets(
      { query: vi.fn() } as unknown as DataSource,
      { putObject: vi.fn() } as unknown as Pick<StoragePort, "putObject">,
      deck,
      imageRequest("evidence"),
      {
        generated: { generate },
        publicSearch: { search },
        maxPerDeck: 1,
        maxPerUserPerDay: 30,
      },
      { userId: "user-1" },
    );

    expect(search).toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(result.deck).toEqual(deck);
    expect(result.diagnostics[0]?.reasonCode).toBe(
      "OPENVERSE_NO_LICENSED_CANDIDATE",
    );
  });
});

function imageDeck() {
  const deck = createDemoDeck();
  const template = deck.slides[0]!.elements.find(
    (element) => element.type === "rect",
  );
  if (!template) throw new Error("demo deck rect fixture is missing");
  deck.slides[0]!.elements.push({
    ...template,
    elementId: "el_redesign_media_placeholder",
    role: "media",
    x: 960,
    y: 120,
    width: 840,
    height: 720,
    props: { ...template.props, fill: "#DBEAFE" },
  });
  return deck;
}

function imageRequest(assetRole: "atmosphere" | "evidence" | "decoration") {
  return {
    slideId: imageDeck().slides[0]!.slideId,
    placeholderElementId: "el_redesign_media_placeholder",
    assetRole,
    prompt: "Calm abstract collaboration",
    alt: "Calm abstract collaboration",
    palette: {
      dominant: "#EFF6FF",
      surface: "#FFFFFF",
      text: "#172554",
      focal: "#2563EB",
      secondary: "#0F766E",
    },
  };
}

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
