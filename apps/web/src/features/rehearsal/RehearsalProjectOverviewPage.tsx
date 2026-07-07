import { ArrowLeft, FileText, Loader2, Mic, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { Project, RehearsalRun } from "@orbit/shared";
import { fetchProjects } from "../projects/ProjectAssetWorkspace";
import { fetchProjectRehearsalRuns } from "./RehearsalWorkspace";
import { RehearsalRunNav } from "./RehearsalRunNav";
import { navigateTo, formatRunDate } from "./rehearsalUtils";

export function RehearsalProjectOverviewPage({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<RehearsalRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void Promise.all([
      fetchProjects(),
      fetchProjectRehearsalRuns(projectId),
    ])
      .then(([projects, allRuns]) => {
        if (!isMounted) return;
        const proj =
          projects.find((p) => p.projectId === projectId) ?? null;
        const succeeded = allRuns
          .filter((r) => r.status === "succeeded")
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setProject(proj);
        setRuns(succeeded);
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const latestRun = runs[0] ?? null;
  const showSummary = runs.length >= 2;

  return (
    <main className="rehearsal-report-page">
      <header className="rehearsal-report-topbar">
        <div className="rehearsal-report-topbar-left">
          <button
            type="button"
            className="rehearsal-report-back-button"
            onClick={() => navigateTo("/reports")}
            aria-label="리포트 목록으로"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="report-project-title">
            {project?.title ?? "리포트"}
          </span>
        </div>
        <div className="rehearsal-report-topbar-actions">
          <button
            type="button"
            className="report-rehearsal-button"
            onClick={() =>
              navigateTo(`/rehearsal/${encodeURIComponent(projectId)}`)
            }
          >
            <Mic size={16} />
            리허설 시작
          </button>
        </div>
      </header>

      <div className="rehearsal-report-body">
        <RehearsalRunNav
          runs={runs}
          projectId={projectId}
          loading={loading}
        />

        <section className="report-overview-panel">
          {loading ? (
            <div className="report-overview-loading">
              <Loader2 size={22} />
              <span>불러오는 중</span>
            </div>
          ) : (
            <>
              <div className="report-overview-stats">
                <div className="report-stat-card">
                  <FileText size={22} className="report-stat-icon" />
                  <span className="report-stat-label">리허설 리포트</span>
                  <strong className="report-stat-value">
                    {runs.length}건
                  </strong>
                </div>
                <div className="report-stat-card report-stat-card-disabled">
                  <FileText size={22} className="report-stat-icon" />
                  <span className="report-stat-label">실전 리포트</span>
                  <strong className="report-stat-value">0건</strong>
                </div>
              </div>

              <div className="report-overview-dates">
                <div className="report-date-row">
                  <span className="report-date-label">최신 리허설</span>
                  <strong className="report-date-value">
                    {latestRun ? formatRunDate(latestRun.createdAt) : "—"}
                  </strong>
                </div>
                <div className="report-date-row">
                  <span className="report-date-label">최신 발표</span>
                  <strong className="report-date-value report-date-empty">
                    —
                  </strong>
                </div>
              </div>

              {showSummary && (
                <div className="report-summary-section">
                  <header className="report-summary-header">
                    <TrendingUp size={18} />
                    <h2>종합 요약 리포트</h2>
                    <span className="report-summary-count">
                      {runs.length}회차 기반
                    </span>
                  </header>
                  <div className="report-summary-cards">
                    <div className="report-summary-card">
                      <span className="report-summary-card-label">
                        평균 발표 시간
                      </span>
                      <strong className="report-summary-card-value">—</strong>
                      <span className="report-summary-card-sub">준비 중</span>
                    </div>
                    <div className="report-summary-card">
                      <span className="report-summary-card-label">
                        평균 말하기 속도
                      </span>
                      <strong className="report-summary-card-value">—</strong>
                      <span className="report-summary-card-sub">준비 중</span>
                    </div>
                    <div className="report-summary-card">
                      <span className="report-summary-card-label">
                        회차별 개선도
                      </span>
                      <strong className="report-summary-card-value">—</strong>
                      <span className="report-summary-card-sub">준비 중</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
