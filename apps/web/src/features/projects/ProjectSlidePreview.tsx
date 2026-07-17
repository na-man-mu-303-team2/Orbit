import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ReadOnlySlideCanvas } from "../slides/rendering";
import { fetchProjectDeckPreview } from "./ProjectAssetWorkspace";

/*
 * Live first-slide preview for workspace home cards. Loaded lazily so the
 * canvas renderer stays out of the initial home bundle. Renders nothing when
 * the project has no deck yet — the skeleton behind it stays visible.
 */
export default function ProjectSlidePreview(props: {
  className?: string;
  projectId: string;
}) {
  const deckQuery = useQuery({
    queryKey: ["projects", props.projectId, "deck-preview"],
    queryFn: () => fetchProjectDeckPreview(props.projectId),
    retry: false,
    staleTime: 60_000
  });
  const shell = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const deck = deckQuery.data ?? null;
  const slide = deck?.slides[0] ?? null;

  useEffect(() => {
    const target = shell.current;
    if (!target || !deck) return;

    const update = () => {
      if (target.clientWidth <= 0 || target.clientHeight <= 0) return;
      setScale(
        Math.max(
          target.clientWidth / deck.canvas.width,
          target.clientHeight / deck.canvas.height
        )
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, [deck]);

  if (!deck || !slide) return null;

  return (
    <div
      className={props.className ?? "workspace-home-thumb-canvas"}
      ref={shell}
    >
      {scale > 0 ? (
        <ReadOnlySlideCanvas deck={deck} scale={scale} slide={slide} />
      ) : null}
    </div>
  );
}
