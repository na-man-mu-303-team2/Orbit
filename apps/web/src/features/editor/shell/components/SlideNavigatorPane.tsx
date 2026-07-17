import type { Deck } from "@orbit/shared";
import {
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconPlus as Plus,
} from "@tabler/icons-react";
import type { PointerEvent as ReactPointerEvent } from "react";

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
            <>
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
              {addSlideCapability?.enabled === false &&
              addSlideCapability.reason ? (
                <small role="status">{addSlideCapability.reason}</small>
              ) : null}
            </>
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
