import {
  demoIds,
  type CommunityTemplateCard,
  type Project,
} from "@orbit/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronRight,
  IconPlus
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { WorkspaceContainer } from "../../components/patterns";
import { OrbitFailureState } from "../../components/ui";
import "../../styles/tokens.css";
import { CommunityTemplateGalleryDialog } from "../community-templates/CommunityTemplateGalleryDialog";
import { CommunityTemplateShelf } from "../community-templates/CommunityTemplateShelf";
import { CommunityTemplatePublishToast } from "../community-templates/CommunityTemplatePublishToast";
import { PublishCommunityTemplateDialog } from "../community-templates/PublishCommunityTemplateDialog";
import {
  createCommunityTemplateApplyAttempt,
  executeCommunityTemplateApply,
  type FailedCommunityTemplateApply,
} from "../community-templates/communityTemplateApplication";
import {
  CommunityTemplateWebError,
  communityTemplateKeys,
  fetchCommunityTemplateShelf,
  useCommunityTemplate,
} from "../community-templates/communityTemplateApi";
import {
  createProject,
  fetchProjects,
  updateProjectPin,
} from "./ProjectAssetWorkspace";
import { WorkspaceProjectCard } from "./WorkspaceProjectCard";
import "./workspace-home.css";

type ProjectHubProps = {
  onNavigate: (path: string) => void;
};

