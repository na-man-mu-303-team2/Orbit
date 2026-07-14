import { demoIds, rehearsalRunComparisonSchema } from "@orbit/shared";
import type {
  Project,
  RehearsalProjectSummary,
  RehearsalRun,
  RehearsalRunComparison,
} from "@orbit/shared";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchReportProjects(
  fetcher: Fetcher = fetch,
): Promise<Project[]> {
  const response = await fetcher(
    `/api/v1/workspaces/${demoIds.workspaceId}/projects`,
    { credentials: "include" },
  );
  if (!response.ok) return [];
  return (await response.json()) as Project[];
}

export async function fetchProjectRehearsalSummary(
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<RehearsalProjectSummary | null> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsal-summary`,
    { credentials: "include" },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { summary: RehearsalProjectSummary | null };
  return data.summary ?? null;
}

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

export async function fetchRehearsalRunComparison(
  projectId: string,
  runId: string,
  fetcher: Fetcher = fetch,
): Promise<RehearsalRunComparison | null> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsals/${encodeURIComponent(runId)}/comparison`,
    { credentials: "include" },
  );
  if (!response.ok) return null;

  try {
    const result = rehearsalRunComparisonSchema.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
