import { createDemoDeck } from "@orbit/editor-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDesignAgentProposal,
  connectSlideRedesignProgress,
  createDesignAgentMessage,
  createDesignImageGeneration,
  createSlideRedesignJob,
  isDesignAgentProposalStaleError,
  pollDesignImageGeneration,
  pollSlideRedesignJob,
  DesignAgentApiError,
} from "./designAgentApi";

describe("design agent message API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the visible content and intent preset as separate request fields", async () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const createdAt = "2026-07-18T00:00:00.000Z";
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            sessionId: "design_session_1",
            requestMessage: designMessage(
              "request_1",
              "user",
              "사용자에게 보이는 요청",
              createdAt,
            ),
            responseMessage: designMessage(
              "response_1",
              "assistant",
              "제안을 준비했습니다.",
              createdAt,
            ),
            uiAction: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
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

  it("preserves the explicit palette request and selected option in JSON", async () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const createdAt = "2026-07-18T00:00:00.000Z";
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            sessionId: "design_session_1",
            requestMessage: designMessage(
              "request_palette",
              "user",
              "리디자인",
              createdAt,
            ),
            responseMessage: designMessage(
              "response_palette",
              "assistant",
              "확인했습니다.",
              createdAt,
            ),
            uiAction: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const context = {
      deckId: deck.deckId,
      baseVersion: deck.version,
      canvas: deck.canvas,
      slide,
      selectedElementIds: [],
      theme: deck.theme,
    };

    await createDesignAgentMessage(deck.projectId, {
      content: "리디자인",
      intentPreset: "redesign-slide",
      selectedPaletteOptionId: null,
      context,
    });
    await createDesignAgentMessage(deck.projectId, {
      sessionId: "design_session_1",
      content: "리디자인",
      intentPreset: "redesign-slide",
      selectedPaletteOptionId: "current-theme",
      context,
    });

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      selectedPaletteOptionId: null,
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      sessionId: "design_session_1",
      selectedPaletteOptionId: "current-theme",
    });
  });

  it.each([
    [
      "MOTION_AI_PROVIDER_UNAVAILABLE",
      503,
      "AI 모션 분석 서비스에 연결하지 못했습니다.",
    ],
    [
      "MOTION_AI_EMPTY_RESPONSE",
      503,
      "AI가 모션 계획을 완성하지 못했습니다.",
    ],
    [
      "MOTION_AI_INVALID_PLAN",
      503,
      "AI 모션 분석 결과를 검증하지 못했습니다.",
    ],
    [
      "MOTION_AI_COMPILE_UNSAFE",
      422,
      "AI 모션 계획이 현재 슬라이드의 안전 기준을 통과하지 못했습니다.",
    ],
  ] as const)(
    "maps %s to an actionable Korean error",
    async (code, status, message) => {
      const deck = createDemoDeck();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ code, message: "internal" }), {
            status,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      const error = await createDesignAgentMessage(deck.projectId, {
        content: "애니메이션을 추천해 주세요.",
        intentPreset: "recommend-animation",
        context: {
          deckId: deck.deckId,
          baseVersion: deck.version,
          canvas: deck.canvas,
          slide: deck.slides[0]!,
          selectedElementIds: [],
          theme: deck.theme,
        },
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DesignAgentApiError);
      expect(error).toMatchObject({ code, status });
      expect((error as Error).message).toContain(message);
    },
  );
});

describe("design proposal apply API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps a server conflict to the shared stale proposal state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: "Design agent proposal baseVersion is stale.",
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const request = applyDesignAgentProposal("project_1", "proposal_1");
    await expect(request).rejects.toSatisfy(isDesignAgentProposalStaleError);
  });
});

