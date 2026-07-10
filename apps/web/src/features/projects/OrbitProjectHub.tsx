import type { Project } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  IconArrowRight,
  IconFileText,
  IconMicrophone,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTrash
} from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";
import { OrbitButton, OrbitEmptyState, OrbitIconButton, OrbitInput } from "../../design-system";
import { createProject, deleteProject, fetchProjects } from "./ProjectAssetWorkspace";
import "./orbit-project-hub.css";

type ProjectHubProps = {
  onNavigate: (path: string) => void;
};

export function OrbitWorkspaceHome(props: ProjectHubProps & { userName?: string }) {
  const projects = useProjectList();
  const recentProjects = useMemo(() => sortProjects(projects.data ?? []).slice(0, 4), [projects.data]);

  return (
    <section className="orbit-project-hub orbit-workspace-home">
      <header className="orbit-hub-heading">
        <div>
          <p className="orbit-ds-eyebrow">WORKSPACE</p>
          <h1>{props.userName ? `${props.userName}님,` : "오늘도"}<br />멋진 발표를 만들어볼까요?</h1>
          <p>최근 작업을 이어가거나 AI로 새 발표자료를 빠르게 시작하세요.</p>
        </div>
        <OrbitButton icon={<IconSparkles aria-hidden="true" size={19} />} onClick={() => props.onNavigate("/createdeck")}>AI 발표자료 만들기</OrbitButton>
      </header>

      {recentProjects[0] ? (
        <button className="orbit-hub-continue" onClick={() => props.onNavigate(projectPath(recentProjects[0]))} type="button">
          <span className="orbit-hub-project-mark"><IconFileText aria-hidden="true" size={25} /></span>
          <span><small>최근 작업 이어하기</small><strong>{recentProjects[0].title}</strong><small>{formatProjectDate(recentProjects[0])} 생성</small></span>
          <span>편집 계속하기 <IconArrowRight aria-hidden="true" size={18} /></span>
        </button>
      ) : null}

      <section className="orbit-hub-projects" aria-labelledby="orbit-recent-projects">
        <header><div><h2 id="orbit-recent-projects">최근 프로젝트</h2><p>가장 최근에 만든 발표자료를 확인하세요.</p></div><button onClick={() => props.onNavigate("/project")} type="button">전체 보기 <IconArrowRight aria-hidden="true" size={17} /></button></header>
        <ProjectState query={projects}>
          <ProjectTable compact onNavigate={props.onNavigate} projects={recentProjects} />
        </ProjectState>
      </section>

      <section className="orbit-hub-start-grid" aria-label="빠른 시작">
        <button className="lime" onClick={() => props.onNavigate("/createdeck")} type="button"><IconSparkles aria-hidden="true" size={30} /><span><strong>AI 발표자료 만들기</strong><small>주제와 자료를 바탕으로 발표 초안을 만드세요.</small></span><IconArrowRight aria-hidden="true" size={22} /></button>
        <button className="cream" onClick={() => props.onNavigate("/project?intent=rehearsal")} type="button"><IconMicrophone aria-hidden="true" size={30} /><span><strong>리허설 시작하기</strong><small>프로젝트를 골라 발표 흐름을 연습하세요.</small></span><IconArrowRight aria-hidden="true" size={22} /></button>
      </section>
    </section>
  );
}

