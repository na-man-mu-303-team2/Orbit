import { createDemoDeck } from "@orbit/editor-core";
import {
  designAgentCapabilities,
  designAgentWorkerRequestSchema,
  type DesignAgentWorkerRequest,
} from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";
import {
  SlideRedesignPythonClient,
  SlideRedesignStageClientError,
} from "./slide-redesign-python.client";

describe("SlideRedesignPythonClient", () => {
  it("calls interpret, compose, and verify with the preceding typed artifact", async () => {
    const request = workerRequest();
    const interpreted = interpretArtifact();
    const composed = composeArtifact(request.context.slide.slideId);
    const verified = {
      stage: "verify" as const,
      outcome: "applicable" as const,
      response: composed.response,
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(interpreted))
      .mockResolvedValueOnce(jsonResponse(composed))
      .mockResolvedValueOnce(jsonResponse(verified));
    const client = new SlideRedesignPythonClient(
      "http://python-worker:8000",
      fetchImpl,
    );

    await expect(client.interpret(request)).resolves.toEqual(interpreted);
    await expect(client.compose(request, interpreted)).resolves.toEqual(
      composed,
    );
    await expect(client.verify(request, composed)).resolves.toEqual(verified);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const calls = fetchImpl.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(calls.map((payload) => payload.stage)).toEqual([
      "interpret",
      "compose",
      "verify",
    ]);
    expect(calls[1].artifact).toEqual(interpreted);
    expect(calls[2].artifact).toEqual(composed);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe(
        "http://python-worker:8000/internal/slide-redesign/stage",
      );
      expect(init?.method).toBe("POST");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("rejects a response artifact for the wrong stage", async () => {
    const client = new SlideRedesignPythonClient(
      "http://python-worker:8000",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ stage: "verify", outcome: "fallback-allowed" }),
        ),
    );

    await expect(client.interpret(workerRequest())).rejects.toMatchObject({
      name: "SlideRedesignStageClientError",
      code: "SLIDE_REDESIGN_STAGE_RESPONSE_INVALID",
      message: "Slide redesign stage returned an invalid response.",
    });
  });

  it("bounds upstream error details without including the request body", async () => {
    const longDetail = `provider unavailable ${"x".repeat(700)}`;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ detail: longDetail }, 503));
    const client = new SlideRedesignPythonClient(
      "http://python-worker:8000",
      fetchImpl,
    );
    const request = workerRequest("SECRET_PROMPT");

    let failure: unknown;
    try {
      await client.interpret(request);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(SlideRedesignStageClientError);
    expect(failure).toMatchObject({ code: "SLIDE_REDESIGN_STAGE_FAILED" });
    expect((failure as Error).message.length).toBeLessThan(560);
    expect((failure as Error).message).not.toContain("SECRET_PROMPT");
  });
});

function workerRequest(
  question = "Redesign this slide",
): DesignAgentWorkerRequest {
  const deck = createDemoDeck();
  return designAgentWorkerRequestSchema.parse({
    projectId: deck.projectId,
    sessionId: "session-1",
    question,
    intentPreset: "redesign-slide",
    context: {
      deckId: deck.deckId,
      baseVersion: deck.version,
      canvas: deck.canvas,
      slide: deck.slides[0]!,
      selectedElementIds: [],
      theme: deck.theme,
    },
    capabilities: designAgentCapabilities,
    selectedPaletteOption: paletteOption(),
  });
}

function interpretArtifact() {
  return {
    stage: "interpret" as const,
    outcome: "applicable" as const,
    slideTypeSource: "heuristic" as const,
    summary: {
      title: "Sample",
      message: "Sample",
      contentItems: [],
      slideType: "title" as const,
      visualIntent: {},
      mediaIntent: { alt: "" },
    },
    provenance: {},
    constraints: {
      referencedElementIds: [],
      lockedElementIds: [],
      groupedElementIds: [],
      ooxmlElementIds: [],
    },
  };
}

function composeArtifact(slideId: string) {
  return {
    stage: "compose" as const,
    outcome: "applicable" as const,
    response: {
      message: "Redesign ready",
      interpretedIntent: {
        target: "current-slide" as const,
        action: "redesign-slide",
        alignment: null,
      },
      operations: [
        {
          type: "update_slide_style" as const,
          slideId,
          style: { backgroundColor: "#F8FAFC" },
        },
      ],
      affectedElementIds: [],
      warnings: [],
      smartArtRequest: null,
      uiAction: null,
    },
    candidateCount: 2,
    safeCandidateCount: 1,
    chosenCompositionId: "title-statement",
    irreversibleCount: 0,
    ornamentApplied: true,
  };
}

function paletteOption() {
  return {
    optionId: "calm-blue",
    name: "Calm blue",
    isCurrentTheme: false,
    palette: {
      dominant: "#EFF6FF",
      surface: "#FFFFFF",
      text: "#172554",
      focal: "#2563EB",
      secondary: "#0F766E",
    },
    rationale: "Use a restrained blue palette.",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
