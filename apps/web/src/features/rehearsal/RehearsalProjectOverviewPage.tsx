import {
  ArrowLeft,
  Loader2,
  Mic,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  Deck,
  Project,
  RehearsalProjectSummary,
  RehearsalRun,
  RehearsalRunComparison,
} from "@orbit/shared";
import {
  fetchReportProjects,
  fetchProjectRehearsalReportRuns,
  fetchProjectRehearsalSummary,
  fetchRehearsalRunComparison,
} from "./reportApi";
import { fetchProjectDeck } from "./keywords/keywordEditorApi";
import { RehearsalRunNav } from "./RehearsalRunNav";
import { RehearsalRunComparisonOverview } from "./RehearsalRunComparisonOverview";
import { DurationLineChart, SlideAvgBarChart } from "./ReportProgressCharts";
import { buildRehearsalRunComparisonViewModel } from "./rehearsalRunComparisonModel";
import {
  navigateTo,
  formatRunDate,
  sortRehearsalRunsByCreatedAt,
} from "./rehearsalUtils";
import orbitReportMascot from "../../assets/orbit-report-mascot-transparent.png";

export function RehearsalProjectOverviewPage({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<RehearsalRun[]>([]);
  const [summary, setSummary] = useState<RehearsalProjectSummary | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [comparison, setComparison] =
    useState<RehearsalRunComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setProject(null);
    setRuns([]);
    setSummary(null);
    setDeck(null);
    setComparison(null);
    setLoading(true);

    void (async () => {
      try {
        const [projects, { runs: succeededRuns }, projectSummary, deckPayload] =
          await Promise.all([
            fetchReportProjects(),
            fetchProjectRehearsalReportRuns(projectId),
            fetchProjectRehearsalSummary(projectId),
            fetchProjectDeck(projectId).catch(() => null),
          ]);
        if (!isMounted) return;
        const sortedRuns = sortRehearsalRunsByCreatedAt(succeededRuns);
        const latestSucceededRun = sortedRuns[sortedRuns.length - 1] ?? null;
        const latestComparison = latestSucceededRun
          ? await fetchRehearsalRunComparison(
              projectId,
              latestSucceededRun.runId,
            ).catch(() => null)
          : null;
        if (!isMounted) return;
        setProject(projects.find((p) => p.projectId === projectId) ?? null);
        setRuns(sortedRuns);
        setSummary(projectSummary);
        setDeck(deckPayload?.deck ?? null);
        setComparison(latestComparison);
        setLoading(false);
      } catch {
        if (!isMounted) return;
        setProject(null);
        setRuns([]);
        setSummary(null);
        setDeck(null);
        setComparison(null);
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const latestRun = runs[runs.length - 1] ?? null;
  const showSummary = runs.length >= 2;
  const comparisonModel = comparison
    ? buildRehearsalRunComparisonViewModel(comparison, deck, projectId)
    : null;

  const durationSeries = (summary?.runDurationSeries ?? []).map((p, i) => ({
    label: `${i + 1}회차`,
    seconds: p.durationSeconds,
  }));
  const durationValues = durationSeries.map((point) => point.seconds);
  const latestDuration = durationValues.at(-1) ?? null;
  const primaryBriefing = comparisonModel?.briefing[0] ?? null;

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
              <header className="report-overview-hero">
                <div className="report-overview-hero-copy">
                  <span className="report-page-kicker">
                    <Sparkles size={14} /> PROJECT REPORT
                  </span>
                  <h1>{project?.title ?? "프로젝트 리포트"}</h1>
                  <p>
                    {runs.length > 0
                      ? `${runs.length}회차 발표 기록을 한눈에 비교해보세요.`
                      : "첫 리허설을 시작하면 발표 흐름이 여기에 쌓여요."}
                  </p>
                  <span className="report-overview-hero-status">
                    <i aria-hidden="true" /> AI 분석 준비 완료
                  </span>
                </div>
                <div className="report-mascot-wrap report-overview-mascot-wrap">
                  <img
                    src={orbitReportMascot}
                    alt="ORBIT 리포트 캐릭터"
                    className="report-mascot report-overview-mascot"
                  />
                </div>
              </header>

              <section
                className="report-overview-focus"
                aria-label="다음 발표 핵심 안내"
              >
                <header className="report-overview-focus-header">
                  <div>
                    <span>WHAT TO DO NEXT</span>
                    <h2>다음 발표에서 먼저 챙길 것</h2>
                  </div>
                  <small>회차 비교와 발표 흐름에서 뽑은 핵심</small>
                </header>
                <div className="report-overview-focus-grid">
                  {primaryBriefing ? (
                    <a
                      className="report-overview-focus-card is-primary"
                      href={primaryBriefing.href}
                    >
                      <span>우선 개선</span>
                      <strong>{primaryBriefing.label}</strong>
                      <small>{primaryBriefing.slideLabel}</small>
                      <p>{primaryBriefing.reason}</p>
                    </a>
                  ) : (
                    <article className="report-overview-focus-card is-primary">
                      <span>우선 개선</span>
                      <strong>반복 이슈가 없습니다</strong>
                      <p>
                        다음 회차에서 새로운 변화가 생기면 이곳에 바로 보여드려요.
                      </p>
                    </article>
                  )}
                  <article className="report-overview-focus-card">
                    <span>발표 흐름 요약</span>
                    <strong>최근 발표 흐름을 확인하세요</strong>
                    <p>
                      {summary?.progressComment ??
                        "회차가 쌓이면 발표 흐름의 변화가 이곳에 요약됩니다."}
                    </p>
                  </article>
                </div>
              </section>

              <div className="report-overview-dates">
                <div className="report-date-row">
                  <span className="report-date-label">최신 리허설</span>
                  <strong className="report-date-value">
                    {latestRun ? formatRunDate(latestRun.createdAt) : "—"}
                  </strong>
                </div>
                <div className="report-date-row">
                  <span className="report-date-label">실전 리포트</span>
                  <strong className="report-date-value report-date-empty">
                    0건 · 준비 중
                  </strong>
                </div>
              </div>

              {comparisonModel ? (
                <RehearsalRunComparisonOverview model={comparisonModel} />
              ) : null}

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
                      <div className="report-project-chart-heading">
                        <span className="report-project-chart-label">
                          회차별 총 소요시간
                        </span>
                        <span className="report-project-chart-note">
                          전체 {durationSeries.length}회 · 최근 {formatOverviewDuration(latestDuration ?? 0)}
                        </span>
                      </div>
                      <DurationLineChart series={durationSeries} />
                    </div>
                  )}

                  {(summary?.slideAvgTimings?.length ?? 0) > 0 && (
                    <div className="report-project-chart-block">
                      <div className="report-project-chart-heading">
                        <span className="report-project-chart-label">
                          슬라이드별 평균 소요시간
                        </span>
                        <span className="report-project-chart-note">
                          {summary!.slideAvgTimings.length}장 · 실제 발표 기준
                        </span>
                      </div>
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

function formatOverviewDuration(totalSeconds: number) {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}
