import { createDemoDeck } from "@orbit/editor-core";
import {
  designAgentCapabilities,
  type DesignAgentWorkerRequest,
} from "@orbit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DesignAgentPythonClient,
  DesignAgentPythonError,
} from "./design-agent-python.client";

describe("DesignAgentPythonClient motion errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the worker compile error code and HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: {
              code: "MOTION_AI_COMPILE_UNSAFE",
              message: "AI 모션 분석 결과를 안전하게 적용할 수 없습니다.",
            },
          }),
          {
            status: 422,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const error = await pythonClient()
      .propose(motionRequest())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DesignAgentPythonError);
    expect(error).toMatchObject({ code: "MOTION_AI_COMPILE_UNSAFE" });
    expect((error as DesignAgentPythonError).getStatus()).toBe(422);
  });

  it("maps an invalid motion response to a bounded plan error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const error = await pythonClient()
      .propose(motionRequest())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DesignAgentPythonError);
    expect(error).toMatchObject({ code: "MOTION_AI_INVALID_PLAN" });
    expect((error as DesignAgentPythonError).getStatus()).toBe(503);
  });

  it("maps a network failure to provider unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    const error = await pythonClient()
      .propose(motionRequest())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DesignAgentPythonError);
    expect(error).toMatchObject({ code: "MOTION_AI_PROVIDER_UNAVAILABLE" });
  });
});

function motionRequest(): DesignAgentWorkerRequest {
  const deck = createDemoDeck();
  const slide = deck.slides[0]!;
  return {
    projectId: deck.projectId,
    sessionId: "session_motion_1",
    question: "애니메이션을 추천해 주세요.",
    intentPreset: "recommend-animation",
    context: {
      deckId: deck.deckId,
      baseVersion: deck.version,
      canvas: deck.canvas,
      slide,
      selectedElementIds: [],
      theme: deck.theme,
    },
    history: [],
    availableSmartArtLayouts: [],
    capabilities: designAgentCapabilities,
    requestPaletteOptions: false,
  };
}

function pythonClient(): DesignAgentPythonClient {
  return Object.assign(Object.create(DesignAgentPythonClient.prototype), {
    pythonWorkerUrl: "http://localhost:8000",
  }) as DesignAgentPythonClient;
}
