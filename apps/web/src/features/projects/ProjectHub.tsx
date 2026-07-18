import type { Project } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  IconChevronRight,
  IconPlus
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { WorkspaceContainer } from "../../components/patterns";
import "../../styles/tokens.css";
import { fetchProjects } from "./ProjectAssetWorkspace";
import { WorkspaceProjectCard } from "./WorkspaceProjectCard";
import "./workspace-home.css";

type ProjectHubProps = {
  onNavigate: (path: string) => void;
};

export function OrbitWorkspaceHome(props: ProjectHubProps & { userName?: string }) {
  const projects = useProjectList();
  const [pinnedIds, setPinnedIds] = useState<string[]>(readPinnedProjectIds);
  const recentProjects = useMemo(() => {
    const sorted = sortProjects(projects.data ?? []);
    const pinned = sorted.filter((project) => pinnedIds.includes(project.projectId));
    const rest = sorted.filter((project) => !pinnedIds.includes(project.projectId));
    return [...pinned, ...rest].slice(0, 7);
  }, [projects.data, pinnedIds]);

  function togglePinnedProject(projectId: string) {
    setPinnedIds((current) => {
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [projectId, ...current];
      writePinnedProjectIds(next);
      return next;
    });
  }

  return (
    <div className="workspace-home">
      <WorkspaceContainer
        as="section"
        className="workspace-home-main"
        width="content"
      >
        <header className="workspace-home-head">
          <div>
            <h1>최근 작업</h1>
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
            <span aria-hidden="true" className="workspace-home-create-icon">
              <IconPlus size={22} stroke={1.8} />
            </span>
            <strong>새 발표자료 만들기</strong>
            <small>
              AI로 초안을 만들거나
              <br />
              빈 슬라이드로 시작하세요.
            </small>
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
            recentProjects.map((project) => {
              const isPinned = pinnedIds.includes(project.projectId);
              return (
                <WorkspaceProjectCard
                  createdAtLabel={formatProjectDate(project)}
                  isPinned={isPinned}
                  key={project.projectId}
                  onOpen={() => props.onNavigate(projectPath(project))}
                  onRehearse={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)}
                  onTogglePinned={() => togglePinnedProject(project.projectId)}
                  project={project}
                />
              );
            })
          )}
        </div>
      </WorkspaceContainer>
    </div>
  );
}

function useProjectList() {
  return useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects(), retry: false });
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

const pinnedProjectsStorageKey = "orbit.workspace.pinned-projects";

function readPinnedProjectIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pinnedProjectsStorageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writePinnedProjectIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pinnedProjectsStorageKey, JSON.stringify(ids));
  } catch {
    /* storage unavailable — pinning stays session-only */
  }
}
