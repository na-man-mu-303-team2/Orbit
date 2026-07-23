import {
  applyDesignAgentProposalResponseSchema,
  createDesignAgentMessageResponseSchema,
  createDesignImageGenerationResponseSchema,
  createSlideRedesignJobResponseSchema,
  designImageGenerationResultSchema,
  jobSchema,
  slideRedesignJobResultSchema,
  slideRedesignProgressEventSchema,
  type ApplyDesignAgentProposalResponse,
  type CreateDesignAgentMessageRequest,
  type CreateDesignAgentMessageResponse,
  type CreateDesignImageGenerationRequest,
  type CreateDesignImageGenerationResponse,
  type CreateSlideRedesignJobRequest,
  type CreateSlideRedesignJobResponse,
  type DesignImageGenerationResult,
  type Job,
  type SlideRedesignJobResult,
  type SlideRedesignProgressPayload,
} from "@orbit/shared";
import { io } from "socket.io-client";

export type DesignAgentMotionErrorCode =
  | "MOTION_AI_PROVIDER_UNAVAILABLE"
  | "MOTION_AI_EMPTY_RESPONSE"
  | "MOTION_AI_INVALID_PLAN"
  | "MOTION_AI_COMPILE_UNSAFE";

const DESIGN_AGENT_MOTION_ERROR_MESSAGES: Record<
  DesignAgentMotionErrorCode,
  string
> = {
  MOTION_AI_PROVIDER_UNAVAILABLE:
    "AI 모션 분석 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  MOTION_AI_EMPTY_RESPONSE:
    "AI가 모션 계획을 완성하지 못했습니다. 다시 시도해 주세요.",
  MOTION_AI_INVALID_PLAN:
    "AI 모션 분석 결과를 검증하지 못했습니다. 다시 시도해 주세요.",
  MOTION_AI_COMPILE_UNSAFE:
    "AI 모션 계획이 현재 슬라이드의 안전 기준을 통과하지 못했습니다. 슬라이드를 확인한 뒤 다시 시도해 주세요.",
};

export class DesignAgentApiError extends Error {
  constructor(
    readonly code: DesignAgentMotionErrorCode,
    readonly status: number,
  ) {
    super(DESIGN_AGENT_MOTION_ERROR_MESSAGES[code]);
    this.name = "DesignAgentApiError";
  }
}

