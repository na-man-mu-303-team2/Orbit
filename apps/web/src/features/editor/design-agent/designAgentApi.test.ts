import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDesignImageGeneration,
  pollDesignImageGeneration,
} from "./designAgentApi";

describe("design image generation API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits the dedicated image generation request", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      job: job("queued", null),
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);

    await createDesignImageGeneration("project_1", {
      prompt: "위성 이미지",
      deckId: "deck_1",
      slideId: "slide_1",
      baseVersion: 1,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project_1/design-agent/image-generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("polls a successful result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(job("succeeded", {
      fileId: "file_1",
      projectId: "project_1",
      purpose: "design-asset",
      url: "/image.png",
      mimeType: "image/png",
      width: 1536,
      height: 1024,
      prompt: "위성 이미지",
      aspectRatio: "landscape",
    })), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(pollDesignImageGeneration("job_1", { intervalMs: 0 })).resolves.toMatchObject({
      fileId: "file_1",
    });
  });
});

function job(status: "queued" | "succeeded", result: Record<string, unknown> | null) {
  return {
    jobId: "job_1",
    projectId: "project_1",
    type: "design-image-generation",
    status,
    progress: status === "succeeded" ? 100 : 0,
    message: status,
    result,
    error: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}
