import {
  storyPlanApproveRequestSchema,
  storyPlanReviewResponseSchema,
  type StoryPlanApproveRequest,
} from "@orbit/shared";

type StoryApprovalDraft = Pick<
  StoryPlanApproveRequest,
  "expectedRevision" | "slides"
>;

export function storyPlanPath(projectId: string, jobId: string) {
  return `/project/${encodeURIComponent(projectId)}/story-plan/${encodeURIComponent(jobId)}`;
}

export function storyStyleColorPath(projectId: string, jobId: string) {
  return `/project/${encodeURIComponent(projectId)}/style-color/${encodeURIComponent(jobId)}`;
}

export function storyGenerationPath(projectId: string, jobId: string) {
  return `/project/${encodeURIComponent(projectId)}/generation/${encodeURIComponent(jobId)}`;
}

function storyApprovalDraftKey(projectId: string, jobId: string) {
  return `orbit:story-approval:${projectId}:${jobId}`;
}

export function saveStoryApprovalDraft(
  projectId: string,
  jobId: string,
  draft: StoryApprovalDraft,
) {
  const parsed = storyPlanApproveRequestSchema.parse(draft);
  if (!parsed.slides) throw new Error("Story approval slides are required.");
  try {
    sessionStorage.setItem(
      storyApprovalDraftKey(projectId, jobId),
      JSON.stringify({
        expectedRevision: parsed.expectedRevision,
        slides: parsed.slides,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readStoryApprovalDraft(projectId: string, jobId: string) {
  try {
    const value = sessionStorage.getItem(
      storyApprovalDraftKey(projectId, jobId),
    );
    if (!value) return null;
    const parsed = storyPlanApproveRequestSchema.safeParse(JSON.parse(value));
    return parsed.success && parsed.data.slides
      ? {
          expectedRevision: parsed.data.expectedRevision,
          slides: parsed.data.slides,
        }
      : null;
  } catch {
    return null;
  }
}

export function clearStoryApprovalDraft(projectId: string, jobId: string) {
  try {
    sessionStorage.removeItem(storyApprovalDraftKey(projectId, jobId));
  } catch {
    // Storage availability must not interrupt approval or editor handoff.
  }
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