export async function createDesignAgentMessage(
  projectId: string,
  input: CreateDesignAgentMessageRequest,
): Promise<CreateDesignAgentMessageResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/design-agent/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const motionErrorCode = parseMotionErrorCode(payload);
    if (motionErrorCode) {
      throw new DesignAgentApiError(motionErrorCode, response.status);
    }
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Design agent request failed: ${response.status}`;
    throw new Error(message);
  }

  return createDesignAgentMessageResponseSchema.parse(await response.json());
}

function parseMotionErrorCode(
  payload: unknown,
): DesignAgentMotionErrorCode | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("code" in payload) ||
    typeof payload.code !== "string"
  ) {
    return null;
  }
  return payload.code in DESIGN_AGENT_MOTION_ERROR_MESSAGES
    ? (payload.code as DesignAgentMotionErrorCode)
    : null;
}

export async function createDesignImageGeneration(
  projectId: string,
  input: CreateDesignImageGenerationRequest,
): Promise<CreateDesignImageGenerationResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/design-agent/image-generations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok)
    throw new Error(
      await readApiError(response, "이미지 생성을 시작하지 못했습니다."),
    );
  return createDesignImageGenerationResponseSchema.parse(await response.json());
}

export async function createSlideRedesignJob(
  projectId: string,
  input: CreateSlideRedesignJobRequest,
): Promise<CreateSlideRedesignJobResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/design-agent/slide-redesign-jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const message = await readApiError(
      response,
      "슬라이드 리디자인을 시작하지 못했습니다.",
    );
    if (response.status === 409) {
      throw new DesignAgentProposalStaleError(message);
    }
    throw new Error(message);
  }
  return createSlideRedesignJobResponseSchema.parse(await response.json());
}

export async function getSlideRedesignJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "슬라이드 리디자인 상태를 확인하지 못했습니다.",
      ),
    );
  }
  const job = jobSchema.parse(await response.json());
  if (job.type !== "slide-redesign") {
    throw new Error("슬라이드 리디자인 작업이 아닌 응답을 받았습니다.");
  }
  return job;
}

export async function pollSlideRedesignJob(
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onJob?: (job: Job) => void;
  } = {},
): Promise<SlideRedesignJobResult> {
  const intervalMs = options.intervalMs ?? 1_200;
  const deadline = Date.now() + (options.timeoutMs ?? 180_000);
  while (Date.now() < deadline) {
    const job = await getSlideRedesignJob(jobId);
    options.onJob?.(job);
    if (job.status === "succeeded") {
      return slideRedesignJobResultSchema.parse(job.result);
    }
    if (job.status === "failed") {
      throw new Error(
        "슬라이드 리디자인을 완료하지 못했습니다. 다시 시도해 주세요.",
      );
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs));
  }
  throw new Error(
    "슬라이드 리디자인 시간이 초과되었습니다. 다시 시도해 주세요.",
  );
}

type SlideRedesignProgressSocket = {
  connected: boolean;
  disconnect: () => void;
  emit: (event: string, payload: unknown) => void;
  off: (event: string, handler: (payload?: unknown) => void) => void;
  on: (event: string, handler: (payload?: unknown) => void) => void;
};

export function connectSlideRedesignProgress(
  input: {
    jobId: string;
    projectId: string;
    sessionId: string;
    onProgress: (progress: SlideRedesignProgressPayload) => void;
    onConnectionError?: () => void;
  },
  createSocket: () => SlideRedesignProgressSocket = () =>
    io({ withCredentials: true }) as SlideRedesignProgressSocket,
) {
  const socket = createSocket();
  const handleConnect = () => {
    socket.emit("project:join", { projectId: input.projectId });
  };
  const handleProgress = (candidate?: unknown) => {
    const event = slideRedesignProgressEventSchema.safeParse(candidate);
    if (
      !event.success ||
      event.data.payload.jobId !== input.jobId ||
      event.data.payload.projectId !== input.projectId ||
      event.data.payload.sessionId !== input.sessionId
    ) {
      return;
    }
    input.onProgress(event.data.payload);
  };
  const handleConnectionError = () => input.onConnectionError?.();

  socket.on("connect", handleConnect);
  socket.on("job-progressed", handleProgress);
  socket.on("connect_error", handleConnectionError);
  socket.on("project:error", handleConnectionError);
  if (socket.connected) handleConnect();

  return {
    disconnect() {
      socket.off("connect", handleConnect);
      socket.off("job-progressed", handleProgress);
      socket.off("connect_error", handleConnectionError);
      socket.off("project:error", handleConnectionError);
      socket.disconnect();
    },
  };
}

export async function pollDesignImageGeneration(
  jobId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<DesignImageGenerationResult> {
  const intervalMs = options.intervalMs ?? 1_200;
  const deadline = Date.now() + (options.timeoutMs ?? 180_000);
  while (Date.now() < deadline) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok)
      throw new Error(
        await readApiError(response, "이미지 생성 상태를 확인하지 못했습니다."),
      );
    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded") {
      return designImageGenerationResultSchema.parse(job.result);
    }
    if (job.status === "failed") {
      throw new Error(toDesignImageError(job.error?.code, job.error?.message));
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs));
  }
  throw new Error("이미지 생성 시간이 초과되었습니다. 다시 시도해 주세요.");
}

function toDesignImageError(code?: string, fallback?: string) {
  if (code === "DESIGN_IMAGE_DAILY_LIMIT_EXCEEDED")
    return "오늘 사용할 수 있는 이미지 생성 횟수를 모두 사용했습니다.";
  if (code === "DESIGN_IMAGE_PROVIDER_UNAVAILABLE")
    return "현재 이미지 생성 기능을 사용할 수 없습니다.";
  if (code === "DESIGN_IMAGE_RESULT_INVALID")
    return "생성된 이미지가 품질 기준을 통과하지 못했습니다. 다시 시도해 주세요.";
  return fallback || "이미지를 생성하지 못했습니다. 다시 시도해 주세요.";
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => undefined);
  return payload && typeof payload === "object" && "message" in payload
    ? String(payload.message)
    : fallback;
}

export async function applyDesignAgentProposal(
  projectId: string,
  proposalId: string,
): Promise<ApplyDesignAgentProposalResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/design-agent/proposals/${encodeURIComponent(proposalId)}/apply`,
    { method: "POST" },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Design agent apply failed: ${response.status}`;
    if (response.status === 409) {
      throw new DesignAgentProposalStaleError(message);
    }
    throw new Error(message);
  }

  return applyDesignAgentProposalResponseSchema.parse(await response.json());
}

export class DesignAgentProposalStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignAgentProposalStaleError";
  }
}

export function isDesignAgentProposalStaleError(
  error: unknown,
): error is DesignAgentProposalStaleError {
  return error instanceof DesignAgentProposalStaleError;
}
