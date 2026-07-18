import type { ActivityTemplate, Deck } from "@orbit/shared";
import {
  IconChevronUp as ChevronUp,
  IconLayoutGrid as Grid,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconList as List,
  IconPlus as Plus
} from "@tabler/icons-react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";

import { ActivitySpecialSlideThumbnail } from "../../../activity-slides";
import type { SlidePanelView } from "../editorShellUiStore";
import { buildSlideThumbBackground } from "../utils/editorLayout";
import { IdBadge } from "./EditorIdBadge";
import { EmptyPanel } from "./EditorStateNotice";

export function SlideNavigatorPane(props: {
  currentSlideIndex: number;
  deck: Deck;
  isCollapsed: boolean;
  onAddActivitySlide: (template: ActivityTemplate) => void;
  onAddActivityResultsSlide: () => void;
  onAddSlide: () => void;
  onDeleteSlide: (index: number) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectSlide: (index: number) => void;
  onSetView: (view: SlidePanelView) => void;
  onToggleCollapsed: () => void;
  showIds: boolean;
  slideThumbnailUrls: Record<string, string>;
  view: SlidePanelView;
}) {
  const hasSlides = props.deck.slides.length > 0;
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const canAddActivity = canAddActivitySlide(props.deck);
  const hasActivitySource = props.deck.slides.some(
    (slide) => slide.kind === "activity"
  );

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
          aria-label={props.isCollapsed ? "슬라이드 목록 열기" : "슬라이드 패널 접기"}
          className="collapse-slides-button"
          type="button"
          title={props.isCollapsed ? "슬라이드 목록 열기" : "슬라이드 패널 접기"}
          onClick={props.onToggleCollapsed}
        >
          {props.isCollapsed ? <List aria-hidden="true" size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {!props.isCollapsed ? (
        <div className={`slides-list ${props.view}-view`}>
          {hasSlides ? (
            props.deck.slides.map((slide, index) => {
              const slideTitle = slide.title || `슬라이드 ${index + 1}`;

              return (
                <button
                  aria-label={`슬라이드 ${index + 1}: ${slideTitle}`}
                  aria-keyshortcuts="Delete Backspace"
                  className={`slide-item ${index === props.currentSlideIndex ? "active" : ""}`}
                  key={slide.slideId}
                  type="button"
                  onClick={() => props.onSelectSlide(index)}
                  onKeyDown={(event) => {
                    if (
                      index !== props.currentSlideIndex ||
                      !isSlideDeleteKey(event.key)
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    props.onDeleteSlide(index);
                  }}
                >
                  <span className="slide-item-meta">
                    <span className="slide-number">{index + 1}</span>
                    {props.view === "list" ? (
                      <span className="slide-item-title">{slideTitle}</span>
                    ) : null}
                  </span>
                  {props.view === "thumbnail" ? (
                    <span
                      className="slide-thumb orbit-thumb"
                      style={{
                        aspectRatio: `${props.deck.canvas.width} / ${props.deck.canvas.height}`,
                        background:
                          slide.kind === "content"
                            ? buildSlideThumbBackground(
                                slide,
                                props.deck,
                                props.slideThumbnailUrls[slide.slideId],
                              )
                            : undefined,
                      }}
                    >
                      {slide.kind === "activity" ||
                      slide.kind === "activity-results" ? (
                        <ActivitySpecialSlideThumbnail
                          deck={props.deck}
                          slide={slide}
                        />
                      ) : null}
                    </span>
                  ) : null}
                  {props.view === "list" && props.showIds ? (
                    <IdBadge id={slide.slideId} />
                  ) : null}
                </button>
              );
            })
          ) : (
            <EmptyPanel
              title="슬라이드 없음"
              description="덱에 표시할 슬라이드가 없습니다. 새 슬라이드 또는 가져오기 기능이 연결되면 이 영역에 목록이 표시됩니다."
            />
          )}
        </div>
      ) : null}

      {!props.isCollapsed ? (
        <div className="side-footer">
          <div className="slide-view-switch" role="group" aria-label="슬라이드 보기 방식">
            <button
              aria-label="썸네일 보기"
              className={props.view === "thumbnail" ? "active" : ""}
              title="썸네일 보기"
              type="button"
              onClick={() => props.onSetView("thumbnail")}
            >
              <Grid aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="목록 보기"
              className={props.view === "list" ? "active" : ""}
              title="목록 보기"
              type="button"
              onClick={() => props.onSetView("list")}
            >
              <List aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="add-slide-split">
            <button
              aria-label="슬라이드 추가"
              className="add-slide-button"
              title="슬라이드 추가"
              type="button"
              onClick={props.onAddSlide}
            >
              <Plus aria-hidden="true" size={17} />
            </button>
            <button
              aria-expanded={isAddMenuOpen}
              aria-haspopup="menu"
              aria-label="추가할 슬라이드 유형 선택"
              className="add-slide-menu-button"
              type="button"
              onClick={() => setIsAddMenuOpen((current) => !current)}
            >
              <ChevronUp aria-hidden="true" size={16} />
            </button>
            {isAddMenuOpen ? (
              <div className="add-slide-menu" role="menu">
                {([
                  ["pre-question", "사전 질문", "발표 전 질문 받기"],
                  ["poll", "실시간 투표", "단일 선택 투표"],
                  ["satisfaction", "만족도 조사", "척도·선택·주관식 설문"]
                ] as const).map(([template, title, description]) => (
                  <button
                    disabled={!canAddActivity}
                    key={template}
                    role="menuitem"
                    title={
                      canAddActivity
                        ? `${title} 추가`
                        : "참여 장표는 16:9 덱에서 사용할 수 있습니다."
                    }
                    type="button"
                    onClick={() => {
                      props.onAddActivitySlide(template);
                      setIsAddMenuOpen(false);
                    }}
                  >
                    <strong>{title}</strong>
                    <span>
                      {canAddActivity ? description : "와이드 16:9 필요"}
                    </span>
                  </button>
                ))}
                <button
                  disabled={!canAddActivity || !hasActivitySource}
                  role="menuitem"
                  title={
                    !canAddActivity
                      ? "참여 장표는 16:9 덱에서 사용할 수 있습니다."
                      : hasActivitySource
                        ? "연결 결과 장표 추가"
                        : "먼저 참여 장표를 추가하세요."
                  }
                  type="button"
                  onClick={() => {
                    props.onAddActivityResultsSlide();
                    setIsAddMenuOpen(false);
                  }}
                >
                  <strong>연결 결과 장표</strong>
                  <span>
                    {hasActivitySource ? "참여 결과 연결" : "원본 참여 장표 필요"}
                  </span>
                </button>
              </div>
            ) : null}
          </div>
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

export function canAddActivitySlide(deck: Pick<Deck, "canvas">): boolean {
  return deck.canvas.preset === "wide-16-9";
}

export function isSlideDeleteKey(key: string): boolean {
  return key === "Delete" || key === "Backspace";
}
