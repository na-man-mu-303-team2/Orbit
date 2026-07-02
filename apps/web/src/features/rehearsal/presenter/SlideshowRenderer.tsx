import type { Deck } from "@orbit/shared";
import { ReadOnlySlideCanvas, type SlideRuntimeHighlight } from "../../slides/rendering";
import { useReducedMotion } from "./useReducedMotion";
import { useSlideshowTransitions } from "./useSlideshowTransitions";

export type SlideshowRenderMode = "presenter" | "slide-window" | "single-screen";

const emptyTriggerAnimationIds: readonly string[] = [];

export function SlideshowRenderer(props: {
  deck: Deck;
  highlights?: SlideRuntimeHighlight[];
  renderMode?: SlideshowRenderMode;
  scale?: number;
  slideId: string;
  stepIndex: number;
  triggerAnimationIds?: Iterable<string>;
}) {
  const {
    deck,
    highlights = [],
    renderMode = "presenter",
    scale = 1,
    slideId,
    stepIndex,
    triggerAnimationIds = emptyTriggerAnimationIds
  } = props;
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
      highlights={highlights}
      reducedMotion={reducedMotion}
      renderMode={renderMode}
      scale={scale}
      slide={slide}
      stepIndex={stepIndex}
      triggerAnimationIds={triggerAnimationIds}
    />
  );
}

function SlideshowRendererContent(props: {
  deck: Deck;
  highlights: SlideRuntimeHighlight[];
  reducedMotion: boolean;
  renderMode: SlideshowRenderMode;
  scale: number;
  slide: Deck["slides"][number];
  stepIndex: number;
  triggerAnimationIds: Iterable<string>;
}) {
  const {
    deck,
    highlights,
    reducedMotion,
    renderMode,
    scale,
    slide,
    stepIndex,
    triggerAnimationIds
  } = props;
  const { elementStates } = useSlideshowTransitions({
    deck,
    reducedMotion,
    slide,
    stepIndex,
    triggerAnimationIds
  });

  return (
    <div
      aria-label={`슬라이드쇼 렌더러: ${slide.title || slide.slideId}`}
      className={`slideshow-renderer slideshow-renderer--${renderMode}`}
      data-render-mode={renderMode}
      data-slide-id={slide.slideId}
      data-slide-title={slide.title}
      data-step-index={stepIndex}
    >
      <ReadOnlySlideCanvas
        deck={deck}
        elementStates={elementStates}
        highlights={highlights}
        scale={scale}
        slide={slide}
      />
    </div>
  );
}
