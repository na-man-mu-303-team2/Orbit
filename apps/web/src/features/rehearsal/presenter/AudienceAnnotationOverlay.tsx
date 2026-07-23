import type {
  Deck,
  PresentationCompanionAnnotationSnapshot,
  PresentationCompanionStroke,
} from "@orbit/shared";
import type { AudienceOutputMode } from "./presenterStateStore";

export function AudienceAnnotationOverlay(props: {
  canvas: Deck["canvas"];
  mode: AudienceOutputMode;
  scale: number;
  snapshot?: PresentationCompanionAnnotationSnapshot | null;
}) {
  if (
    props.mode === "black" ||
    !props.snapshot ||
    props.snapshot.strokes.length === 0
  ) {
    return null;
  }

  return (
    <svg
      aria-label="청중 주석"
      className="audience-annotation-overlay"
      data-surface-id={props.snapshot.surfaceId}
      data-surface-revision={props.snapshot.surfaceRevision}
      height={props.canvas.height * props.scale}
      preserveAspectRatio="none"
      viewBox="0 0 1 1"
      width={props.canvas.width * props.scale}
    >
      {props.snapshot.strokes.map((stroke) => (
        <path
          className={`audience-annotation-stroke audience-annotation-stroke--${stroke.color}`}
          d={createStrokePath(stroke)}
          fill="none"
          key={stroke.strokeId}
          opacity={stroke.tool === "highlighter" ? 0.35 : 1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.width}
        />
      ))}
    </svg>
  );
}

export function createStrokePath(
  stroke: PresentationCompanionStroke,
): string {
  const first = stroke.points[0];
  if (!first) return "";
  const commands = [`M ${first.x} ${first.y}`];
  if (stroke.points.length === 1) {
    commands.push(`L ${first.x} ${first.y}`);
  } else {
    for (const point of stroke.points.slice(1)) {
      commands.push(`L ${point.x} ${point.y}`);
    }
  }
  return commands.join(" ");
}
