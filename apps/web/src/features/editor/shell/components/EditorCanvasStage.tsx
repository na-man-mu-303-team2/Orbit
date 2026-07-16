import type { Deck, Slide } from "@orbit/shared";
import type Konva from "konva";
import type { ComponentProps, MutableRefObject, ReactNode, RefObject } from "react";

import {
  EditableCanvas,
  HiddenSlideRenderStages
} from "../../canvas/EditorCanvas";
import { buildSlideBackgroundStyle } from "../utils/editorLayout";
import { EmptyCanvasState } from "./EditorStateNotice";

type EditorCanvasStageProps = {
  assistantDialog: ReactNode;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  currentSlide: Slide | null;
  deck: Deck;
  editableCanvasProps: Omit<ComponentProps<typeof EditableCanvas>, "deck" | "slide">;
  renderingDeck: Deck | null;
  slideRenderStageRefs: MutableRefObject<Map<string, Konva.Stage>>;
  stageScale: number;
};

export function EditorCanvasStage(props: EditorCanvasStageProps) {
  return (
    <div className="canvas-scroll" ref={props.canvasViewportRef}>
      {props.currentSlide ? (
        <div className="konva-wrap">
          <div
            className="konva-stage-shell orbit-stage-shell"
            data-testid="editor-stage-shell"
            style={{
              width: props.deck.canvas.width * props.stageScale,
              height: props.deck.canvas.height * props.stageScale,
              color: props.currentSlide.style.textColor ?? props.deck.theme.textColor,
              ...buildSlideBackgroundStyle(props.currentSlide, props.deck)
            }}
          >
            <EditableCanvas
              {...props.editableCanvasProps}
              deck={props.deck}
              slide={props.currentSlide}
            />
          </div>
          {props.renderingDeck ? (
            <HiddenSlideRenderStages deck={props.renderingDeck} stageRefs={props.slideRenderStageRefs} />
          ) : null}
        </div>
      ) : (
        <EmptyCanvasState canvas={props.deck.canvas} />
      )}
      {props.assistantDialog}
    </div>
  );
}
