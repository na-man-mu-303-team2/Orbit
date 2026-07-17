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
  project: Project;
};

export function WorkspaceProjectCard({
  createdAtLabel,
  isPinned,
  onOpen,
  onRehearse,
  onTogglePinned,
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
      </button>

      <div className="workspace-home-card-info">
        <div className="workspace-home-card-titlerow">
          <strong>{project.title}</strong>
          <button
            aria-label={isPinned ? `${project.title} 고정 해제` : `${project.title} 고정`}
            aria-pressed={isPinned}
            className={`workspace-home-card-pin ${isPinned ? "is-pinned" : ""}`}
            onClick={onTogglePinned}
            type="button"
          >
            {isPinned ? (
              <IconPinFilled aria-hidden="true" size={15} />
            ) : (
              <IconPin aria-hidden="true" size={15} />
            )}
          </button>
        </div>

        <div className="workspace-home-card-meta">
          <span className="workspace-home-card-date">
            <small>생성일</small>
            <b>{createdAtLabel}</b>
          </span>
          <button
            aria-label={`${project.title} 리허설 시작`}
            className="workspace-home-card-rehearse"
            onClick={onRehearse}
            title="리허설 시작"
            type="button"
          >
            <IconPresentationAnalytics aria-hidden="true" size={17} stroke={1.8} />
          </button>
        </div>
      </div>
    </article>
  );
}
