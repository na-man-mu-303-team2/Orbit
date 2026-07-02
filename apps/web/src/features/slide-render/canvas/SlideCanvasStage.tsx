import type {
  AnimationRenderState,
  AnimationSequenceStep
} from "@orbit/editor-core";
import type { Deck, DeckElement, Slide } from "@orbit/shared";
import type Konva from "konva";
import {
  Group as KonvaGroup,
  Layer as KonvaLayer,
  Rect as KonvaRect,
  Stage as KonvaStage
} from "react-konva";
import type { ComponentType, CSSProperties, Ref } from "react";

import { RenderElementContent } from "./components/RenderElementContent";
import { getRenderableSlideElements } from "./renderableElements";
import { resolveSlideCanvasElementState } from "./slideCanvasElementState";

type KonvaComponent = ComponentType<any>;

const Group = KonvaGroup as unknown as KonvaComponent;
const Layer = KonvaLayer as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const Stage = KonvaStage as unknown as KonvaComponent;

function SlideCanvasElementNode(props: {
  activePlaybackStep?: AnimationSequenceStep | null;
  animationRenderState?: AnimationRenderState | null;
  deck: Deck;
  element: DeckElement;
  playbackProgress?: number | null;
  slide: Slide;
}) {
  const {
    activePlaybackStep,
    animationRenderState,
    deck,
    element,
    playbackProgress,
    slide
  } = props;
  const frame = {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation
  };
  const presentation = resolveSlideCanvasElementState({
    activePlaybackStep,
    animationRenderState,
    element,
    playbackProgress
  });

  if (!presentation.visible || presentation.opacity <= 0) {
    return null;
  }

  return (
    <Group listening={false} rotation={frame.rotation} x={frame.x} y={frame.y}>
      <Group
        listening={false}
        opacity={presentation.opacity}
        offsetX={frame.width / 2}
        offsetY={frame.height / 2}
        rotation={presentation.rotationOffset}
        scaleX={presentation.scale}
        scaleY={presentation.scale}
        x={frame.width / 2}
        y={frame.height / 2}
      >
        <RenderElementContent
          accentColor={slide.style.accentColor ?? deck.theme.accentColor}
          deck={deck}
          element={element}
          frame={{
            height: frame.height,
            rotation: 0,
            width: frame.width,
            x: 0,
            y: 0
          }}
          slide={slide}
        />
      </Group>
    </Group>
  );
}

export function SlideCanvasStage(props: {
  activePlaybackStep?: AnimationSequenceStep | null;
  animationRenderState?: AnimationRenderState | null;
  deck: Deck;
  playbackProgress?: number | null;
  slide: Slide;
  stageRef?: Ref<Konva.Stage>;
  stageStyle?: CSSProperties;
}) {
  const {
    activePlaybackStep,
    animationRenderState,
    deck,
    playbackProgress,
    slide,
    stageRef,
    stageStyle
  } = props;
  const visibleElements = getRenderableSlideElements(slide, deck.canvas);
  const backgroundColor = slide.style.backgroundColor ?? deck.theme.backgroundColor;

  return (
    <Stage
      height={deck.canvas.height}
      ref={stageRef}
      style={stageStyle}
      width={deck.canvas.width}
    >
      <Layer>
        <Rect
          fill={backgroundColor}
          height={deck.canvas.height}
          listening={false}
          width={deck.canvas.width}
          x={0}
          y={0}
        />
        {visibleElements.map((element) => (
          <SlideCanvasElementNode
            key={element.elementId}
            activePlaybackStep={activePlaybackStep}
            animationRenderState={animationRenderState}
            deck={deck}
            element={element}
            playbackProgress={playbackProgress}
            slide={slide}
          />
        ))}
      </Layer>
    </Stage>
  );
}
