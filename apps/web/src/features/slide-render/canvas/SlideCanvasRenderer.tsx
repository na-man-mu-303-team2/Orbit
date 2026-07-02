import type {
  AnimationRenderState,
  AnimationSequenceStep
} from "@orbit/editor-core";
import type { Deck, Slide } from "@orbit/shared";

import { resolveEditorAssetUrl } from "../../shared/assetUrl";
import { SlideCanvasStage } from "./SlideCanvasStage";

export function SlideCanvasRenderer(props: {
  activePlaybackStep?: AnimationSequenceStep | null;
  animationRenderState?: AnimationRenderState | null;
  className?: string;
  deck: Deck;
  playbackProgress?: number | null;
  slide: Slide;
}) {
  const {
    activePlaybackStep,
    animationRenderState,
    className,
    deck,
    playbackProgress,
    slide
  } = props;

  return (
    <div
      className={className}
      style={createSlideCanvasRendererStyle(deck, slide)}
    >
      <SlideCanvasStage
        activePlaybackStep={activePlaybackStep}
        animationRenderState={animationRenderState}
        deck={deck}
        playbackProgress={playbackProgress}
        slide={slide}
        stageStyle={{
          display: "block",
          height: "100%",
          width: "100%"
        }}
      />
    </div>
  );
}

function createSlideCanvasRendererStyle(deck: Deck, slide: Slide) {
  const backgroundColor = slide.style.backgroundColor ?? deck.theme.backgroundColor;
  const backgroundImage = slide.style.backgroundImage;
  const backgroundSize =
    backgroundImage?.fit === "contain"
      ? "contain"
      : backgroundImage?.fit === "stretch"
        ? "100% 100%"
        : "cover";

  return {
    backgroundColor,
    backgroundImage: backgroundImage
      ? `url("${resolveEditorAssetUrl(backgroundImage.src)}")`
      : undefined,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize,
    height: "100%",
    width: "100%"
  } as const;
}
