import type { RehearsalRun } from "@orbit/shared";
import { IconCalendar, IconChevronRight } from "@tabler/icons-react";
import { getRehearsalReportPath } from "./RehearsalWorkspace";
import { navigateTo, formatRunDate, sortRehearsalRunsByCreatedAt } from "./rehearsalUtils";

type RehearsalRunNavProps = { activeRunId?: string; loading?: boolean; projectId: string; runs: RehearsalRun[] };

export function RehearsalRunNav({ activeRunId, loading, projectId, runs }: RehearsalRunNavProps) {
  const orderedRuns = sortRehearsalRunsByCreatedAt(runs);
  if (loading) return <div className="orbit-run-list-loading" role="status">회차를 불러오는 중입니다.</div>;
  return (
    <div className="orbit-run-list" aria-label="회차별 리포트">
      {orderedRuns.map((run, index) => (
        <button aria-current={run.runId === activeRunId ? "page" : undefined} className="orbit-run-row" key={run.runId} onClick={() => navigateTo(getRehearsalReportPath(projectId, run.runId))} type="button">
          <span><IconCalendar aria-hidden="true" size={18} /><strong>{index + 1}회차</strong></span>
          <time dateTime={run.createdAt}>{formatRunDate(run.createdAt)}</time>
          <span>상세 리포트 <IconChevronRight aria-hidden="true" size={17} /></span>
        </button>
      ))}
    </div>
  );
}
