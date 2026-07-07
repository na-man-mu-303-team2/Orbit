import { ArrowLeft, FileText, Loader2, Mic, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { Project, RehearsalProjectSummary, RehearsalRun } from "@orbit/shared";
import {
  fetchReportProjects,
  fetchProjectRehearsalReportRuns,
  fetchProjectRehearsalSummary,
} from "./reportApi";
import { RehearsalRunNav } from "./RehearsalRunNav";
import { DurationLineChart, SlideAvgBarChart } from "./ReportProgressCharts";
import {
  navigateTo,
  formatRunDate,
  sortRehearsalRunsByCreatedAt,
} from "./rehearsalUtils";

export function RehearsalProjectOverviewPage({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<RehearsalRun[]>([]);
  const [summary, setSummary] = useState<RehearsalProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setProject(null);
    setRuns([]);
    setSummary(null);
    setLoading(true);

    void Promise.all([
      fetchReportProjects(),
      fetchProjectRehearsalReportRuns(projectId),
      fetchProjectRehearsalSummary(projectId),
    ])
      .then(([projects, { runs: succeededRuns }, projectSummary]) => {
        if (!isMounted) return;
        setProject(projects.find((p) => p.projectId === projectId) ?? null);
        setRuns(sortRehearsalRunsByCreatedAt(succeededRuns));
        setSummary(projectSummary);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setProject(null);
        setRuns([]);
        setSummary(null);
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const latestRun = runs[runs.length - 1] ?? null;
  const showSummary = runs.length >= 2;

  const durationSeries = (summary?.runDurationSeries ?? []).map((p, i) => ({
    label: `${i + 1}회차`,
    seconds: p.durationSeconds,
  }));

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
        <RehearsalRunNav runs={runs} projectId={projectId} loading={loading} />

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
                  <strong className="report-stat-value">{runs.length}건</strong>
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
                  <strong className="report-date-value report-date-empty">—</strong>
                </div>
              </div>

              {showSummary && (
                <div className="report-project-summary-section">
                  <header className="report-project-summary-header">
                    <TrendingUp size={18} />
                    <h2>종합 요약 리포트</h2>
                    <span className="report-project-summary-count">
                      {runs.length}회차 기반
                    </span>
                  </header>

                  {summary?.progressComment && (
                    <p className="report-project-progress-comment">
                      {summary.progressComment}
                    </p>
                  )}

                  {durationSeries.length >= 2 && (
                    <div className="report-project-chart-block">
                      <span className="report-project-chart-label">
                        회차별 총 소요시간 (초)
                      </span>
                      <DurationLineChart series={durationSeries} />
                    </div>
                  )}

                  {(summary?.slideAvgTimings?.length ?? 0) > 0 && (
                    <div className="report-project-chart-block">
                      <span className="report-project-chart-label">
                        슬라이드별 평균 소요시간 (초)
                      </span>
                      <SlideAvgBarChart timings={summary!.slideAvgTimings} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
