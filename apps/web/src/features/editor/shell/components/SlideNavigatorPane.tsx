import type { Deck } from "@orbit/shared";
import {
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconPlus as Plus
} from "@tabler/icons-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { SlidePanelView } from "../editorShellUiStore";
import { buildSlideThumbBackground } from "../utils/editorLayout";
import { IdBadge } from "./EditorIdBadge";
import { EmptyPanel } from "./EditorStateNotice";

export function SlideNavigatorPane(props: {
  currentSlideIndex: number;
  deck: Deck;
  isCollapsed: boolean;
  onAddSlide: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectSlide: (index: number) => void;
  onSetView: (view: SlidePanelView) => void;
  onToggleCollapsed: () => void;
  showIds: boolean;
  slideThumbnailUrls: Record<string, string>;
  view: SlidePanelView;
}) {
  const hasSlides = props.deck.slides.length > 0;

  return (
    <aside className={`slides-pane ${props.isCollapsed ? "collapsed" : ""}`}>
      <div className="slides-pane-header">
        {!props.isCollapsed ? (
          <div className="slides-pane-title">
            <strong>슬라이드</strong>
            <span aria-label={`총 ${props.deck.slides.length}개`}>
              {props.deck.slides.length}
            </span>
          </div>
        ) : null}
        <button
          aria-label={props.isCollapsed ? "슬라이드 패널 펼치기" : "슬라이드 패널 접기"}
          className="collapse-slides-button"
          type="button"
          title={props.isCollapsed ? "슬라이드 패널 펼치기" : "슬라이드 패널 접기"}
          onClick={props.onToggleCollapsed}
        >
          {props.isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {props.isCollapsed ? (
        <div className="collapsed-slide-rail">
          {props.deck.slides.map((slide, index) => (
            <button
              className={`rail-slide-button ${index === props.currentSlideIndex ? "active" : ""}`}
              key={slide.slideId}
              type="button"
              title={slide.title || `슬라이드 ${index + 1}`}
              onClick={() => props.onSelectSlide(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      ) : (
        <div className={`slides-list ${props.view}-view`}>
          {hasSlides ? (
            props.deck.slides.map((slide, index) => (
              <button
                className={`slide-item ${index === props.currentSlideIndex ? "active" : ""}`}
                key={slide.slideId}
                type="button"
                onClick={() => props.onSelectSlide(index)}
              >
                <span className="slide-number">{index + 1}</span>
                {props.showIds ? <IdBadge id={slide.slideId} /> : null}
                <span
                  className="slide-thumb orbit-thumb"
                  style={{
                    aspectRatio: `${props.deck.canvas.width} / ${props.deck.canvas.height}`,
                    background: buildSlideThumbBackground(
                      slide,
                      props.deck,
                      props.slideThumbnailUrls[slide.slideId]
                    )
                  }}
                />
              </button>
            ))
          ) : (
            <EmptyPanel
              title="슬라이드 없음"
              description="덱에 표시할 슬라이드가 없습니다. 새 슬라이드 또는 가져오기 기능이 연결되면 이 영역에 목록이 표시됩니다."
            />
          )}
        </div>
      )}

      {!props.isCollapsed ? (
        <div className="side-footer">
          <div className="slide-view-switch" role="group" aria-label="슬라이드 보기 방식">
            <button
              className={props.view === "thumbnail" ? "active" : ""}
              type="button"
              onClick={() => props.onSetView("thumbnail")}
            >
              썸네일
            </button>
            <button
              className={props.view === "list" ? "active" : ""}
              type="button"
              onClick={() => props.onSetView("list")}
            >
              목록
            </button>
          </div>
          <button className="add-slide-button" type="button" onClick={props.onAddSlide}>
            <Plus aria-hidden="true" size={17} />
            슬라이드 추가
          </button>
        </div>
      ) : null}

      <button
        aria-label="슬라이드 패널 크기 조정"
        className="slides-pane-resizer"
        type="button"
        onPointerDown={props.onResizeStart}
      />
    </aside>
  );
}
