import type { Project } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  IconChevronRight,
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
import "../../styles/tokens.css";
import { createProject, deleteProject, fetchProjects } from "./ProjectAssetWorkspace";
import "./orbit-project-hub.css";
import "./workspace-home.css";

type ProjectHubProps = {
  onNavigate: (path: string) => void;
};

export function OrbitWorkspaceHome(props: ProjectHubProps & { userName?: string }) {
  const projects = useProjectList();
  const recentProjects = useMemo(
    () => sortProjects(projects.data ?? []).slice(0, 7),
    [projects.data]
  );

  return (
    <div className="workspace-home">
      <section className="workspace-home-main">
        <header className="workspace-home-head">
          <div>
            <p className="workspace-home-eyebrow">Workspace</p>
            <h1>최근 본 항목</h1>
          </div>
          <button
            className="workspace-home-more"
            onClick={() => props.onNavigate("/project")}
            type="button"
          >
            더보기
            <IconChevronRight aria-hidden="true" size={15} />
          </button>
        </header>

        <div className="workspace-home-grid">
          <button
            aria-label="AI 발표자료 만들기"
            className="workspace-home-create"
            onClick={() => props.onNavigate("/createdeck")}
            type="button"
          >
            <IconPlus aria-hidden="true" size={28} stroke={1.6} />
          </button>

          {projects.isLoading ? (
            <p className="workspace-home-state" role="status">프로젝트를 불러오는 중입니다.</p>
          ) : projects.isError ? (
            <div className="workspace-home-state">
              <strong>프로젝트를 불러오지 못했습니다.</strong>
              <span>연결을 확인한 뒤 다시 시도해 주세요.</span>
              <button onClick={() => void projects.refetch()} type="button">다시 시도</button>
            </div>
          ) : (
            recentProjects.map((project, index) => (
              <article className="workspace-home-card" key={project.projectId}>
                <button
                  aria-label={`${project.title} 편집`}
                  className="workspace-home-card-open"
                  onClick={() => props.onNavigate(projectPath(project))}
                  type="button"
                >
                  <span aria-hidden="true" className={`workspace-home-thumb tone-${index % 3}`}>
                    <span className="workspace-home-thumb-slide">
                      <b />
                      <i />
                      <i />
                    </span>
                  </span>
                </button>
                <footer>
                  <span aria-hidden="true" className="workspace-home-card-icon">
                    <IconFileText size={15} />
                  </span>
                  <span className="workspace-home-card-meta">
                    <strong>{project.title}</strong>
                    <small>{formatProjectDate(project)} 생성</small>
                  </span>
                  <button
                    aria-label={`${project.title} 리허설 시작`}
                    onClick={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)}
                    type="button"
                  >
                    <IconMicrophone aria-hidden="true" size={14} />
                  </button>
                </footer>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export function OrbitProjectExplorer(props: ProjectHubProps & { intent?: "rehearsal" }) {
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
        <div><p className="orbit-ds-eyebrow">{props.intent === "rehearsal" ? "REHEARSAL" : "PROJECTS"}</p><h1>{props.intent === "rehearsal" ? "리허설할 프로젝트 선택" : "프로젝트"}</h1><p>{props.intent === "rehearsal" ? "연습할 발표자료를 선택하면 바로 마이크 점검으로 이어집니다." : "모든 발표자료를 찾고, 편집하고, 리허설을 시작하세요."}</p></div>
        {props.intent === "rehearsal" ? <OrbitButton onClick={() => props.onNavigate("/project")} variant="secondary">프로젝트 관리</OrbitButton> : <OrbitButton icon={<IconSparkles aria-hidden="true" size={19} />} onClick={() => props.onNavigate("/createdeck")}>AI 발표자료 만들기</OrbitButton>}
      </header>
      <section className="orbit-project-table-shell">
        <header className="orbit-project-toolbar">
          <label><IconSearch aria-hidden="true" size={18} /><OrbitInput aria-label="프로젝트 검색" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="프로젝트 검색" value={query} /></label>
          <select aria-label="프로젝트 정렬" onChange={(event) => setSort(event.currentTarget.value as typeof sort)} value={sort}><option value="newest">최근 생성순</option><option value="oldest">오래된순</option><option value="title">이름순</option></select>
          <OrbitIconButton aria-label="프로젝트 새로고침" onClick={() => void projects.refetch()} variant="surface"><IconRefresh aria-hidden="true" size={18} /></OrbitIconButton>
          {props.intent === "rehearsal" ? null : <OrbitButton icon={<IconPlus aria-hidden="true" size={18} />} onClick={() => void createBlankProject()} variant="secondary">{isCreating ? "생성 중..." : "빈 프로젝트"}</OrbitButton>}
        </header>
        {mutationError ? <p className="orbit-project-error" role="alert">{mutationError}</p> : null}
        <ProjectState emptyDescription={props.intent === "rehearsal" ? "먼저 프로젝트를 만든 뒤 리허설을 시작하세요." : undefined} emptySearch={Boolean(query.trim()) && !filteredProjects.length} query={projects}>
          <ProjectTable deletingId={deletingId} intent={props.intent} onDelete={props.intent === "rehearsal" ? undefined : removeProject} onNavigate={props.onNavigate} projects={filteredProjects} />
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
  emptyDescription?: string;
  emptySearch?: boolean;
  query: ReturnType<typeof useProjectList>;
}) {
  if (props.query.isLoading) return <div className="orbit-project-state" role="status">프로젝트를 불러오는 중입니다.</div>;
  if (props.query.isError) return <OrbitEmptyState action={<OrbitButton onClick={() => void props.query.refetch()} variant="secondary">다시 시도</OrbitButton>} description="연결을 확인한 뒤 프로젝트 목록을 다시 불러오세요." title="프로젝트를 불러오지 못했습니다." />;
  if (props.emptySearch) return <OrbitEmptyState description="다른 검색어로 다시 찾아보세요." title="검색 결과가 없습니다." />;
  if (!props.query.data?.length) return <OrbitEmptyState description={props.emptyDescription ?? "AI 발표자료 만들기로 첫 프로젝트를 시작하세요."} title="아직 프로젝트가 없습니다." />;
  return <>{props.children}</>;
}

function ProjectTable(props: {
  compact?: boolean;
  deletingId?: string | null;
  intent?: "rehearsal";
  onDelete?: (project: Project) => void;
  onNavigate: (path: string) => void;
  projects: Project[];
}) {
  return (
    <div className={`orbit-project-table${props.compact ? " compact" : ""}`} role="table" aria-label="프로젝트 목록">
      <div className="orbit-project-row heading" role="row"><span role="columnheader">프로젝트</span><span role="columnheader">생성일</span><span role="columnheader">작업</span></div>
      {props.projects.map((project, index) => (
        <div className="orbit-project-row" key={project.projectId} role="row">
          <button className="orbit-project-title" onClick={() => props.onNavigate(props.intent === "rehearsal" ? `/rehearsal/${encodeURIComponent(project.projectId)}` : projectPath(project))} role="cell" type="button"><span className={`orbit-project-thumb tone-${index % 4}`}><IconFileText aria-hidden="true" size={20} /></span><span><strong>{project.title}</strong><small>{project.projectId}</small></span></button>
          <span className="orbit-project-date" role="cell">{formatProjectDate(project)}</span>
          <span className="orbit-project-actions" role="cell">{props.intent === "rehearsal" ? <button onClick={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)} type="button">리허설 시작</button> : <><button onClick={() => props.onNavigate(projectPath(project))} type="button">편집</button><button onClick={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)} type="button">리허설</button></>}{props.onDelete ? <OrbitIconButton aria-label={`${project.title} 삭제`} disabled={props.deletingId === project.projectId} onClick={() => props.onDelete?.(project)} variant="plain"><IconTrash aria-hidden="true" size={17} /></OrbitIconButton> : null}</span>
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
