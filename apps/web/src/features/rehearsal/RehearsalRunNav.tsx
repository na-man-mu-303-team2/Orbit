import { CalendarDays, Loader2 } from "lucide-react";
import type { RehearsalRun } from "@orbit/shared";
import { getRehearsalReportPath } from "./RehearsalWorkspace";
import {
  navigateTo,
  formatRunDate,
  sortRehearsalRunsByCreatedAt,
} from "./rehearsalUtils";

type RehearsalRunNavProps = {
  runs: RehearsalRun[];
  activeRunId?: string;
  projectId: string;
  loading?: boolean;
};

export function RehearsalRunNav({
  runs,
  activeRunId,
  projectId,
  loading,
}: RehearsalRunNavProps) {
  const orderedRuns = sortRehearsalRunsByCreatedAt(runs);
  const activeRunIndex = orderedRuns.findIndex(
    (run) => run.runId === activeRunId,
  );
  const activeRun = activeRunIndex >= 0 ? orderedRuns[activeRunIndex] : null;

  return (
    <aside className="rehearsal-report-nav" aria-label="회차별 리포트">
      {loading ? (
        <div className="report-overview-nav-loading">
          <Loader2 size={16} />
        </div>
      ) : (
        <>
          <header className="rehearsal-report-nav-head">
            <h2>전체 리포트 기록</h2>
            <span>{runs.length}회</span>
          </header>
          {activeRun ? (
            <div className="rehearsal-report-nav-current">
              <span>현재 보고 있는 리포트</span>
              <strong>리허설 {activeRunIndex + 1}회차</strong>
              <small>{formatRunDate(activeRun.createdAt)}</small>
            </div>
          ) : null}

          <details className="rehearsal-report-nav-history">
            <summary>다른 회차 보기</summary>
            <ul className="rehearsal-report-nav-list">
              {orderedRuns.map((run, i) => (
                <li key={run.runId}>
                  <button
                    type="button"
                    className={`rehearsal-report-nav-item${run.runId === activeRunId ? " active" : ""}`}
                    onClick={() =>
                      navigateTo(getRehearsalReportPath(projectId, run.runId))
                    }
                  >
                    <strong>
                      <CalendarDays size={15} />
                      리허설 {i + 1}회차
                    </strong>
                    <span>{formatRunDate(run.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <header className="rehearsal-report-nav-head rehearsal-report-nav-head-disabled">
            <h2>실전</h2>
          </header>
          <ul className="rehearsal-report-nav-list rehearsal-report-nav-list-disabled">
            <li>
              <div className="rehearsal-report-nav-empty">
                아직 실전 리포트가 없습니다
              </div>
            </li>
          </ul>
        </>
      )}
    </aside>
  );
}
