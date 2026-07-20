import { createDemoDeck } from "@orbit/editor-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDesignAgentMessage,
  createDesignImageGeneration,
  pollDesignImageGeneration,
} from "./designAgentApi";

describe("design agent message API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the visible content and intent preset as separate request fields", async () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const createdAt = "2026-07-18T00:00:00.000Z";
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        sessionId: "design_session_1",
        requestMessage: designMessage("request_1", "user", "사용자에게 보이는 요청", createdAt),
        responseMessage: designMessage("response_1", "assistant", "제안을 준비했습니다.", createdAt),
        uiAction: null,
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetcher);

    await createDesignAgentMessage(deck.projectId, {
      content: "사용자에게 보이는 요청",
      intentPreset: "tidy-layout",
      context: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        canvas: deck.canvas,
        slide,
        selectedElementIds: [],
        theme: deck.theme,
      },
    });

    const requestInit = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      content: "사용자에게 보이는 요청",
      intentPreset: "tidy-layout",
    });
  });
});

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
      referenceImages: [],
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

function designMessage(
  messageId: string,
  role: "user" | "assistant",
  content: string,
  createdAt: string,
) {
  return {
    messageId,
    sessionId: "design_session_1",
    projectId: "project_demo",
    deckId: "deck_demo",
    slideId: "slide_intro",
    role,
    content,
    status: "succeeded",
    createdAt,
    updatedAt: createdAt,
  };
}
