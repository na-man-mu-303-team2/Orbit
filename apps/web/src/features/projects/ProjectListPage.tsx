import type { Project } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  IconFileText,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";

import { WorkspaceContainer } from "../../components/patterns";
import {
  OrbitButton,
  OrbitEmptyState,
  OrbitIconButton,
  OrbitInput,
} from "../../components/ui";
import {
  createProject,
  deleteProject,
  fetchProjects,
} from "./ProjectAssetWorkspace";
import "./orbit-project-hub.css";

export type ProjectListPageMode = "project" | "rehearsal";

export function ProjectListPage(props: {
  mode: ProjectListPageMode;
  onNavigate: (path: string) => void;
}) {
  const projects = useProjectList();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const isRehearsal = props.mode === "rehearsal";
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const matches = (projects.data ?? []).filter((project) =>
      project.title.toLocaleLowerCase("ko-KR").includes(normalized),
    );
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
      setMutationError(
        cause instanceof Error ? cause.message : "프로젝트를 만들지 못했습니다.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function removeProject(project: Project) {
    if (
      deletingId ||
      !window.confirm(`“${project.title}” 프로젝트를 삭제할까요?`)
    ) {
      return;
    }
    setDeletingId(project.projectId);
    setMutationError("");
    try {
      await deleteProject(project.projectId);
      await projects.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "프로젝트를 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <WorkspaceContainer
      as="section"
      className={`orbit-project-hub orbit-project-explorer${
        isRehearsal ? " rehearsal-project-picker" : ""
      }`}
    >
      <header className="orbit-hub-heading">
        <div>
          <h1>{isRehearsal ? "리허설" : "프로젝트"}</h1>
          <p>
            {isRehearsal
              ? "연습할 발표자료를 선택하세요."
              : "발표자료를 만들고 편집하거나 리허설을 시작하세요."}
          </p>
        </div>
        {isRehearsal ? (
          <OrbitButton
            onClick={() => props.onNavigate("/project")}
            variant="quiet"
          >
            프로젝트 보기
          </OrbitButton>
        ) : (
          <OrbitButton
            icon={<IconSparkles aria-hidden="true" size={18} />}
            onClick={() => props.onNavigate("/createdeck")}
          >
            AI 발표자료 만들기
          </OrbitButton>
        )}
      </header>

      <section className="orbit-project-table-shell">
        <header className="orbit-project-toolbar">
          <label>
            <IconSearch aria-hidden="true" size={18} />
            <OrbitInput
              aria-label="프로젝트 검색"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={isRehearsal ? "연습할 발표자료 검색" : "프로젝트 검색"}
              value={query}
            />
          </label>
          <select
            aria-label="프로젝트 정렬"
            onChange={(event) =>
              setSort(event.currentTarget.value as typeof sort)
            }
            value={sort}
          >
            <option value="newest">최근 생성순</option>
            <option value="oldest">오래된순</option>
            <option value="title">이름순</option>
          </select>
          <OrbitIconButton
            aria-label="프로젝트 새로고침"
            onClick={() => void projects.refetch()}
            variant="surface"
          >
            <IconRefresh aria-hidden="true" size={18} />
          </OrbitIconButton>
          {!isRehearsal ? (
            <OrbitButton
              icon={<IconPlus aria-hidden="true" size={18} />}
              loading={isCreating}
              onClick={() => void createBlankProject()}
              variant="secondary"
            >
              {isCreating ? "생성 중" : "빈 프로젝트"}
            </OrbitButton>
          ) : null}
        </header>

        {mutationError ? (
          <p className="orbit-project-error" role="alert">
            {mutationError}
          </p>
        ) : null}

        <ProjectState
          emptyDescription={
            isRehearsal
              ? "먼저 프로젝트를 만든 뒤 리허설을 시작하세요."
              : undefined
          }
          emptySearch={Boolean(query.trim()) && !filteredProjects.length}
          query={projects}
        >
          <ProjectTable
            deletingId={deletingId}
            mode={props.mode}
            onDelete={isRehearsal ? undefined : removeProject}
            onNavigate={props.onNavigate}
            projects={filteredProjects}
          />
        </ProjectState>
      </section>
    </WorkspaceContainer>
  );
}

function useProjectList() {
  return useQuery({
    queryFn: () => fetchProjects(),
    queryKey: ["projects"],
    retry: false,
  });
}

function ProjectState(props: {
  children: ReactNode;
  emptyDescription?: string;
  emptySearch?: boolean;
  query: ReturnType<typeof useProjectList>;
}) {
  if (props.query.isLoading) {
    return (
      <div className="orbit-project-state" role="status">
        프로젝트를 불러오는 중입니다.
      </div>
    );
  }
  if (props.query.isError) {
    return (
      <OrbitEmptyState
        action={
          <OrbitButton
            onClick={() => void props.query.refetch()}
            variant="secondary"
          >
            다시 시도
          </OrbitButton>
        }
        description="연결을 확인한 뒤 프로젝트 목록을 다시 불러오세요."
        title="프로젝트를 불러오지 못했습니다."
      />
    );
  }
  if (props.emptySearch) {
    return (
      <OrbitEmptyState
        description="다른 검색어로 다시 찾아보세요."
        title="검색 결과가 없습니다."
      />
    );
  }
  if (!props.query.data?.length) {
    return (
      <OrbitEmptyState
        description={
          props.emptyDescription ??
          "AI 발표자료 만들기로 첫 프로젝트를 시작하세요."
        }
        title="아직 프로젝트가 없습니다."
      />
    );
  }
  return <>{props.children}</>;
}

function ProjectTable(props: {
  deletingId: string | null;
  mode: ProjectListPageMode;
  onDelete?: (project: Project) => void;
  onNavigate: (path: string) => void;
  projects: Project[];
}) {
  const isRehearsal = props.mode === "rehearsal";

  return (
    <div
      aria-label={isRehearsal ? "리허설 프로젝트 목록" : "프로젝트 목록"}
      className="orbit-project-table"
      role="table"
    >
      <div className="orbit-project-row heading" role="row">
        <span role="columnheader">프로젝트</span>
        <span role="columnheader">생성일</span>
        <span role="columnheader">작업</span>
      </div>
      {props.projects.map((project) => {
        const rehearsalPath = `/rehearsal/${encodeURIComponent(project.projectId)}`;
        return (
          <div className="orbit-project-row" key={project.projectId} role="row">
            <button
              className="orbit-project-title"
              onClick={() =>
                props.onNavigate(
                  isRehearsal ? rehearsalPath : projectPath(project),
                )
              }
              role="cell"
              type="button"
            >
              <span className="orbit-project-thumb">
                <IconFileText aria-hidden="true" size={20} />
              </span>
              <span>
                <strong>{project.title}</strong>
                <small>{project.projectId}</small>
              </span>
            </button>
            <span className="orbit-project-date" role="cell">
              {formatProjectDate(project)}
            </span>
            <span className="orbit-project-actions" role="cell">
              {isRehearsal ? (
                <button
                  className="orbit-project-action primary"
                  onClick={() => props.onNavigate(rehearsalPath)}
                  type="button"
                >
                  리허설 시작
                </button>
              ) : (
                <>
                  <button
                    className="orbit-project-action"
                    onClick={() => props.onNavigate(projectPath(project))}
                    type="button"
                  >
                    편집
                  </button>
                  <button
                    className="orbit-project-action"
                    onClick={() => props.onNavigate(rehearsalPath)}
                    type="button"
                  >
                    리허설
                  </button>
                </>
              )}
              {props.onDelete ? (
                <OrbitIconButton
                  aria-label={`${project.title} 삭제`}
                  disabled={props.deletingId === project.projectId}
                  onClick={() => props.onDelete?.(project)}
                  variant="plain"
                >
                  <IconTrash aria-hidden="true" size={17} />
                </OrbitIconButton>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function sortProjects(
  projects: Project[],
  sort: "newest" | "oldest" | "title" = "newest",
) {
  return [...projects].sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, "ko-KR");
    const difference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return sort === "newest" ? difference : -difference;
  });
}

function formatProjectDate(project: Project) {
  const date = new Date(project.createdAt);
  return Number.isNaN(date.getTime())
    ? "날짜 없음"
    : date.toLocaleDateString("ko-KR");
}

function projectPath(project: Project) {
  return `/project/${encodeURIComponent(project.projectId)}`;
}
