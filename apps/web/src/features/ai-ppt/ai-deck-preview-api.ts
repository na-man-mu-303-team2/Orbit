import { aiDeckPreviewResponseSchema } from "@orbit/shared";

export async function requestAiDeckPreview(projectId: string, jobId: string) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/deck-preview`,
    { credentials: "include" },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "생성 상태를 불러오지 못했습니다.",
    );
  }
  return aiDeckPreviewResponseSchema.parse(payload);
}

export async function retryAiDeckGeneration(projectId: string, jobId: string) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/retry`,
    { method: "POST", credentials: "include" },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "생성을 다시 시작하지 못했습니다.",
    );
  }
}