export function OrbitWorkspaceHome(props: ProjectHubProps & { userName?: string }) {
  const queryClient = useQueryClient();
  const projects = useProjectList();
  const templates = useCommunityTemplateShelf();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishReturnFocus, setPublishReturnFocus] = useState(false);
  const [publishToast, setPublishToast] = useState<string | null>(null);
  const [applyingInstanceKey, setApplyingInstanceKey] = useState<string | null>(
    null,
  );
  const [applyFailure, setApplyFailure] =
    useState<FailedCommunityTemplateApply | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [pinError, setPinError] = useState("");
  const recentProjects = useMemo(() => {
    const sorted = sortProjects(projects.data ?? []);
    const pinned = sorted.filter((project) => project.isPinned);
    const rest = sorted.filter((project) => !project.isPinned);
    return [...pinned, ...rest].slice(0, 10);
  }, [projects.data]);
  const blankProject = useMutation({
    mutationFn: () => createProject("새 프레젠테이션"),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      props.onNavigate(projectPath(project));
    },
  });
  const dismissPublishToast = useCallback(() => setPublishToast(null), []);

  async function applyTemplate(
    instanceKey: string,
    card: CommunityTemplateCard,
  ) {
    if (applyingInstanceKey) return;
    const attempt = createCommunityTemplateApplyAttempt(
      instanceKey,
      card,
      applyFailure,
    );
    setApplyingInstanceKey(instanceKey);
    setApplyFailure(null);
    try {
      await executeCommunityTemplateApply(
        { attempt, workspaceId: demoIds.workspaceId },
        {
          closeGallery: () => setGalleryOpen(false),
          invalidateProjects: () =>
            queryClient.invalidateQueries({ queryKey: ["projects"] }),
          invalidateRecent: () =>
            queryClient.invalidateQueries({
              queryKey: communityTemplateKeys.recent,
            }),
          navigate: props.onNavigate,
          useTemplate: useCommunityTemplate,
        },
      );
    } catch (cause) {
      setApplyFailure({
        ...attempt,
        message:
          cause instanceof CommunityTemplateWebError
            ? cause.message
            : "템플릿을 적용하지 못했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setApplyingInstanceKey(null);
    }
  }

  async function togglePinnedProject(projectId: string, isPinned: boolean) {
    if (pinningId) return;
    setPinningId(projectId);
    setPinError("");
    try {
      await updateProjectPin(projectId, !isPinned);
      await projects.refetch();
    } catch (cause) {
      setPinError(
        cause instanceof Error
          ? cause.message
          : "프로젝트 고정 상태를 변경하지 못했습니다.",
      );
    } finally {
      setPinningId(null);
    }
  }

  return (
    <div className="workspace-home">
      <WorkspaceContainer
        as="section"
        className="workspace-home-main"
        width="content"
      >
        <h1 className="workspace-home-visually-hidden">ORBIT 홈</h1>
        <CommunityTemplateShelf
          cards={templates.data?.items ?? []}
          error={
            templates.isError
              ? "템플릿을 불러오지 못했습니다."
              : blankProject.isError
                ? "빈 프레젠테이션을 만들지 못했습니다."
                : null
          }
          isCreatingBlank={blankProject.isPending}
          loading={templates.isLoading}
          onCreateBlank={() => blankProject.mutate()}
          onOpenGallery={() => {
            setApplyFailure(null);
            setPublishReturnFocus(false);
            setGalleryOpen(true);
          }}
          onRetry={() => void templates.refetch()}
        />

        <header className="workspace-home-head">
          <div>
            <h2>최근 작업</h2>
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

        {pinError ? (
          <p className="workspace-home-pin-error" role="alert">
            {pinError}
          </p>
        ) : null}

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
            <strong>AI로 발표자료 만들기</strong>
            <small>
              아이디어를 입력하면 AI가
              <br />
              발표자료 초안을 만들어드려요.
            </small>
          </button>

          {projects.isLoading ? (
            <p className="workspace-home-state" role="status">프로젝트를 불러오는 중입니다.</p>
          ) : projects.isError ? (
            <OrbitFailureState
              className="workspace-home-state"
              description="프로젝트 목록을 가져오는 중 연결 문제가 발생했습니다."
              onRetry={() => void projects.refetch()}
              recommendedAction="인터넷 연결을 확인한 뒤 목록을 다시 불러오세요."
              retryLabel="목록 다시 불러오기"
              title="프로젝트를 불러오지 못했습니다."
            />
          ) : (
            recentProjects.map((project) => {
              return (
                <WorkspaceProjectCard
                  createdAtLabel={formatProjectDate(project)}
                  isPinned={project.isPinned}
                  key={project.projectId}
                  onOpen={() => props.onNavigate(projectPath(project))}
                  onRehearse={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)}
                  onTogglePinned={() =>
                    void togglePinnedProject(project.projectId, project.isPinned)
                  }
                  pinning={pinningId === project.projectId}
                  project={project}
                />
              );
            })
          )}
        </div>
      </WorkspaceContainer>
      <CommunityTemplateGalleryDialog
        applyingInstanceKey={applyingInstanceKey}
        applyError={applyFailure?.message ?? null}
        onApply={(instanceKey, card) => void applyTemplate(instanceKey, card)}
        onClose={() => {
          if (applyingInstanceKey) return;
          setApplyFailure(null);
          setPublishReturnFocus(false);
          setGalleryOpen(false);
        }}
        onOpenPublish={() => {
          setPublishReturnFocus(false);
          setPublishOpen(true);
        }}
        onRetryApply={() => {
          if (!applyFailure) return;
          void applyTemplate(applyFailure.instanceKey, applyFailure.card);
        }}
        open={galleryOpen && !publishOpen}
        publishReturnFocus={publishReturnFocus}
      />
      <PublishCommunityTemplateDialog
        onClose={() => {
          setPublishOpen(false);
          setPublishReturnFocus(true);
        }}
        onPublished={(title) => {
          setPublishOpen(false);
          setPublishReturnFocus(true);
          setPublishToast(title);
        }}
        open={publishOpen}
      />
      {publishToast ? (
        <CommunityTemplatePublishToast
          onDismiss={dismissPublishToast}
          title={publishToast}
        />
      ) : null}
    </div>
  );
}

function useProjectList() {
  return useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects(), retry: false });
}

function useCommunityTemplateShelf() {
  return useQuery({
    queryKey: communityTemplateKeys.shelf,
    queryFn: () => fetchCommunityTemplateShelf(),
    retry: false,
    staleTime: 60_000,
  });
}

function sortProjects<T extends Project>(
  projects: T[],
  sort: "newest" | "oldest" | "title" = "newest",
): T[] {
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
