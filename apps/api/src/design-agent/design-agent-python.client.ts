import { loadOrbitConfig } from "@orbit/config";
import {
  designAgentWorkerRequestSchema,
  designAgentWorkerResponseSchema,
  type DesignAgentWorkerRequest,
  type DesignAgentWorkerResponse,
} from "@orbit/shared";
import {
  BadGatewayException,
  HttpException,
  Injectable,
} from "@nestjs/common";

export type MotionPlannerErrorCode =
  | "MOTION_AI_PROVIDER_UNAVAILABLE"
  | "MOTION_AI_EMPTY_RESPONSE"
  | "MOTION_AI_INVALID_PLAN"
  | "MOTION_AI_COMPILE_UNSAFE";

const MOTION_PLANNER_ERROR_CODES = new Set<MotionPlannerErrorCode>([
  "MOTION_AI_PROVIDER_UNAVAILABLE",
  "MOTION_AI_EMPTY_RESPONSE",
  "MOTION_AI_INVALID_PLAN",
  "MOTION_AI_COMPILE_UNSAFE",
]);

export class DesignAgentPythonError extends HttpException {
  constructor(
    readonly code: MotionPlannerErrorCode,
    message: string,
  ) {
    const status = code === "MOTION_AI_COMPILE_UNSAFE" ? 422 : 503;
    super(
      {
        statusCode: status,
        error: "Design Agent Motion Planner Error",
        code,
        message,
      },
      status,
    );
  }
}

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
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (input.intentPreset === "recommend-animation") {
        throw new DesignAgentPythonError(
          "MOTION_AI_PROVIDER_UNAVAILABLE",
          "AI 모션 분석 서비스에 연결할 수 없습니다.",
        );
      }
      throw new BadGatewayException(
        error instanceof Error
          ? `Python design agent is unavailable: ${error.message}`
          : "Python design agent is unavailable.",
      );
    }

    if (!response.ok) {
      const detail = await readWorkerErrorDetail(response);
      if (detail && typeof detail !== "string") {
        throw new DesignAgentPythonError(detail.code, detail.message);
      }
      if (input.intentPreset === "recommend-animation") {
        throw new DesignAgentPythonError(
          response.status === 422
            ? "MOTION_AI_COMPILE_UNSAFE"
            : "MOTION_AI_PROVIDER_UNAVAILABLE",
          typeof detail === "string"
            ? detail
            : "AI 모션 분석 요청을 처리하지 못했습니다.",
        );
      }
      throw new BadGatewayException(
        detail
          ? `Python design agent failed: ${detail}`
          : `Python design agent failed with status ${response.status}.`,
      );
    }

    try {
      return designAgentWorkerResponseSchema.parse(await response.json());
    } catch {
      if (input.intentPreset === "recommend-animation") {
        throw new DesignAgentPythonError(
          "MOTION_AI_INVALID_PLAN",
          "AI 모션 분석 결과가 올바르지 않습니다.",
        );
      }
      throw new BadGatewayException("Python design agent returned an invalid response.");
    }
  }
}

async function readWorkerErrorDetail(
  response: Response,
): Promise<
  string | { code: MotionPlannerErrorCode; message: string } | null
> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail.trim().slice(0, 500);
    }
    if (
      typeof payload.detail === "object" &&
      payload.detail !== null &&
      "code" in payload.detail &&
      "message" in payload.detail &&
      typeof payload.detail.code === "string" &&
      MOTION_PLANNER_ERROR_CODES.has(
        payload.detail.code as MotionPlannerErrorCode,
      ) &&
      typeof payload.detail.message === "string" &&
      payload.detail.message.trim()
    ) {
      return {
        code: payload.detail.code as MotionPlannerErrorCode,
        message: payload.detail.message.trim().slice(0, 500),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}
