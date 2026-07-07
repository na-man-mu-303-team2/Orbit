import type { RehearsalRun } from "@orbit/shared";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchProjectRehearsalReportRuns(
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<{ runs: RehearsalRun[]; total: number }> {
  const params = new URLSearchParams({ status: "succeeded", pageSize: "100" });
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsals?${params.toString()}`,
    { credentials: "include" },
  );
  if (!response.ok) return { runs: [], total: 0 };
  const data = (await response.json()) as { runs: RehearsalRun[]; total: number };
  return { runs: data.runs ?? [], total: data.total ?? 0 };
}
