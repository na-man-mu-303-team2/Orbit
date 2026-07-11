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
  });
});
