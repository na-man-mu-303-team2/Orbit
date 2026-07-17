import { describe, expect, it, vi } from "vitest";

import {
  AiDeckPlanningStageError,
  executeAiDeckPlanningStage,
} from "./planning-stage-python-client";

const sourcePayload = {
  rawInput: {
    topic: "Safe topic",
    warningCodes: ["WEB_RESEARCH_QUALITY_FAILED"],
  },
  sourceRecords: [],
  warnings: ["Web research quality was insufficient; usable input was kept."],
  webSourceCount: 0,
};

describe("executeAiDeckPlanningStage", () => {
  it("calls the internal stage endpoint and accepts degraded research output", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) =>
      jsonResponse(sourcePayload),
    );

    await expect(
      executeAiDeckPlanningStage(
        "http://python-worker:8000",
        "source-grounding",
        { request: { projectId: "project-a", topic: "Safe topic" } },
        { fetchImpl },
      ),
    ).resolves.toEqual(sourcePayload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://python-worker:8000/internal/ai/deck-generation/source-grounding",
    );
  });

  it.each([
    [
      "SOURCE_GROUNDING_REQUIRED: usable grounding is required.",
      "SOURCE_GROUNDING_REQUIRED",
    ],
    [
      "Art Director could not create a valid design plan. Please retry deck generation.",
      "ART_DIRECTOR_INVALID_RESPONSE",
    ],
  ])("keeps terminal policy errors non-retryable: %s", async (detail, code) => {
    const error = await executeAiDeckPlanningStage(
      "http://python-worker:8000",
      code === "SOURCE_GROUNDING_REQUIRED"
        ? "source-grounding"
        : "design-planning",
      {},
      { fetchImpl: async () => jsonResponse({ detail }, 503) },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiDeckPlanningStageError);
    expect(error).toMatchObject({ code, retryable: false });
  });

  it("classifies provider unavailability as retryable without exposing detail", async () => {
    const providerBodySentinel = "secret-provider-response-body";
    const error = await executeAiDeckPlanningStage(
      "http://python-worker:8000",
      "content-planning",
      {},
      {
        fetchImpl: async () =>
          jsonResponse(
            {
              detail: `LLM deck content generation failed: ${providerBodySentinel}`,
            },
            503,
          ),
      },
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "PYTHON_WORKER_PLANNING_FAILED",
      message: "AI deck planning provider failed.",
      retryable: true,
      diagnostics: {
        reasonCode: "CONTENT_LLM_PROVIDER_FAILURE",
        httpStatus: 503,
      },
    });
    if (!(error instanceof Error)) throw new Error("Expected planning error");
    expect(error.message).not.toContain(providerBodySentinel);
    expect(JSON.stringify(error)).not.toContain(providerBodySentinel);
  });

  it.each([
    ["CONTENT_LLM_EMPTY_RESPONSE", false],
    ["CONTENT_LLM_INVALID_RESPONSE", false],
    ["CONTENT_LLM_SLIDE_COUNT_REPAIR_FAILED", false],
    ["CONTENT_LLM_PROVIDER_FAILURE", true],
  ] as const)(
    "accepts structured planning reason %s without changing the public error",
    async (reasonCode, retryable) => {
      const error = await executeAiDeckPlanningStage(
        "http://python-worker:8000",
        "content-planning",
        {},
        {
          fetchImpl: async () =>
            jsonResponse(
              {
                detail: {
                  reasonCode,
                  provider: "openai",
                  providerHttpStatus: retryable ? 429 : 400,
                  providerRequestId: "request-safe-1",
                },
              },
              retryable ? 503 : 400,
            ),
        },
      ).catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        code: "PYTHON_WORKER_PLANNING_FAILED",
        message: "AI deck planning provider failed.",
        retryable,
        diagnostics: {
          reasonCode,
          provider: "openai",
          providerHttpStatus: retryable ? 429 : 400,
          providerRequestId: "request-safe-1",
        },
      });
    },
  );

  it("classifies legacy content-plan invariant failures without logging detail", async () => {
    const detail =
      "LLM content plan referenced unavailable source IDs: private-source-sentinel";
    const error = await executeAiDeckPlanningStage(
      "http://python-worker:8000",
      "content-planning",
      {},
      { fetchImpl: async () => jsonResponse({ detail }, 503) },
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      diagnostics: {
        reasonCode: "CONTENT_LLM_INVALID_RESPONSE",
        httpStatus: 503,
      },
    });
    expect(JSON.stringify(error)).not.toContain("private-source-sentinel");
  });

  it("rejects an invalid successful response as a terminal contract failure", async () => {
    const error = await executeAiDeckPlanningStage(
      "http://python-worker:8000",
      "source-grounding",
      {},
      { fetchImpl: async () => jsonResponse({ rawInput: {} }) },
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "PYTHON_WORKER_STAGE_RESPONSE_INVALID",
      retryable: false,
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
