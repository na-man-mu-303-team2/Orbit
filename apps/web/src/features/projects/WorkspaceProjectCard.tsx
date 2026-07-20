import type { ProjectListItem, ProjectTagDefinition } from "@orbit/shared";
import {
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconPin,
  IconPinFilled,
  IconPresentation,
  IconPlayerPlay,
  IconSparkles,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { lazy, Suspense } from "react";
import { OrbitCard } from "../../components/ui";

const ProjectSlidePreview = lazy(() => import("./ProjectSlidePreview"));

type WorkspaceProjectCardProps = {
  createdAtLabel: string;
  deleting: boolean;
  isPinned: boolean;
  onDelete: () => void;
  onOpen: () => void;
  onRehearse: () => void;
  onReport: () => void;
  onTogglePinned: () => void;
  onToggleTag: (tag: string) => void;
  pinning: boolean;
  project: ProjectListItem;
  tagOptions: ProjectTagDefinition[];
};

export function WorkspaceProjectCard(props: WorkspaceProjectCardProps) {
  const { project } = props;
  const isGenerating = Boolean(project.generation);
  const tagDefinitions = new Map(props.tagOptions.map((tag) => [tag.name, tag]));
  const visibleTags = project.tags.flatMap((name) => {
    const definition = tagDefinitions.get(name);
    return definition ? [definition] : [];
  });

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
          <button aria-label={props.isPinned ? `${project.title} 핀 해제` : `${project.title} 핀 고정`} aria-pressed={props.isPinned} className={props.isPinned ? "workspace-home-card-action is-active" : "workspace-home-card-action"} disabled={props.pinning || isGenerating} onClick={props.onTogglePinned} type="button">
            {props.isPinned ? <IconPinFilled aria-hidden="true" size={15} /> : <IconPin aria-hidden="true" size={15} />}
          </button>
          <button aria-label={`${project.title} 리허설`} className="workspace-home-card-action" disabled={isGenerating} onClick={props.onRehearse} title="리허설" type="button"><IconPlayerPlay aria-hidden="true" size={17} stroke={1.9} /></button>
          <button aria-label={`${project.title} 리포트`} className="workspace-home-card-action" disabled={isGenerating} onClick={props.onReport} title="리포트" type="button"><IconChartBar aria-hidden="true" size={17} stroke={1.9} /></button>
          <button aria-label={`${project.title} 삭제`} className="workspace-home-card-action workspace-home-card-delete" disabled={props.deleting || isGenerating} onClick={props.onDelete} title="삭제" type="button"><IconTrash aria-hidden="true" size={17} stroke={1.9} /></button>
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
          {props.tagOptions.length > 0 ? (
            <details className="workspace-home-card-tag-menu">
              <summary aria-label={`${project.title} 태그 선택`}><IconTag aria-hidden="true" size={13} /><span>태그</span><IconChevronDown aria-hidden="true" size={12} /></summary>
              <div className="workspace-home-card-tag-dropdown">
                {props.tagOptions.map((tag) => (
                  <button aria-pressed={project.tags.includes(tag.name)} key={tag.name} onClick={() => props.onToggleTag(tag.name)} type="button">
                    <span className={`is-${tag.color}`}>{tag.name}</span>{project.tags.includes(tag.name) ? <IconCheck aria-hidden="true" size={14} /> : null}
                  </button>
                ))}
              </div>
            </details>
          ) : (
            <button aria-label="사용 가능한 태그 없음" className="workspace-home-card-tag-disabled" disabled type="button"><IconTag aria-hidden="true" size={13} /><span>태그</span></button>
          )}
        </div>
        <div className="workspace-home-card-tags">
          {visibleTags.slice(0, 3).map((tag) => <span className={`is-${tag.color}`} key={tag.name}>{tag.name}</span>)}
          {visibleTags.length > 3 ? <span>+{visibleTags.length - 3}</span> : null}
        </div>
        <small className="workspace-home-card-date">{props.createdAtLabel}</small>
      </div>
    </OrbitCard>
  );
}
