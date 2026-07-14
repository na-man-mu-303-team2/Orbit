import { loadOrbitConfig } from "@orbit/config";
import {
  designAgentWorkerRequestSchema,
  designAgentWorkerResponseSchema,
  type DesignAgentWorkerRequest,
  type DesignAgentWorkerResponse,
} from "@orbit/shared";
import { BadGatewayException, Injectable } from "@nestjs/common";

@Injectable()
export class DesignAgentPythonClient {
  private readonly pythonWorkerUrl = loadOrbitConfig(process.env, {
    service: "api",
  }).PYTHON_WORKER_URL;

  async propose(input: DesignAgentWorkerRequest): Promise<DesignAgentWorkerResponse> {
    const payload = designAgentWorkerRequestSchema.parse(input);
    let response: Response;

    try {
      response = await fetch(workerUrl(this.pythonWorkerUrl, "/ai/design-agent/propose"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error
          ? `Python design agent is unavailable: ${error.message}`
          : "Python design agent is unavailable.",
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Python design agent failed with status ${response.status}.`,
      );
    }

    try {
      return designAgentWorkerResponseSchema.parse(await response.json());
    } catch {
      throw new BadGatewayException("Python design agent returned an invalid response.");
    }
  }
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}
