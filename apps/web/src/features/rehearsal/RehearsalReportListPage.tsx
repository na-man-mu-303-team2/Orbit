import type { Project, RehearsalRun } from "@orbit/shared";
import {
  IconArrowRight,
  IconChevronRight,
  IconFileText,
  IconMicrophone,
  IconRefresh
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { WorkspaceContainer } from "../../components/patterns";
import { OrbitButton, OrbitEmptyState } from "../../components/ui";
import { fetchProjects } from "../projects/ProjectAssetWorkspace";
import { fetchProjectRehearsalReportRuns } from "./reportApi";
import { navigateTo, formatRunDate } from "./rehearsalUtils";
import "./rehearsal-report-list.css";

export type ProjectWithReport = {
  latestRun: RehearsalRun;
  project: Project;
  totalCount: number;
};

export function buildProjectReportItems(
  projects: Project[],
  runLists: Array<{ runs: RehearsalRun[]; total: number }>
) {
  return projects.flatMap<ProjectWithReport>((project, index) => {
    const runList = runLists[index];
    if (!runList?.runs.length) return [];
    const sorted = [...runList.runs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return [{ latestRun: sorted[0], project, totalCount: runList.total }];
  }).sort((left, right) => Date.parse(right.latestRun.createdAt) - Date.parse(left.latestRun.createdAt));
}

export function RehearsalReportListPage({ projectId }: { projectId?: string }) {
  const [items, setItems] = useState<ProjectWithReport[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (projectId) {
      navigateTo(`/reports/${encodeURIComponent(projectId)}`);
      return;
    }

    let isMounted = true;
    setState("loading");
    void fetchProjects()
      .then(async (projects) => {
        const runLists = await Promise.all(projects.map((project) => fetchProjectRehearsalReportRuns(project.projectId)));
        if (!isMounted) return;
        setItems(buildProjectReportItems(projects, runLists));
        setState("ready");
      })
      .catch(() => {
        if (!isMounted) return;
        setItems([]);
        setState("error");
      });
    return () => { isMounted = false; };
  }, [projectId, reloadKey]);

  return (
    <WorkspaceContainer
      as="section"
      className="orbit-report-hub"
      width="content"
    >
      <header className="orbit-report-hub-heading">
        <div><p className="redesign-eyebrow">REHEARSAL REPORTS</p><h1>리허설 리포트</h1><p>프로젝트별 연습 기록과 변화 흐름을 한눈에 확인하세요.</p></div>
        <OrbitButton icon={<IconMicrophone aria-hidden="true" size={18} />} onClick={() => navigateTo("/project?intent=rehearsal")} variant="secondary">새 리허설</OrbitButton>
      </header>

      <section className="orbit-report-hub-summary">
        <span><IconFileText aria-hidden="true" size={24} /></span>
        <div><small>프로젝트 리포트</small><strong>{state === "ready" ? `${items.length}개 프로젝트의 리허설 기록` : "프로젝트별 발표 흐름을 모아보세요."}</strong><p>종합 리포트에서 회차별 시간, 키워드 전달과 공식 코칭 요약을 확인할 수 있습니다.</p></div>
        <IconArrowRight aria-hidden="true" size={24} />
      </section>

      <section className="orbit-report-list-shell" aria-labelledby="orbit-report-project-list">
        <header><div><h2 id="orbit-report-project-list">프로젝트 리포트</h2><p>{state === "ready" ? `리허설 기록이 있는 프로젝트 ${items.length}개` : "리허설 기록을 불러오고 있습니다."}</p></div>{state === "error" ? <button onClick={() => setReloadKey((current) => current + 1)} type="button"><IconRefresh aria-hidden="true" size={17} /> 다시 시도</button> : null}</header>
        {state === "loading" ? <div className="orbit-report-list-status" role="status">리포트를 불러오는 중입니다.</div> : null}
        {state === "error" ? <OrbitEmptyState description="연결을 확인한 뒤 프로젝트 리포트를 다시 불러오세요." title="리포트를 불러오지 못했습니다." /> : null}
        {state === "ready" && items.length === 0 ? <OrbitEmptyState action={<OrbitButton onClick={() => navigateTo("/project?intent=rehearsal")} variant="secondary">리포트용 리허설 시작하기</OrbitButton>} description="마이크 녹음과 AI 분석까지 완료한 리허설이 프로젝트별 리포트로 쌓입니다." title="아직 분석된 리허설이 없습니다." /> : null}
        {state === "ready" && items.length > 0 ? (
          <div className="orbit-report-project-table" role="table" aria-label="프로젝트별 리허설 리포트">
            <div className="orbit-report-project-row heading" role="row"><span role="columnheader">프로젝트</span><span role="columnheader">최근 리허설</span><span role="columnheader">누적 회차</span><span /></div>
            {items.map(({ project, latestRun, totalCount }) => (
              <button className="orbit-report-project-row" key={project.projectId} onClick={() => navigateTo(`/reports/${encodeURIComponent(project.projectId)}`)} role="row" type="button">
                <span className="orbit-report-project-name" role="cell"><i><IconFileText aria-hidden="true" size={20} /></i><span><strong>{project.title}</strong><small>프로젝트 종합 리포트</small></span></span>
                <span role="cell">{formatRunDate(latestRun.createdAt)}</span>
                <strong role="cell">{totalCount}회</strong>
                <IconChevronRight aria-hidden="true" size={18} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </WorkspaceContainer>
  );
}
