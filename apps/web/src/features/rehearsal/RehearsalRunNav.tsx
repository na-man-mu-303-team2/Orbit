import { CalendarDays, Loader2 } from "lucide-react";
import type { RehearsalRun } from "@orbit/shared";
import { getRehearsalReportPath } from "./RehearsalWorkspace";
import { navigateTo, formatRunDate } from "./rehearsalUtils";

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
  return (
    <aside className="rehearsal-report-nav" aria-label="회차별 리포트">
      {loading ? (
        <div className="report-overview-nav-loading">
          <Loader2 size={16} />
        </div>
      ) : (
        <>
          <header className="rehearsal-report-nav-head">
            <h2>리허설</h2>
          </header>
          <ul className="rehearsal-report-nav-list">
            {runs.map((run, i) => (
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
