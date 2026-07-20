import type { ProjectListItem } from "@orbit/shared";
import {
  IconChartBar,
  IconPin,
  IconPinFilled,
  IconPresentation,
  IconPlayerPlay,
  IconSparkles,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { lazy, Suspense } from "react";
import { OrbitCard, OrbitIconButton } from "../../components/ui";

const ProjectSlidePreview = lazy(() => import("./ProjectSlidePreview"));

type WorkspaceProjectCardProps = {
  createdAtLabel: string;
  deleting: boolean;
  isPinned: boolean;
  onDelete: () => void;
  onManageTags: () => void;
  onOpen: () => void;
  onRehearse: () => void;
  onReport: () => void;
  onTogglePinned: () => void;
  pinning: boolean;
  project: ProjectListItem;
};

export function WorkspaceProjectCard(props: WorkspaceProjectCardProps) {
  const { project } = props;
  const isGenerating = Boolean(project.generation);
  const visibleTags = project.tags.length ? project.tags : props.isPinned ? ["중요"] : [];

  return (
    <OrbitCard className={props.isPinned ? "workspace-home-card is-pinned" : "workspace-home-card"} data-generating={isGenerating} data-interactive="true">
      <div className="workspace-home-thumb-wrap">
        <button aria-label={`${project.title} 편집`} className="workspace-home-thumb-button" disabled={isGenerating} onClick={props.onOpen} type="button">
          <span aria-hidden="true" className="workspace-home-thumb">
            <span className="workspace-home-thumb-placeholder"><IconPresentation size={34} stroke={1.35} /></span>
            <Suspense fallback={null}><ProjectSlidePreview projectId={project.projectId} /></Suspense>
          </span>
        </button>

        <div aria-label={`${project.title} 빠른 작업`} className="workspace-home-card-actions">
          <OrbitIconButton aria-label={props.isPinned ? `${project.title} 핀 해제` : `${project.title} 핀 고정`} aria-pressed={props.isPinned} disabled={props.pinning || isGenerating} onClick={props.onTogglePinned} title={props.isPinned ? "핀 해제" : "핀"} variant={props.isPinned ? "primary" : "surface"}>
            {props.isPinned ? <IconPinFilled aria-hidden="true" size={15} /> : <IconPin aria-hidden="true" size={15} />}
          </OrbitIconButton>
          <OrbitIconButton aria-label={`${project.title} 리허설`} disabled={isGenerating} onClick={props.onRehearse} title="리허설"><IconPlayerPlay aria-hidden="true" size={16} stroke={1.8} /></OrbitIconButton>
          <OrbitIconButton aria-label={`${project.title} 리포트`} disabled={isGenerating} onClick={props.onReport} title="리포트"><IconChartBar aria-hidden="true" size={16} stroke={1.8} /></OrbitIconButton>
          <OrbitIconButton aria-label={`${project.title} 삭제`} className="workspace-home-card-delete" disabled={props.deleting || isGenerating} onClick={props.onDelete} title="삭제"><IconTrash aria-hidden="true" size={16} stroke={1.8} /></OrbitIconButton>
        </div>

        {project.generation ? (
          <div className="workspace-generation-progress">
            <span className="workspace-generation-progress-title"><IconSparkles aria-hidden="true" size={17} />AI 생성 중</span>
            <p>{project.generation.message || "슬라이드 구성을 만들고 있습니다."}</p>
            <strong>{project.generation.progress}%</strong>
            <progress aria-label={`${project.title} AI 생성 진행률`} max="100" value={project.generation.progress}>{project.generation.progress}%</progress>
          </div>
        ) : null}
      </div>

      <div className="workspace-home-card-caption">
        <div className="workspace-home-card-heading">
          <button className="workspace-home-card-title" disabled={isGenerating} onClick={props.onOpen} type="button">{project.title}</button>
          {!isGenerating ? <i aria-hidden="true" className="workspace-home-card-live-dot" /> : null}
          <button aria-label={`${project.title} 태그 편집`} className="workspace-home-card-tag-add" onClick={props.onManageTags} type="button"><IconTag aria-hidden="true" size={13} /></button>
        </div>
        <div className="workspace-home-card-tags">
          {visibleTags.slice(0, 3).map((tag) => <span className={tag === "중요" ? "is-important" : tag === "완료" ? "is-complete" : ""} key={tag}>{tag}</span>)}
          {visibleTags.length > 3 ? <span>+{visibleTags.length - 3}</span> : null}
        </div>
        <small>{props.createdAtLabel}</small>
      </div>
    </OrbitCard>
  );
}
