import type { Project } from "@orbit/shared";
import {
  IconPresentation,
  IconPresentationAnalytics,
  IconTrash,
} from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { OrbitIconButton } from "../../components/ui";

const ProjectSlidePreview = lazy(() => import("./ProjectSlidePreview"));

export function ProjectGalleryCard(props: {
  createdAtLabel: string;
  deleting: boolean;
  onDelete: () => void;
  onOpen: () => void;
  onRehearse: () => void;
  project: Project;
}) {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const previewRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const target = previewRef.current;
    if (!target) return;
    if (!("IntersectionObserver" in window)) {
      setIsPreviewVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsPreviewVisible(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <article className="orbit-project-gallery-card" role="listitem">
      <button
        aria-label={`${props.project.title} 편집`}
        className="orbit-project-gallery-preview"
        onClick={props.onOpen}
        ref={previewRef}
        type="button"
      >
        <span aria-hidden="true" className="orbit-project-gallery-fallback">
          <IconPresentation size={28} stroke={1.5} />
        </span>
        {isPreviewVisible ? (
          <Suspense fallback={null}>
            <ProjectSlidePreview
              className="orbit-project-gallery-canvas"
              projectId={props.project.projectId}
            />
          </Suspense>
        ) : null}
      </button>

      <div className="orbit-project-gallery-hover-actions">
        <OrbitIconButton
          aria-label={`${props.project.title} 리허설 시작`}
          onClick={props.onRehearse}
          title="리허설 시작"
          variant="surface"
        >
          <IconPresentationAnalytics
            aria-hidden="true"
            size={16}
            stroke={1.8}
          />
        </OrbitIconButton>
        <OrbitIconButton
          aria-label={`${props.project.title} 삭제`}
          className="orbit-project-gallery-delete"
          disabled={props.deleting}
          onClick={props.onDelete}
          title="삭제"
          variant="surface"
        >
          <IconTrash aria-hidden="true" size={16} stroke={1.8} />
        </OrbitIconButton>
      </div>

      <div className="orbit-project-gallery-meta">
        <button
          className="orbit-project-gallery-title"
          onClick={props.onOpen}
          type="button"
        >
          <strong>{props.project.title}</strong>
          <small>{props.createdAtLabel}</small>
        </button>
      </div>
    </article>
  );
}
