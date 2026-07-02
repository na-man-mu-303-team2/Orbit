import type { Deck } from "@orbit/shared";
import type Konva from "konva";
import type { MutableRefObject } from "react";

import { SlideCanvasStage } from "./SlideCanvasStage";

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
        return (
          <SlideCanvasStage
            deck={deck}
            key={slide.slideId}
            slide={slide}
            stageRef={(stage: Konva.Stage | null) => {
              if (stage) {
                stageRefs.current.set(slide.slideId, stage);
              } else {
                stageRefs.current.delete(slide.slideId);
              }
            }}
          />
        );
      })}
    </div>
  );
}