describe("slide redesign Job API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits the palette selection to the dedicated Job endpoint", async () => {
    const deck = createDemoDeck();
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            job: slideRedesignJob("queued", null),
            requestMessage: designMessage(
              "request_redesign_1",
              "user",
              "선택한 배색으로 리디자인",
              "2026-07-22T00:00:00.000Z",
            ),
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await createSlideRedesignJob(deck.projectId, {
      sessionId: "design_session_1",
      content: "선택한 배색으로 리디자인",
      selectedPaletteOptionId: "current-theme",
      context: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        canvas: deck.canvas,
        slide: deck.slides[0]!,
        selectedElementIds: [],
        theme: deck.theme,
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/projects/${deck.projectId}/design-agent/slide-redesign-jobs`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      sessionId: "design_session_1",
      selectedPaletteOptionId: "current-theme",
    });
  });

  it("polls the authenticated Job endpoint and validates the final result", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify(slideRedesignJob("succeeded", slideRedesignResult())),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      pollSlideRedesignJob("job_redesign_1", { intervalMs: 0 }),
    ).resolves.toMatchObject({ outcome: "applicable", stale: false });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/jobs/job_redesign_1");
  });

  it("maps a stale enqueue conflict and a terminal Job failure to retryable errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ message: "Slide redesign baseVersion is stale." }),
      { status: 409, headers: { "content-type": "application/json" } },
    )));
    const deck = createDemoDeck();
    await expect(createSlideRedesignJob(deck.projectId, {
      sessionId: "design_session_1",
      content: "리디자인",
      selectedPaletteOptionId: "current-theme",
      context: {
        deckId: deck.deckId,
        baseVersion: deck.version,
        canvas: deck.canvas,
        slide: deck.slides[0]!,
        selectedElementIds: [],
        theme: deck.theme,
      },
    })).rejects.toSatisfy(isDesignAgentProposalStaleError);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify(slideRedesignJob("failed", null)),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    await expect(
      pollSlideRedesignJob("job_redesign_1", { intervalMs: 0 }),
    ).rejects.toThrow("다시 시도해 주세요");
  });

  it("joins the project room and accepts only matching validated progress", () => {
    const handlers = new Map<string, (payload?: unknown) => void>();
    const socket = {
      connected: true,
      disconnect: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
      on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        handlers.set(event, handler);
      }),
    };
    const onProgress = vi.fn();
    const connection = connectSlideRedesignProgress(
      {
        jobId: "job_redesign_1",
        projectId: "project_demo_1",
        sessionId: "design_session_1",
        onProgress,
      },
      () => socket,
    );
    const progress = {
      roomId: "project_demo_1",
      sessionId: "design_session_1",
      userId: "system",
      sentAt: "2026-07-22T00:00:00.000Z",
      payload: {
        jobId: "job_redesign_1",
        projectId: "project_demo_1",
        sessionId: "design_session_1",
        stage: "composing",
        completedStages: ["interpreting"],
      },
    };

    expect(socket.emit).toHaveBeenCalledWith("project:join", {
      projectId: "project_demo_1",
    });
    handlers.get("job-progressed")?.(progress);
    handlers.get("job-progressed")?.({
      ...progress,
      payload: { ...progress.payload, jobId: "another_job" },
    });
    handlers.get("job-progressed")?.({ raw: "invalid" });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(progress.payload);

    connection.disconnect();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});

describe("design image generation API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits the dedicated image generation request", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            job: job("queued", null),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
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
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              job("succeeded", {
                fileId: "file_1",
                projectId: "project_1",
                purpose: "design-asset",
                url: "/image.png",
                mimeType: "image/png",
                width: 1536,
                height: 1024,
                prompt: "위성 이미지",
                aspectRatio: "landscape",
              }),
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    await expect(
      pollDesignImageGeneration("job_1", { intervalMs: 0 }),
    ).resolves.toMatchObject({
      fileId: "file_1",
    });
  });
});

function job(
  status: "queued" | "succeeded",
  result: Record<string, unknown> | null,
) {
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

function slideRedesignJob(
  status: "queued" | "succeeded" | "failed",
  result: Record<string, unknown> | null,
) {
  return {
    jobId: "job_redesign_1",
    projectId: "project_demo_1",
    type: "slide-redesign",
    status,
    progress: status === "succeeded" ? 100 : 0,
    message: status,
    result,
    error: status === "failed"
      ? { code: "SLIDE_REDESIGN_FAILED", message: "bounded" }
      : null,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
  };
}

function slideRedesignResult() {
  return {
    outcome: "applicable",
    sessionId: "design_session_1",
    requestMessageId: "request_redesign_1",
    responseMessageId: "response_redesign_1",
    proposal: {
      proposalId: "proposal_redesign_1",
      projectId: "project_demo_1",
      deckId: "deck_demo_1",
      slideId: "slide_intro",
      requestMessageId: "request_redesign_1",
      responseMessageId: "response_redesign_1",
      baseVersion: 1,
      title: "슬라이드 리디자인",
      operations: [
        {
          type: "update_slide_style",
          slideId: "slide_intro",
          style: { backgroundColor: "#F8FAFC" },
        },
      ],
      affectedElementIds: [],
      warnings: [],
      status: "pending",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    },
    stale: false,
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
