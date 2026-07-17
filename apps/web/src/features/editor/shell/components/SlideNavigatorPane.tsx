import type { ActivityTemplate, Deck } from "@orbit/shared";
import {
  IconChevronUp as ChevronUp,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconPlus as Plus,
} from "@tabler/icons-react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";

import { ActivitySpecialSlideThumbnail } from "../../../activity-slides";
import type { SlidePanelView } from "../editorShellUiStore";
import { resolveOoxmlEditCapability } from "../editorOoxmlCapabilities";
import { buildSlideRailItems } from "../slideRailModel";
import { buildSlideThumbBackground } from "../utils/editorLayout";
import { EmptyPanel } from "./EditorStateNotice";
import { SlideRail } from "./SlideRail";

export function SlideNavigatorPane(props: {
  canMutate: boolean;
  currentSlideIndex: number;
  deck: Deck;
  isCollapsed: boolean;
  onAddActivitySlide: (template: ActivityTemplate) => void;
  onAddActivityResultsSlide: () => void;
  onAddSlide: () => void;
  onDeleteSlide: (slideId: string) => void;
  onDuplicateSlide: (slideId: string) => void;
  onMoveSlide: (slideId: string, direction: "down" | "up") => void;
  onReorderSlides: (orderedSlideIds: readonly string[]) => void;
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
    (slide) => slide.kind === "activity",
  );
  const currentSlideId =
    props.deck.slides[props.currentSlideIndex]?.slideId ?? null;
  const currentSlide = props.deck.slides[props.currentSlideIndex] ?? null;
  const addSlideCapability = currentSlide
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        feature: "add-slide",
        slide: currentSlide,
      })
    : null;
  const duplicateDisabledReasons = Object.fromEntries(
    props.deck.slides.flatMap((slide) => {
      const capability = resolveOoxmlEditCapability({
        deck: props.deck,
        feature: "duplicate-slide",
        slide,
      });
      return capability.enabled || !capability.reason
        ? []
        : [[slide.slideId, capability.reason]];
    }),
  );
  const structuralDisabledReasons = Object.fromEntries(
    props.deck.slides.flatMap((slide) => {
      const capability = resolveOoxmlEditCapability({
        deck: props.deck,
        feature: "slide-properties",
        slide,
      });
      return capability.enabled || !capability.reason
        ? []
        : [[slide.slideId, capability.reason]];
    }),
  );
  const items = buildSlideRailItems(props.deck.slides, currentSlideId);
  const thumbnailBackgrounds = Object.fromEntries(
    props.deck.slides.map((slide) => [
      slide.slideId,
      buildSlideThumbBackground(
        slide,
        props.deck,
        props.slideThumbnailUrls[slide.slideId],
      ),
    ]),
  );
  const thumbnailContent = Object.fromEntries(
    props.deck.slides.flatMap((slide) =>
      slide.kind === "content"
        ? []
        : [
            [
              slide.slideId,
              <ActivitySpecialSlideThumbnail
                deck={props.deck}
                key={slide.slideId}
                slide={slide}
              />,
            ],
          ],
    ),
  );

  return (
    <aside
      className={`slides-pane ${props.isCollapsed ? "collapsed" : ""}`}
      data-testid="editor-slide-rail-pane"
    >
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
          aria-label={
            props.isCollapsed ? "슬라이드 패널 펼치기" : "슬라이드 패널 접기"
          }
          className="collapse-slides-button"
          type="button"
          title={
            props.isCollapsed ? "슬라이드 패널 펼치기" : "슬라이드 패널 접기"
          }
          onClick={props.onToggleCollapsed}
        >
          {props.isCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>
      </div>

      {hasSlides ? (
        <SlideRail
          canMutate={props.canMutate}
          canvasAspectRatio={`${props.deck.canvas.width} / ${props.deck.canvas.height}`}
          collapsed={props.isCollapsed}
          duplicateDisabledReasons={duplicateDisabledReasons}
          items={items}
          showIds={props.showIds}
          thumbnailBackgrounds={thumbnailBackgrounds}
          thumbnailContent={thumbnailContent}
          structuralDisabledReasons={structuralDisabledReasons}
          viewMode={props.view}
          onDelete={props.onDeleteSlide}
          onDuplicate={props.onDuplicateSlide}
          onMove={props.onMoveSlide}
          onReorder={props.onReorderSlides}
          onSelect={(slideId) => {
            const index = props.deck.slides.findIndex(
              (slide) => slide.slideId === slideId,
            );
            if (index >= 0) props.onSelectSlide(index);
          }}
        />
      ) : (
        <div className={`slides-list ${props.view}-view`}>
          <EmptyPanel
            title="슬라이드 없음"
            description="덱에 표시할 슬라이드가 없습니다. 새 슬라이드 또는 가져오기 기능이 연결되면 이 영역에 목록이 표시됩니다."
          />
        </div>
      )}

      {!props.isCollapsed ? (
        <div className="side-footer">
          <div
            className="slide-view-switch"
            role="group"
            aria-label="슬라이드 보기 방식"
          >
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
          {props.canMutate ? (
            <div className="add-slide-split">
              <button
                className="add-slide-button"
                disabled={addSlideCapability?.enabled === false}
                title={addSlideCapability?.reason ?? undefined}
                type="button"
                onClick={props.onAddSlide}
              >
                <Plus aria-hidden="true" size={17} />
                슬라이드 추가
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
                    ["satisfaction", "만족도 조사", "척도·선택·주관식 설문"],
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
                      {hasActivitySource
                        ? "참여 결과 연결"
                        : "원본 참여 장표 필요"}
                    </span>
                  </button>
                </div>
              ) : null}
              {addSlideCapability?.enabled === false &&
              addSlideCapability.reason ? (
                <small role="status">{addSlideCapability.reason}</small>
              ) : null}
            </div>
          ) : null}
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
