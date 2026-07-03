import type { Deck } from "@orbit/shared";
import {
  getRenderableSlideElements,
  ReadOnlySlideCanvas,
  type SlideRuntimeHighlight
} from "../../slides/rendering";
import { resolveEditorAssetUrl } from "../../editor/shared/editorAssetUrl";
import type { SlideshowRuntimeSnapshot } from "./slideshowRuntime";
import { useReducedMotion } from "./useReducedMotion";
import { useSlideshowTransitions } from "./useSlideshowTransitions";

export type SlideshowRenderMode = "presenter" | "slide-window" | "single-screen";

export function SlideshowRenderer(props: {
  deck: Deck;
  highlights?: SlideRuntimeHighlight[];
  playInitialEntryAnimations?: boolean;
  renderMode?: SlideshowRenderMode;
  runtime: SlideshowRuntimeSnapshot;
  scale?: number;
  slideId: string;
}) {
  const {
    deck,
    highlights = [],
    playInitialEntryAnimations: playInitialEntryAnimationsProp,
    renderMode = "presenter",
    runtime,
    scale = 1,
    slideId
  } = props;
  const playInitialEntryAnimations =
    playInitialEntryAnimationsProp ?? renderMode !== "slide-window";
  const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
  const reducedMotion = useReducedMotion();

  if (!slide) {
    return (
      <div className="slideshow-renderer slideshow-renderer--missing" role="status">
        슬라이드를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <SlideshowRendererContent
      deck={deck}
      executedAnimationIds={runtime.executedAnimationIds}
      highlights={highlights}
      playInitialEntryAnimations={playInitialEntryAnimations}
      reducedMotion={reducedMotion}
      renderMode={renderMode}
      scale={scale}
      slide={slide}
      stepIndex={runtime.stepIndex}
      triggerAnimationIds={runtime.triggerAnimationIds}
    />
  );
}

function SlideshowRendererContent(props: {
  deck: Deck;
  executedAnimationIds?: Iterable<string>;
  highlights: SlideRuntimeHighlight[];
  playInitialEntryAnimations: boolean;
  reducedMotion: boolean;
  renderMode: SlideshowRenderMode;
  scale: number;
  slide: Deck["slides"][number];
  stepIndex: number;
  triggerAnimationIds: Iterable<string>;
}) {
  const {
    deck,
    executedAnimationIds,
    highlights,
    playInitialEntryAnimations,
    reducedMotion,
    renderMode,
    scale,
    slide,
    stepIndex,
    triggerAnimationIds
  } = props;
  const { elementStates } = useSlideshowTransitions({
    deck,
    executedAnimationIds,
    playInitialEntryAnimations,
    reducedMotion,
    slide,
    stepIndex,
    triggerAnimationIds
  });
  const hasRenderableElements =
    getRenderableSlideElements(slide, deck.canvas).length > 0;
  const thumbnailUrl = resolveEditorAssetUrl(slide.thumbnailUrl);

  return (
    <div
      aria-label={`슬라이드쇼 렌더러: ${slide.title || slide.slideId}`}
      className={`slideshow-renderer slideshow-renderer--${renderMode}`}
      data-render-mode={renderMode}
      data-slide-id={slide.slideId}
      data-slide-title={slide.title}
      data-step-index={stepIndex}
    >
      {!hasRenderableElements && thumbnailUrl ? (
        <div
          className="slideshow-renderer-thumbnail"
          style={{
            height: deck.canvas.height * scale,
            overflow: "hidden",
            width: deck.canvas.width * scale
          }}
        >
          <img
            alt={`${slide.title || slide.slideId} thumbnail`}
            src={thumbnailUrl}
            style={{
              display: "block",
              height: "100%",
              objectFit: "contain",
              width: "100%"
            }}
          />
        </div>
      ) : (
        <ReadOnlySlideCanvas
          deck={deck}
          elementStates={elementStates}
          highlights={highlights}
          scale={scale}
          slide={slide}
        />
      )}
    </div>
  );
}
