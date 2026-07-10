import type { Project, RehearsalProjectSummary, RehearsalRun } from "@orbit/shared";
import {
  IconArrowLeft,
  IconChartLine,
  IconClock,
  IconFileText,
  IconMicrophone,
  IconRefresh
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { OrbitButton, OrbitEmptyState } from "../../design-system";
import { fetchReportProjects, fetchProjectRehearsalReportRuns, fetchProjectRehearsalSummary } from "./reportApi";
import { RehearsalRunNav } from "./RehearsalRunNav";
import { DurationLineChart, SlideAvgBarChart } from "./ReportProgressCharts";
import { navigateTo, formatRunDate, sortRehearsalRunsByCreatedAt } from "./rehearsalUtils";
import "./rehearsal-project-report.css";

export function getProjectReportDataLevel(runCount: number) {
  if (runCount <= 0) return "empty";
  return runCount === 1 ? "single" : "trend";
}

export function RehearsalProjectOverviewPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<RehearsalRun[]>([]);
  const [summary, setSummary] = useState<RehearsalProjectSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setState("loading");
    void Promise.all([fetchReportProjects(), fetchProjectRehearsalReportRuns(projectId), fetchProjectRehearsalSummary(projectId)])
      .then(([projects, { runs: succeededRuns }, projectSummary]) => {
        if (!isMounted) return;
        setProject(projects.find((item) => item.projectId === projectId) ?? null);
        setRuns(sortRehearsalRunsByCreatedAt(succeededRuns));
        setSummary(projectSummary);
        setState("ready");
      })
      .catch(() => {
        if (!isMounted) return;
        setProject(null);
        setRuns([]);
        setSummary(null);
        setState("error");
      });
    return () => { isMounted = false; };
  }, [projectId, reloadKey]);

  const latestRun = runs[runs.length - 1] ?? null;
  const dataLevel = getProjectReportDataLevel(runs.length);
  const durationSeries = (summary?.runDurationSeries ?? []).map((point, index) => ({ label: `${index + 1}회차`, seconds: point.durationSeconds }));

  return (
    <main className="orbit-project-report">
      <header className="orbit-project-report-topbar">
        <button aria-label="리포트 목록으로" onClick={() => navigateTo("/reports")} type="button"><IconArrowLeft aria-hidden="true" size={19} /></button>
        <span><small>프로젝트 리허설 리포트</small><strong>{project?.title ?? "프로젝트 리포트"}</strong></span>
        <OrbitButton icon={<IconMicrophone aria-hidden="true" size={17} />} onClick={() => navigateTo(`/rehearsal/${encodeURIComponent(projectId)}`)} variant="secondary">리허설 시작</OrbitButton>
      </header>

      <div className="orbit-project-report-body">
        <header className="orbit-project-report-heading"><p className="orbit-ds-eyebrow">PROJECT REPORT</p><h1>프로젝트 종합 리포트</h1><p>회차별 연습 기록과 공식 분석 지표로 발표의 변화를 확인하세요.</p></header>

        {state === "loading" ? <div className="orbit-project-report-state" role="status">종합 리포트를 불러오는 중입니다.</div> : null}
        {state === "error" ? <OrbitEmptyState action={<OrbitButton icon={<IconRefresh aria-hidden="true" size={17} />} onClick={() => setReloadKey((current) => current + 1)} variant="secondary">다시 시도</OrbitButton>} description="연결을 확인한 뒤 프로젝트 리포트를 다시 불러오세요." title="종합 리포트를 불러오지 못했습니다." /> : null}
        {state === "ready" ? (
          <>
            <section className="orbit-project-report-hero">
              <div><span><IconChartLine aria-hidden="true" size={22} /></span><div><small>리허설 기록</small><strong>{runs.length ? `${runs.length}회 연습했어요.` : "첫 리허설을 준비해 보세요."}</strong><p>{summary?.progressComment ?? (latestRun ? `${formatRunDate(latestRun.createdAt)}에 가장 최근 리허설을 완료했습니다.` : "리허설을 완료하면 실제 분석 결과가 이곳에 쌓입니다.")}</p></div></div>
              <dl><div><dt>누적 리포트</dt><dd>{runs.length}건</dd></div><div><dt>최근 리허설</dt><dd>{latestRun ? formatRunDate(latestRun.createdAt) : "—"}</dd></div></dl>
            </section>

            {dataLevel === "empty" ? <OrbitEmptyState action={<OrbitButton onClick={() => navigateTo(`/rehearsal/${encodeURIComponent(projectId)}`)}>첫 리허설 시작</OrbitButton>} description="한 번의 리허설부터 공식 시간·키워드·말하기 지표를 확인할 수 있습니다." title="아직 리허설 기록이 없습니다." /> : null}
            {dataLevel === "single" ? <section className="orbit-project-report-guidance"><IconClock aria-hidden="true" size={24} /><div><strong>한 번 더 연습하면 변화 추세를 볼 수 있어요.</strong><p>현재 회차의 상세 리포트는 아래 목록에서 확인할 수 있습니다.</p></div></section> : null}
            {dataLevel === "trend" ? <section className="orbit-project-trends"><header><IconChartLine aria-hidden="true" size={20} /><div><h2>회차별 변화</h2><p>{runs.length}회차의 실제 분석 결과를 비교합니다.</p></div></header><div className="orbit-project-trend-grid">{durationSeries.length >= 2 ? <article><span>회차별 총 소요시간</span><DurationLineChart series={durationSeries} /></article> : null}{(summary?.slideAvgTimings?.length ?? 0) > 0 ? <article><span>슬라이드별 평균 소요시간</span><SlideAvgBarChart timings={summary!.slideAvgTimings} /></article> : null}</div></section> : null}

            {runs.length ? <section className="orbit-project-run-section"><header><div><IconFileText aria-hidden="true" size={20} /><span><h2>회차별 리포트</h2><p>각 리허설의 공식 분석 내용을 확인하세요.</p></span></div></header><RehearsalRunNav loading={false} projectId={projectId} runs={runs} /></section> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
