import type { Deck, DeckElement, Slide } from "@orbit/shared";
import type Konva from "konva";
import {
  Group as KonvaGroup,
  Layer as KonvaLayer,
  Stage as KonvaStage,
} from "react-konva";
import type { ComponentType, MutableRefObject } from "react";

import { RenderElementContent } from "./components/RenderElementContent";
import { getRenderableSlideElements } from "./renderableElements";

type KonvaComponent = ComponentType<any>;

const Group = KonvaGroup as unknown as KonvaComponent;
const Layer = KonvaLayer as unknown as KonvaComponent;
const Stage = KonvaStage as unknown as KonvaComponent;

function RenderOnlyElementNode(props: {
  accentColor: string;
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { accentColor, deck, element, frame, slide } = props;

  return (
    <Group
      listening={false}
      opacity={element.visible ? element.opacity : 0}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
    >
      <RenderElementContent
        accentColor={accentColor}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
    </Group>
  );
}

export function HiddenSlideRenderStages(props: {
  deck: Deck;
  stageRefs: MutableRefObject<Map<string, Konva.Stage>>;
}) {
  const { deck, stageRefs } = props;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: -10000,
        left: -10000,
        width: deck.canvas.width,
        height: deck.canvas.height,
        pointerEvents: "none",
        opacity: 0,
      }}
    >
      {deck.slides.map((slide) => {
        const visibleElements = getRenderableSlideElements(slide, deck.canvas);

        return (
          <Stage
            height={deck.canvas.height}
            key={slide.slideId}
            ref={(stage: Konva.Stage | null) => {
              if (stage) {
                stageRefs.current.set(slide.slideId, stage);
              } else {
                stageRefs.current.delete(slide.slideId);
              }
            }}
            width={deck.canvas.width}
          >
            <Layer>
              {visibleElements.map((element) => (
                <RenderOnlyElementNode
                  key={element.elementId}
                  accentColor={slide.style.accentColor ?? deck.theme.accentColor}
                  deck={deck}
                  element={element}
                  frame={{
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: element.height,
                    rotation: element.rotation,
                  }}
                  slide={slide}
                />
              ))}
            </Layer>
          </Stage>
        );
      })}
    </div>
  );
}
