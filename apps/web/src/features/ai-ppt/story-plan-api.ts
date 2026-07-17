import { storyPlanReviewResponseSchema } from "@orbit/shared";

export function storyPlanPath(projectId: string, jobId: string) {
  return `/project/${encodeURIComponent(projectId)}/story-plan/${encodeURIComponent(jobId)}`;
}

export function storyStyleColorPath(projectId: string, jobId: string) {
  return `/project/${encodeURIComponent(projectId)}/style-color/${encodeURIComponent(jobId)}`;
}

export async function requestStoryPlan(projectId: string, jobId: string) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/story-plan`,
    { credentials: "include" },
  );
  return parseStoryResponse(response);
}

export async function requestStoryPlanMutation(
  projectId: string,
  jobId: string,
  action: "approve" | "cancel" | "edit" | "regenerate",
  body?: Record<string, unknown>,
) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/story-plan/${action}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  return parseStoryResponse(response);
}

async function parseStoryResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }
  return storyPlanReviewResponseSchema.parse(payload);
}
