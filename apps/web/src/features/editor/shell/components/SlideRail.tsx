import {
  IconDots as Dots,
  IconGripVertical as GripVertical,
} from "@tabler/icons-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  beginSlideRailDrag,
  cancelSlideRailDrag,
  resolveSlideRailDrop,
  updateSlideRailDragTarget,
  type SlideRailDragState,
} from "../slideRailDragModel";
import {
  getSlideRailKeyboardTargetSlideId,
  type SlideRailItem,
} from "../slideRailModel";
import { IdBadge } from "./EditorIdBadge";

export type SlideRailProps = {
  canMutate: boolean;
  canvasAspectRatio: string;
  collapsed?: boolean;
  items: readonly SlideRailItem[];
  onDelete: (slideId: string) => void;
  onDuplicate: (slideId: string) => void;
  onMove: (slideId: string, direction: "down" | "up") => void;
  onReorder: (orderedSlideIds: readonly string[]) => void;
  onSelect: (slideId: string) => void;
  showIds?: boolean;
  thumbnailBackgrounds?: Readonly<Record<string, string>>;
  thumbnailContents?: Readonly<Record<string, ReactNode>>;
  viewMode: "list" | "thumbnail";
};

export function SlideRail(props: SlideRailProps) {
  const [openMenuSlideId, setOpenMenuSlideId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<SlideRailDragState | null>(null);
  const dragStateRef = useRef<SlideRailDragState | null>(null);
  const selectionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!dragState) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dragStateRef.current = cancelSlideRailDrag();
      setDragState(null);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [dragState]);

  function selectAndFocus(slideId: string) {
    props.onSelect(slideId);
    requestAnimationFrame(() => selectionButtonRefs.current.get(slideId)?.focus());
  }

  function handleSelectionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    slideId: string,
  ) {
    const targetSlideId = getSlideRailKeyboardTargetSlideId({
      currentSlideId: slideId,
      items: props.items,
      key: event.key,
    });
    if (!targetSlideId) return;

    event.preventDefault();
    selectAndFocus(targetSlideId);
  }

  function refocusMenuButton(slideId: string) {
    requestAnimationFrame(() => menuButtonRefs.current.get(slideId)?.focus());
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>, slideId: string) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setOpenMenuSlideId(null);
    refocusMenuButton(slideId);
  }

  function handleDragStart(event: PointerEvent<HTMLButtonElement>, slideId: string) {
    if (!props.canMutate || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextState = beginSlideRailDrag(event.pointerId, slideId);
    dragStateRef.current = nextState;
    setDragState(nextState);
  }

  function handleDragMove(event: PointerEvent<HTMLElement>) {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-slide-rail-row-id]");
    const slideId = hit?.dataset.slideRailRowId;
    if (!hit || !slideId) return;

    const rect = hit.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const nextState = updateSlideRailDragTarget(current, slideId, edge);
    dragStateRef.current = nextState;
    setDragState(nextState);
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const reordered = resolveSlideRailDrop(
      current,
      props.items.map((item) => item.slideId),
    );
    dragStateRef.current = null;
    setDragState(null);
    if (reordered) props.onReorder(reordered);
  }

  function cancelDrag(event: PointerEvent<HTMLElement>) {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragStateRef.current = cancelSlideRailDrag();
    setDragState(null);
  }

  return (
    <nav
      aria-label="슬라이드 목록"
      className={`slide-rail ${props.collapsed ? "collapsed" : ""}`}
      onPointerCancel={cancelDrag}
      onPointerMove={handleDragMove}
      onPointerUp={finishDrag}
    >
      <div
        aria-label="슬라이드 선택"
        className={`slides-list ${props.viewMode}-view`}
        role="listbox"
      >
        {props.items.map((item) => {
          const isMenuOpen = openMenuSlideId === item.slideId;
          const dropTarget = dragState?.target?.slideId === item.slideId
            ? dragState.target
            : null;
          const menuId = `slide-rail-menu-${item.slideId}`;

          return (
            <div
              className={`slide-rail-row ${item.isSelected ? "active" : ""}`}
              data-slide-rail-row-id={item.slideId}
              key={item.slideId}
              role="presentation"
            >
              {dropTarget?.edge === "before" ? <DropIndicator /> : null}
              <button
                aria-current={item.isSelected ? "true" : undefined}
                aria-label={`${item.index + 1}. ${item.title}`}
                aria-selected={item.isSelected}
                className={`slide-item ${item.isSelected ? "active" : ""}`}
                data-slide-id={item.slideId}
                ref={(node) => setButtonRef(selectionButtonRefs.current, item.slideId, node)}
                role="option"
                tabIndex={item.isSelected ? 0 : -1}
                type="button"
                onClick={() => props.onSelect(item.slideId)}
                onKeyDown={(event) => handleSelectionKeyDown(event, item.slideId)}
              >
                <span aria-hidden="true" className="slide-number">{item.index + 1}</span>
                <span className="slide-title">
                  <span className="slide-title-text">{item.title}</span>
                  {props.showIds ? <IdBadge id={item.slideId} /> : null}
                </span>
                {!props.collapsed && props.viewMode === "thumbnail" ? (
                  <span
                    aria-hidden="true"
                    className="slide-thumb orbit-thumb"
                    style={{
                      aspectRatio: props.canvasAspectRatio,
                      background: props.thumbnailBackgrounds?.[item.slideId],
                    }}
                  >
                    {props.thumbnailContents?.[item.slideId]}
                  </span>
                ) : null}
              </button>

              {props.canMutate && !props.collapsed ? (
                <div className="slide-rail-row-actions">
                  <button
                    aria-label={`${item.title} 드래그하여 이동`}
                    className="slide-rail-drag-handle"
                    type="button"
                    onPointerDown={(event) => handleDragStart(event, item.slideId)}
                  >
                    <GripVertical aria-hidden="true" size={16} />
                  </button>
                  <button
                    aria-controls={menuId}
                    aria-expanded={isMenuOpen}
                    aria-haspopup="true"
                    aria-label={`${item.title} 메뉴`}
                    className="slide-rail-menu-button"
                    ref={(node) => setButtonRef(menuButtonRefs.current, item.slideId, node)}
                    type="button"
                    onClick={() => setOpenMenuSlideId(isMenuOpen ? null : item.slideId)}
                  >
                    <Dots aria-hidden="true" size={17} />
                  </button>
                  <div
                    aria-label={`${item.title} 작업`}
                    className="slide-rail-menu"
                    hidden={!isMenuOpen}
                    id={menuId}
                    role="group"
                    onKeyDown={(event) => handleMenuKeyDown(event, item.slideId)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuSlideId(null);
                        props.onDuplicate(item.slideId);
                      }}
                    >복제</button>
                    <button
                      disabled={!item.canMoveUp}
                      type="button"
                      onClick={() => {
                        setOpenMenuSlideId(null);
                        props.onMove(item.slideId, "up");
                        refocusMenuButton(item.slideId);
                      }}
                    >위로 이동</button>
                    <button
                      disabled={!item.canMoveDown}
                      type="button"
                      onClick={() => {
                        setOpenMenuSlideId(null);
                        props.onMove(item.slideId, "down");
                        refocusMenuButton(item.slideId);
                      }}
                    >아래로 이동</button>
                    <button
                      disabled={!item.canDelete}
                      type="button"
                      onClick={() => {
                        setOpenMenuSlideId(null);
                        props.onDelete(item.slideId);
                      }}
                    >삭제</button>
                  </div>
                </div>
              ) : null}
              {dropTarget?.edge === "after" ? <DropIndicator /> : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function DropIndicator() {
  return (
    <span
      aria-hidden="true"
      className="slide-rail-drop-indicator"
      data-slide-rail-drop-indicator="true"
    />
  );
}

function setButtonRef(
  refs: Map<string, HTMLButtonElement>,
  slideId: string,
  node: HTMLButtonElement | null,
) {
  if (node) refs.set(slideId, node);
  else refs.delete(slideId);
}
