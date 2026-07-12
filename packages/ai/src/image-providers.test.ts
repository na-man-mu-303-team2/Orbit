import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAiGeneratedImageProvider,
  OpenversePublicImageSearchProvider
} from "./image-providers";

describe("image providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("decodes OpenAI image output without exposing the API key", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ data: [{ b64_json: Buffer.from([1, 2]).toString("base64") }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAiGeneratedImageProvider("secret-key").generate({
      prompt: "presentation visual"
    });

    expect(Array.from(result.body)).toEqual([1, 2]);
    expect(result.mimeType).toBe("image/png");
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(requestBody).not.toContain("secret-key");
  });

  it("returns Openverse attribution and license metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/image.jpg",
                creator: "Creator",
                license: "cc-by",
                license_url: "https://creativecommons.org/licenses/by/4.0/",
                foreign_landing_url: "https://example.com/source",
                title: "Product"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenversePublicImageSearchProvider().search({
      query: "product"
    });

    expect(result).toMatchObject({
      author: "Creator",
      license: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://example.com/source",
      provider: "openverse"
    });
    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(searchUrl.searchParams.get("size")).toBe("large,medium");
    expect(searchUrl.searchParams.get("aspect_ratio")).toBe("wide");
  });

  it("skips Openverse candidates below the presentation minimum", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/small.jpg",
                width: 320,
                height: 180,
                license: "cc-by",
                foreign_landing_url: "https://example.com/small",
                title: "Small wide product"
              },
              {
                url: "https://images.example.com/large.jpg",
                width: 1280,
                height: 720,
                creator: "Large Creator",
                license: "cc-by",
                foreign_landing_url: "https://example.com/large",
                title: "Large wide product"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenversePublicImageSearchProvider().search({
      query: "wide product"
    });

    expect(result).toMatchObject({
      author: "Large Creator",
      sourceUrl: "https://example.com/large"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://images.example.com/large.jpg"
    );
  });

  it("falls back to another licensed Openverse candidate when download fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/unavailable.jpg",
                license: "cc-by",
                foreign_landing_url: "https://example.com/unavailable",
                title: "Unavailable product"
              },
              {
                url: "https://images.example.com/available.jpg",
                creator: "Second Creator",
                license: "cc0",
                foreign_landing_url: "https://example.com/available",
                title: "Available product"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenversePublicImageSearchProvider().search({
      query: "product"
    });

    expect(result).toMatchObject({
      author: "Second Creator",
      license: "cc0",
      sourceUrl: "https://example.com/available"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("skips an unrelated laptop and selects a Git branching candidate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/laptop.jpg",
                width: 1280,
                height: 720,
                license: "cc-by",
                foreign_landing_url: "https://example.com/laptop",
                title: "Eee PC HackBook screen side",
                tags: [{ name: "linux" }, { name: "laptop" }]
              },
              {
                url: "https://images.example.com/branching.jpg",
                width: 1280,
                height: 720,
                license: "cc-by",
                foreign_landing_url: "https://example.com/branching",
                title: "Git branching workflow",
                tags: [{ name: "repository" }]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenversePublicImageSearchProvider().search({
      query: "Git branching workflow diagram"
    });

    expect(result.sourceUrl).toBe("https://example.com/branching");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://images.example.com/branching.jpg"
    );
  });

  it("retries a specific compact query when a detailed prompt has no results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/louvre.jpg",
                width: 1280,
                height: 720,
                license: "cc-by",
                foreign_landing_url: "https://example.com/louvre",
                title: "Louvre Pyramid Paris",
                tags: [{ name: "museum" }]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenversePublicImageSearchProvider().search({
      query: "Louvre Pyramid exterior Paris at night photo-realistic"
    });

    expect(result.sourceUrl).toBe("https://example.com/louvre");
    expect(
      new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("q")
    ).toBe("louvre pyramid paris");
  });

  it("falls back to the leading identity token for sparse branded results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/splatoon.jpg",
                width: 1024,
                height: 683,
                license: "cc-by",
                foreign_landing_url: "https://example.com/splatoon",
                title: "Splatoon amiibo",
                tags: [{ name: "nintendo" }]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenversePublicImageSearchProvider().search({
      query: "Splatoon fans celebrating none"
    });

    expect(result.sourceUrl).toBe("https://example.com/splatoon");
    expect(
      new URL(String(fetchMock.mock.calls[2]?.[0])).searchParams.get("q")
    ).toBe("splatoon");
  });

  it("rejects candidates that match only generic presentation words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://images.example.com/generic.jpg",
                width: 1280,
                height: 720,
                license: "cc-by",
                foreign_landing_url: "https://example.com/generic",
                title: "Presentation visual diagram"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(
      new OpenversePublicImageSearchProvider().search({
        query: "Git branching presentation diagram"
      })
    ).rejects.toThrow("no licensed image candidate");
  });
});
