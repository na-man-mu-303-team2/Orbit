import type { Project } from "@orbit/shared";
import {
  IconPin,
  IconPinFilled,
  IconPresentationAnalytics
} from "@tabler/icons-react";
import { lazy, Suspense } from "react";

const ProjectSlidePreview = lazy(() => import("./ProjectSlidePreview"));

type WorkspaceProjectCardProps = {
  createdAtLabel: string;
  isPinned: boolean;
  onOpen: () => void;
  onRehearse: () => void;
  onTogglePinned: () => void;
  pinning: boolean;
  project: Project;
};

export function WorkspaceProjectCard({
  createdAtLabel,
  isPinned,
  onOpen,
  onRehearse,
  onTogglePinned,
  pinning,
  project
}: WorkspaceProjectCardProps) {
  return (
    <article
      className={isPinned ? "workspace-home-card is-pinned" : "workspace-home-card"}
    >
      <button
        aria-label={`${project.title} 편집`}
        className="workspace-home-card-open"
        onClick={onOpen}
        type="button"
      >
        <span aria-hidden="true" className="workspace-home-thumb">
          <span className="workspace-home-thumb-slide">
            <b />
            <i />
            <i />
          </span>
          <Suspense fallback={null}>
            <ProjectSlidePreview projectId={project.projectId} />
          </Suspense>
        </span>
        <span className="workspace-home-card-caption">
          <small>{createdAtLabel} 생성</small>
          <strong>{project.title}</strong>
        </span>
      </button>

      <div className="workspace-home-card-actions">
        <button
          aria-label={isPinned ? `${project.title} 고정 해제` : `${project.title} 고정`}
          aria-pressed={isPinned}
          className={`workspace-home-card-pin ${isPinned ? "is-pinned" : ""}`}
          disabled={pinning}
          onClick={onTogglePinned}
          type="button"
        >
          {isPinned ? (
            <IconPinFilled aria-hidden="true" size={14} />
          ) : (
            <IconPin aria-hidden="true" size={14} />
          )}
        </button>
        <button
          aria-label={`${project.title} 리허설 시작`}
          onClick={onRehearse}
          title="리허설 시작"
          type="button"
        >
          <IconPresentationAnalytics aria-hidden="true" size={15} stroke={1.8} />
        </button>
      </div>
    </article>
  );
}
