import { loadOrbitConfig } from "@orbit/config";
import type {
  ReferenceSearchRequest,
  ReferenceSearchResponse
} from "@orbit/shared";
import {
  referenceSearchResponseSchema,
  referenceSearchWorkerRequestSchema
} from "@orbit/shared";
import { BadGatewayException, Injectable } from "@nestjs/common";

@Injectable()
export class ReferencesService {
  private readonly pythonWorkerUrl = loadOrbitConfig(process.env, {
    service: "api"
  }).PYTHON_WORKER_URL;

  async search(
    projectId: string,
    input: ReferenceSearchRequest
  ): Promise<ReferenceSearchResponse> {
    const payload = referenceSearchWorkerRequestSchema.parse({
      ...input,
      projectId
    });
    const response = await fetch(
      workerUrl(this.pythonWorkerUrl, "/references/search"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new BadGatewayException("Python worker reference search failed.");
    }

    return referenceSearchResponseSchema.parse(await response.json());
  }
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  ).toString();
}
