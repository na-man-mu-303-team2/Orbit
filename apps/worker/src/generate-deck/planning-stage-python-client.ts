import type { GenerateDeckRequest } from "@orbit/shared";
import { z } from "zod";

import {
  contentPlanningArtifactPayloadSchema,
  designPlanningArtifactPayloadSchema,
  layoutCompileArtifactPayloadSchema,
  sourceGroundingArtifactPayloadSchema,
  type AiDeckPlanningArtifactPayload,
  type AiDeckPlanningStage,
  type ContentPlanningArtifactPayload,
  type DesignPlanningArtifactPayload,
  type SourceGroundingArtifactPayload,
} from "./planning-stage-contract";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const endpointByStage: Record<AiDeckPlanningStage, string> = {
  "source-grounding": "/internal/ai/deck-generation/source-grounding",
  "content-planning": "/internal/ai/deck-generation/content-planning",
  "design-planning": "/internal/ai/deck-generation/design-planning",
  "layout-compile": "/internal/ai/deck-generation/layout-compile",
};

const responseSchemaByStage = {
  "source-grounding": sourceGroundingArtifactPayloadSchema,
  "content-planning": contentPlanningArtifactPayloadSchema,
  "design-planning": designPlanningArtifactPayloadSchema,
  "layout-compile": layoutCompileArtifactPayloadSchema,
} as const;

const errorResponseSchema = z.object({ detail: z.string() }).passthrough();

export interface AiDeckPlanningStagePythonClientOptions {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

export class AiDeckPlanningStageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiDeckPlanningStageError";
  }
}

export async function executeAiDeckPlanningStage(
  pythonWorkerUrl: string,
  stage: AiDeckPlanningStage,
  input: unknown,
  options: AiDeckPlanningStagePythonClientOptions = {},
): Promise<AiDeckPlanningArtifactPayload> {
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      new URL(endpointByStage[stage], pythonWorkerUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: options.signal ?? AbortSignal.timeout(180_000),
      },
    );
  } catch {
    throw new AiDeckPlanningStageError(
      "PYTHON_WORKER_UNAVAILABLE",
      "AI deck planning provider is temporarily unavailable.",
      true,
    );
  }

  const rawBody = await readJson(response);
  if (!response.ok) {
    throw normalizeHttpError(response.status, rawBody);
  }
  const parsed = responseSchemaByStage[stage].safeParse(rawBody);
  if (!parsed.success) {
    throw new AiDeckPlanningStageError(
      "PYTHON_WORKER_STAGE_RESPONSE_INVALID",
      "AI deck planning returned an invalid stage response.",
      false,
    );
  }
  return parsed.data;
}

export function sourceGroundingStageInput(
  projectId: string,
  request: GenerateDeckRequest,
  savedDesignPreferences: Record<string, unknown> = {},
) {
  return {
    request: {
      projectId,
      ...request,
      designProgramContext: { savedDesignPreferences },
    },
  };
}

export function contentPlanningStageInput(
  grounding: SourceGroundingArtifactPayload,
) {
  return { groundingResult: grounding };
}

export function designPlanningStageInput(
  content: ContentPlanningArtifactPayload,
) {
  return { rawInput: content.rawInput, contentPlan: content.contentPlan };
}

export function layoutCompileStageInput(
  content: ContentPlanningArtifactPayload,
  design: DesignPlanningArtifactPayload,
  sourceWarnings: string[],
) {
  return {
    rawInput: content.rawInput,
    contentPlan: content.contentPlan,
    designPlan: design.designPlan,
    sourceWarnings,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeHttpError(
  status: number,
  body: unknown,
): AiDeckPlanningStageError {
  const detail = errorResponseSchema.safeParse(body).data?.detail ?? "";
  if (detail.includes("SOURCE_GROUNDING_REQUIRED")) {
    return new AiDeckPlanningStageError(
      "SOURCE_GROUNDING_REQUIRED",
      "The selected reference policy requires usable grounding.",
      false,
    );
  }
  if (detail.includes("Art Director could not create a valid design plan")) {
    return new AiDeckPlanningStageError(
      "ART_DIRECTOR_INVALID_RESPONSE",
      "Art Director could not create a valid design plan.",
      false,
    );
  }
  if (detail.includes("Art Director model is unavailable")) {
    return new AiDeckPlanningStageError(
      "ART_DIRECTOR_UNAVAILABLE",
      "Art Director is temporarily unavailable.",
      true,
    );
  }
  if (status === 422) {
    return new AiDeckPlanningStageError(
      "PYTHON_WORKER_STAGE_REQUEST_INVALID",
      "AI deck planning stage request is invalid.",
      false,
    );
  }
  return new AiDeckPlanningStageError(
    "PYTHON_WORKER_PLANNING_FAILED",
    "AI deck planning provider failed.",
    status === 429 || status >= 500,
  );
}
