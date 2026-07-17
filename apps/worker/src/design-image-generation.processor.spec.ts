import type { GeneratedImageProvider } from "@orbit/ai";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDesignImageAsset } from "./image-asset-pipeline";

describe("design image generation asset", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the requested aspect ratio and stores one deterministic design asset", async () => {
    const generate = vi.fn<GeneratedImageProvider["generate"]>(async () => ({
      body: pngHeader(1536, 1024),
      mimeType: "image/png",
      fileName: "generated.png",
      provider: "openai",
      usageBasis: "generated",
    }));
    const query = vi.fn().mockResolvedValueOnce([{ user_count: "0" }]).mockResolvedValueOnce([]);
    const putObject = vi.fn(async () => ({
      key: "key",
      url: "url",
      contentType: "image/png",
      purpose: "design-asset" as const,
      size: 24,
    }));
    const getSignedReadUrl = vi.fn();

    const result = await generateDesignImageAsset(
      { query } as unknown as DataSource,
      { putObject, getSignedReadUrl } as Pick<
        StoragePort,
        "putObject" | "getSignedReadUrl"
      >,
      { generated: { generate }, maxPerDeck: 4, maxPerUserPerDay: 30 },
      {
        jobId: "job_1",
        projectId: "project_1",
        userId: "user_1",
        deckId: "deck_1",
        slideId: "slide_1",
        baseVersion: 1,
        prompt: "푸른 지구를 도는 위성",
        aspectRatio: "landscape",
        slideContext: {
          title: "우주 기술",
          text: ["저궤도 위성 네트워크"],
          theme: {
            name: "Orbit",
            primaryColor: "#2563eb",
            secondaryColor: "#7c3aed",
            accentColor: "#2563eb",
            backgroundColor: "#ffffff",
          },
        },
      },
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: "landscape" }),
    );
    expect(result).toMatchObject({ width: 1536, height: 1024, purpose: "design-asset" });
    expect(String(query.mock.calls[1]?.[0])).toContain("ON CONFLICT (file_id) DO UPDATE");
  });

  it("passes selected image bytes to the generated image provider", async () => {
    const generate = vi.fn<GeneratedImageProvider["generate"]>(async () => ({
      body: pngHeader(1536, 1024),
      mimeType: "image/png",
      fileName: "generated.png",
      provider: "openai",
      usageBasis: "generated",
    }));
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ user_count: "0" }])
      .mockResolvedValueOnce([
        {
          file_id: "file_reference",
          project_id: "project_1",
          storage_key: "projects/project_1/assets/file_reference.png",
          original_name: "reference.png",
          mime_type: "image/png",
          size: 24,
        },
      ])
      .mockResolvedValueOnce([]);
    const putObject = vi.fn(async () => ({
      key: "key",
      url: "url",
      contentType: "image/png",
      purpose: "design-asset" as const,
      size: 24,
    }));
    const getSignedReadUrl = vi.fn(async () => "https://storage.local/reference.png");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pngHeader(800, 600), { status: 200 })),
    );

    await generateDesignImageAsset(
      { query } as unknown as DataSource,
      { putObject, getSignedReadUrl } as Pick<
        StoragePort,
        "putObject" | "getSignedReadUrl"
      >,
      { generated: { generate }, maxPerDeck: 4, maxPerUserPerDay: 30 },
      {
        jobId: "job_2",
        projectId: "project_1",
        userId: "user_1",
        deckId: "deck_1",
        slideId: "slide_1",
        baseVersion: 1,
        prompt: "참고 이미지와 비슷한 분위기",
        aspectRatio: "landscape",
        slideContext: {
          title: "우주 기술",
          text: [],
          theme: {
            name: "Orbit",
            primaryColor: "#2563eb",
            secondaryColor: "#7c3aed",
            accentColor: "#2563eb",
            backgroundColor: "#ffffff",
          },
        },
        selectedImageReference: {
          elementId: "el_reference_image",
          fileId: "file_reference",
          projectId: "project_1",
          src: "/api/v1/projects/project_1/assets/file_reference/content",
        },
      },
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [
          expect.objectContaining({
            fileName: "reference.png",
            mimeType: "image/png",
            inputFidelity: "high",
          }),
        ],
      }),
    );
  });
});

function pngHeader(width: number, height: number) {
  const body = new Uint8Array(24);
  body.set([0x89, 0x50, 0x4e, 0x47], 0);
  new DataView(body.buffer).setUint32(16, width);
  new DataView(body.buffer).setUint32(20, height);
  return body;
}