export function OrbitProjectExplorer(props: ProjectHubProps) {
  const projects = useProjectList();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const matches = (projects.data ?? []).filter((project) => project.title.toLocaleLowerCase("ko-KR").includes(normalized));
    return sortProjects(matches, sort);
  }, [projects.data, query, sort]);

  async function createBlankProject() {
    if (isCreating) return;
    setIsCreating(true);
    setMutationError("");
    try {
      const project = await createProject("새 프레젠테이션");
      await projects.refetch();
      props.onNavigate(projectPath(project));
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setIsCreating(false);
    }
  }

  async function removeProject(project: Project) {
    if (deletingId || !window.confirm(`“${project.title}” 프로젝트를 삭제할까요?`)) return;
    setDeletingId(project.projectId);
    setMutationError("");
    try {
      await deleteProject(project.projectId);
      await projects.refetch();
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "프로젝트를 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="orbit-project-hub orbit-project-explorer">
      <header className="orbit-hub-heading compact">
        <div><p className="orbit-ds-eyebrow">PROJECTS</p><h1>프로젝트</h1><p>모든 발표자료를 찾고, 편집하고, 리허설을 시작하세요.</p></div>
        <OrbitButton icon={<IconSparkles aria-hidden="true" size={19} />} onClick={() => props.onNavigate("/createdeck")}>AI 발표자료 만들기</OrbitButton>
      </header>
      <section className="orbit-project-table-shell">
        <header className="orbit-project-toolbar">
          <label><IconSearch aria-hidden="true" size={18} /><OrbitInput aria-label="프로젝트 검색" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="프로젝트 검색" value={query} /></label>
          <select aria-label="프로젝트 정렬" onChange={(event) => setSort(event.currentTarget.value as typeof sort)} value={sort}><option value="newest">최근 생성순</option><option value="oldest">오래된순</option><option value="title">이름순</option></select>
          <OrbitIconButton aria-label="프로젝트 새로고침" onClick={() => void projects.refetch()} variant="surface"><IconRefresh aria-hidden="true" size={18} /></OrbitIconButton>
          <OrbitButton icon={<IconPlus aria-hidden="true" size={18} />} onClick={() => void createBlankProject()} variant="secondary">{isCreating ? "생성 중..." : "빈 프로젝트"}</OrbitButton>
        </header>
        {mutationError ? <p className="orbit-project-error" role="alert">{mutationError}</p> : null}
        <ProjectState emptySearch={Boolean(query.trim()) && !filteredProjects.length} query={projects}>
          <ProjectTable deletingId={deletingId} onDelete={removeProject} onNavigate={props.onNavigate} projects={filteredProjects} />
        </ProjectState>
      </section>
    </section>
  );
}

function useProjectList() {
  return useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects(), retry: false });
}

function ProjectState(props: {
  children: ReactNode;
  emptySearch?: boolean;
  query: ReturnType<typeof useProjectList>;
}) {
  if (props.query.isLoading) return <div className="orbit-project-state" role="status">프로젝트를 불러오는 중입니다.</div>;
  if (props.query.isError) return <OrbitEmptyState action={<OrbitButton onClick={() => void props.query.refetch()} variant="secondary">다시 시도</OrbitButton>} description="연결을 확인한 뒤 프로젝트 목록을 다시 불러오세요." title="프로젝트를 불러오지 못했습니다." />;
  if (props.emptySearch) return <OrbitEmptyState description="다른 검색어로 다시 찾아보세요." title="검색 결과가 없습니다." />;
  if (!props.query.data?.length) return <OrbitEmptyState description="AI 발표자료 만들기로 첫 프로젝트를 시작하세요." title="아직 프로젝트가 없습니다." />;
  return <>{props.children}</>;
}

function ProjectTable(props: {
  compact?: boolean;
  deletingId?: string | null;
  onDelete?: (project: Project) => void;
  onNavigate: (path: string) => void;
  projects: Project[];
}) {
  return (
    <div className={`orbit-project-table${props.compact ? " compact" : ""}`} role="table" aria-label="프로젝트 목록">
      <div className="orbit-project-row heading" role="row"><span role="columnheader">프로젝트</span><span role="columnheader">생성일</span><span role="columnheader">작업</span></div>
      {props.projects.map((project, index) => (
        <div className="orbit-project-row" key={project.projectId} role="row">
          <button className="orbit-project-title" onClick={() => props.onNavigate(projectPath(project))} role="cell" type="button"><span className={`orbit-project-thumb tone-${index % 4}`}><IconFileText aria-hidden="true" size={20} /></span><span><strong>{project.title}</strong><small>{project.projectId}</small></span></button>
          <span className="orbit-project-date" role="cell">{formatProjectDate(project)}</span>
          <span className="orbit-project-actions" role="cell"><button onClick={() => props.onNavigate(projectPath(project))} type="button">편집</button><button onClick={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)} type="button">리허설</button>{props.onDelete ? <OrbitIconButton aria-label={`${project.title} 삭제`} disabled={props.deletingId === project.projectId} onClick={() => props.onDelete?.(project)} variant="plain"><IconTrash aria-hidden="true" size={17} /></OrbitIconButton> : null}</span>
        </div>
      ))}
    </div>
  );
}

function sortProjects(projects: Project[], sort: "newest" | "oldest" | "title" = "newest") {
  return [...projects].sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, "ko-KR");
    const difference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return sort === "newest" ? difference : -difference;
  });
}

function formatProjectDate(project: Project) {
  const date = new Date(project.createdAt);
  return Number.isNaN(date.getTime()) ? "날짜 없음" : date.toLocaleDateString("ko-KR");
}

function projectPath(project: Project) {
  return `/project/${encodeURIComponent(project.projectId)}`;
}
