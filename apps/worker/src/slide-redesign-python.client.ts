import {
  designAgentWorkerRequestSchema,
  slideRedesignComposeArtifactSchema,
  slideRedesignInterpretArtifactSchema,
  slideRedesignVerifyArtifactSchema,
  type DesignAgentWorkerRequest,
  type SlideRedesignComposeArtifact,
  type SlideRedesignInterpretArtifact,
  type SlideRedesignVerifyArtifact,
} from "@orbit/shared";
import type { z } from "zod";

const slideRedesignStagePath = "/internal/slide-redesign/stage";
const slideRedesignStageTimeoutMs = 60_000;

export interface SlideRedesignStageClient {
  interpret(
    request: DesignAgentWorkerRequest,
  ): Promise<SlideRedesignInterpretArtifact>;
  compose(
    request: DesignAgentWorkerRequest,
    artifact: SlideRedesignInterpretArtifact,
  ): Promise<SlideRedesignComposeArtifact>;
  verify(
    request: DesignAgentWorkerRequest,
    artifact: SlideRedesignComposeArtifact,
  ): Promise<SlideRedesignVerifyArtifact>;
}

export class SlideRedesignPythonClient implements SlideRedesignStageClient {
  constructor(
    private readonly pythonWorkerUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  interpret(
    request: DesignAgentWorkerRequest,
  ): Promise<SlideRedesignInterpretArtifact> {
    return this.execute(
      {
        stage: "interpret",
        request: designAgentWorkerRequestSchema.parse(request),
      },
      slideRedesignInterpretArtifactSchema,
    );
  }

  compose(
    request: DesignAgentWorkerRequest,
    artifact: SlideRedesignInterpretArtifact,
  ): Promise<SlideRedesignComposeArtifact> {
    return this.execute(
      {
        stage: "compose",
        request: designAgentWorkerRequestSchema.parse(request),
        artifact: slideRedesignInterpretArtifactSchema.parse(artifact),
      },
      slideRedesignComposeArtifactSchema,
    );
  }

  verify(
    request: DesignAgentWorkerRequest,
    artifact: SlideRedesignComposeArtifact,
  ): Promise<SlideRedesignVerifyArtifact> {
    return this.execute(
      {
        stage: "verify",
        request: designAgentWorkerRequestSchema.parse(request),
        artifact: slideRedesignComposeArtifactSchema.parse(artifact),
      },
      slideRedesignVerifyArtifactSchema,
    );
  }

  private async execute<TSchema extends z.ZodTypeAny>(
    payload: Record<string, unknown>,
    responseSchema: TSchema,
  ): Promise<z.output<TSchema>> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        workerUrl(this.pythonWorkerUrl, slideRedesignStagePath),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(slideRedesignStageTimeoutMs),
        },
      );
    } catch (error) {
      throw new SlideRedesignStageClientError(
        "SLIDE_REDESIGN_STAGE_UNAVAILABLE",
        error instanceof Error
          ? `Slide redesign stage service is unavailable: ${error.message}`
          : "Slide redesign stage service is unavailable.",
      );
    }

    if (!response.ok) {
      const detail = await readWorkerErrorDetail(response);
      throw new SlideRedesignStageClientError(
        "SLIDE_REDESIGN_STAGE_FAILED",
        detail
          ? `Slide redesign stage failed: ${detail}`
          : `Slide redesign stage failed with status ${response.status}.`,
      );
    }

    try {
      return responseSchema.parse(await response.json());
    } catch {
      throw new SlideRedesignStageClientError(
        "SLIDE_REDESIGN_STAGE_RESPONSE_INVALID",
        "Slide redesign stage returned an invalid response.",
      );
    }
  }
}

export class SlideRedesignStageClientError extends Error {
  constructor(
    readonly code:
      | "SLIDE_REDESIGN_STAGE_UNAVAILABLE"
      | "SLIDE_REDESIGN_STAGE_FAILED"
      | "SLIDE_REDESIGN_STAGE_RESPONSE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "SlideRedesignStageClientError";
  }
}

async function readWorkerErrorDetail(
  response: Response,
): Promise<string | null> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    return typeof payload.detail === "string" && payload.detail.trim()
      ? payload.detail.trim().slice(0, 500)
      : null;
  } catch {
    return null;
  }
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}
