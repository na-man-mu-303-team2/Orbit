import type { Deck, Slide } from "@orbit/shared";
import type Konva from "konva";
import type { ComponentProps, MutableRefObject, ReactNode, RefObject } from "react";

import {
  ActivityResultSlideRenderer,
  ActivitySlidePreview,
  findActivityResultSource
} from "../../../activity-slides";
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
  zoomMode: "fit" | "manual";
};

export function EditorCanvasStage(props: EditorCanvasStageProps) {
  return (
    <div
      aria-label="슬라이드 캔버스 작업 영역"
      className="canvas-scroll"
      data-testid="editor-canvas-pane"
      data-zoom-mode={props.zoomMode}
      data-zoom-percent={Math.round(props.stageScale * 100)}
      ref={props.canvasViewportRef}
      role="region"
      tabIndex={0}
    >
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
            {props.currentSlide.kind === "activity" ? (
              <div aria-label="잠긴 시스템 레이어" className="activity-editor-system-layer">
                <ActivitySlidePreview role="audience" slide={props.currentSlide} />
              </div>
            ) : props.currentSlide.kind === "activity-results" ? (
              <div aria-label="잠긴 시스템 레이어" className="activity-editor-system-layer">
                <ActivityResultSlideRenderer
                  presenterResult={null}
                  publicResult={null}
                  role="presenter"
                  run={null}
                  scale={props.stageScale}
                  slide={props.currentSlide}
                  source={findActivityResultSource(
                    props.deck,
                    props.currentSlide.activityResult.sourceActivityId
                  )}
                />
              </div>
            ) : (
              <EditableCanvas
                {...props.editableCanvasProps}
                deck={props.deck}
                slide={props.currentSlide}
              />
            )}
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
