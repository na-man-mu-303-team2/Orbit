import type { RehearsalRun } from "@orbit/shared";

export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function formatRunDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function sortRehearsalRunsByCreatedAt(runs: RehearsalRun[]) {
  return [...runs].sort((a, b) => {
    const createdAtDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }
    return a.runId.localeCompare(b.runId);
  });
}

export function getRehearsalRunNumber(
  runs: RehearsalRun[],
  runId: string,
): number | null {
  const orderedRuns = sortRehearsalRunsByCreatedAt(runs);
  const index = orderedRuns.findIndex((run) => run.runId === runId);
  return index >= 0 ? index + 1 : null;
}
