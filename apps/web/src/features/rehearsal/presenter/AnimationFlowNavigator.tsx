import type { Deck, Slide } from "@orbit/shared";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  createSlideshowAnimationPlan,
  type PlannedSlideshowAnimation,
} from "./slideshowStepModel";
import { getTriggerAnimationIdsForSlide } from "../playback/triggeredActionPlayback";

export type AnimationFlowNavigation = {
  kind: "animation-step" | "slide";
  stepIndex: number;
  targetSlideIndex: number;
};

export type AnimationFlowStep = {
  effects: Array<{ animationId: string; label: string; targetLabel: string }>;
  occurrenceId: string | null;
  stepIndex: number;
  triggerLabel: string;
};

export type AnimationFlowSlide = {
  entryEffects: Array<{ animationId: string; label: string; targetLabel: string }>;
  isActivity: boolean;
  slideId: string;
  slideIndex: number;
  steps: AnimationFlowStep[];
  title: string;
};

export function createAnimationFlowModel(deck: Deck): AnimationFlowSlide[] {
  return deck.slides.map((slide, slideIndex) => {
    if (slide.kind === "activity" || slide.kind === "activity-results") {
      return {
        entryEffects: [],
        isActivity: true,
        slideId: slide.slideId,
        slideIndex,
        steps: [],
        title: getSlideTitle(slide),
      };
    }

    const animationPlan = createSlideshowAnimationPlan({
      slide,
      triggerAnimationIds: getTriggerAnimationIdsForSlide(slide),
    });

    return {
      entryEffects: animationPlan.entryAnimations.map((animation) =>
        toFlowEffect(slide, animation)
      ),
      isActivity: false,
      slideId: slide.slideId,
      slideIndex,
      steps: animationPlan.triggerSteps.map((step, index) => ({
        effects: step.animations.map((animation) => toFlowEffect(slide, animation)),
        occurrenceId: getTriggerOccurrenceId(slide, step.animations),
        stepIndex: index + 1,
        triggerLabel: getTriggerLabel(slide, step.animations),
      })),
      title: getSlideTitle(slide),
    };
  });
}

export function AnimationFlowNavigator(props: {
  currentSlideIndex: number;
  currentStepIndex: number;
  deck: Deck | null;
  navigationPending?: boolean;
  onNavigate: (navigation: AnimationFlowNavigation) => void;
  pendingOccurrenceIds?: readonly string[];
  placement?: "drawer" | "side";
}) {
  const placement = props.placement ?? "side";
  const [isOpen, setIsOpen] = useState(placement === "side");
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [drawerPosition, setDrawerPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [expandedSlideIds, setExpandedSlideIds] = useState<Set<string>>(
    () => new Set(),
  );
  const flowSlides = props.deck ? createAnimationFlowModel(props.deck) : [];
  const currentSlide = flowSlides[props.currentSlideIndex];

  useEffect(() => {
    if (!currentSlide) return;
    setExpandedSlideIds((current) => {
      if (current.has(currentSlide.slideId)) return current;
      return new Set([...current, currentSlide.slideId]);
    });
  }, [currentSlide]);

  useEffect(() => {
    const stopDragging = () => {
      drawerDragRef.current = null;
    };
    const moveDrawer = (event: PointerEvent) => {
      const drag = drawerDragRef.current;
      const drawer = drawerRef.current;
      if (!drag || !drawer) return;

      const bounds = drawer.getBoundingClientRect();
      const viewportPadding = 8;
      setDrawerPosition({
        left: clamp(
          event.clientX - drag.offsetX,
          viewportPadding,
          Math.max(viewportPadding, window.innerWidth - bounds.width - viewportPadding),
        ),
        top: clamp(
          event.clientY - drag.offsetY,
          viewportPadding,
          Math.max(viewportPadding, window.innerHeight - bounds.height - viewportPadding),
        ),
      });
    };

    window.addEventListener("pointermove", moveDrawer);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", moveDrawer);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const startDrawerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const bounds = drawer.getBoundingClientRect();
    drawerDragRef.current = {
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  if (flowSlides.length === 0) {
    return null;
  }

  return (
    <section
      ref={drawerRef}
      className={`animation-flow-navigator animation-flow-navigator-${placement} ${
        isOpen ? "animation-flow-navigator-open" : ""
      } ${placement === "drawer" && isOpen ? "animation-flow-navigator-drawer-open" : ""}`}
      aria-label="애니메이션 타임라인"
      style={placement === "drawer" && drawerPosition ? drawerPosition : undefined}
    >
      {placement === "drawer" ? (
        <button
          aria-expanded={isOpen}
          aria-label={`애니메이션 타임라인 ${isOpen ? "닫기" : "열기"}`}
          className="animation-flow-drawer-toggle"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          <span>애니메이션 타임라인</span>
        </button>
      ) : null}
      {placement === "drawer" && !isOpen ? null : (
        <>
      {placement === "drawer" ? (
        <header className="animation-flow-navigator-header">
          <button
            aria-label="애니메이션 타임라인 위치 이동"
            className="animation-flow-drawer-drag-handle"
            type="button"
            onPointerDown={startDrawerDrag}
          >
            <GripVertical aria-hidden="true" size={18} />
          </button>
        </header>
      ) : null}
      <p className="animation-flow-navigator-description">
        장표 또는 효과를 선택하면 해당 시점으로 이동합니다.
      </p>
      <div className="animation-flow-navigator-list">
        {flowSlides.map((slide) => {
          const isCurrentSlide = slide.slideIndex === props.currentSlideIndex;
          const isExpanded = expandedSlideIds.has(slide.slideId);
          return (
            <section
              className={`animation-flow-slide ${
                isCurrentSlide ? "animation-flow-slide-current" : ""
              }`}
              key={slide.slideId}
            >
              <div className="animation-flow-slide-header">
                <button
                  className="animation-flow-slide-target"
                  disabled={props.navigationPending}
                  type="button"
                  onClick={() =>
                    props.onNavigate({
                      kind: "slide",
                      stepIndex: 0,
                      targetSlideIndex: slide.slideIndex,
                    })
                  }
                >
                  <span>장표 {slide.slideIndex + 1}</span>
                  <strong>{slide.title}</strong>
                </button>
                <button
                  aria-expanded={isExpanded}
                  aria-label={`${slide.title} 애니메이션 목록 ${
                    isExpanded ? "접기" : "펼치기"
                  }`}
                  className="animation-flow-slide-toggle"
                  type="button"
                  onClick={() =>
                    setExpandedSlideIds((current) => {
                      const next = new Set(current);
                      if (next.has(slide.slideId)) next.delete(slide.slideId);
                      else next.add(slide.slideId);
                      return next;
                    })
                  }
                >
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>
              {isExpanded ? (
                <div className="animation-flow-steps">
                  {slide.isActivity ? (
                    <p className="animation-flow-empty">운영 상태를 유지한 채 장표만 이동합니다.</p>
                  ) : (
                    <>
                      {slide.entryEffects.length > 0 ? (
                        <div className="animation-flow-entry">
                          {slide.entryEffects.map((effect) => (
                            <button
                              key={effect.animationId}
                              disabled={props.navigationPending}
                              type="button"
                              onClick={() => props.onNavigate({
                                kind: "slide",
                                stepIndex: 0,
                                targetSlideIndex: slide.slideIndex,
                              })}
                            >
                              <span>슬라이드 시작</span>
                              <strong>{effect.label} · {effect.targetLabel}</strong>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {slide.steps.length === 0 ? (
                        <p className="animation-flow-empty">애니메이션 없음</p>
                      ) : (
                        slide.steps.flatMap((step) =>
                          step.effects.map((effect) => {
                            const stepState = getStepState({
                              currentSlideIndex: props.currentSlideIndex,
                              currentStepIndex: props.currentStepIndex,
                              occurrenceId: step.occurrenceId,
                              pendingOccurrenceIds: props.pendingOccurrenceIds,
                              slideIndex: slide.slideIndex,
                              stepIndex: step.stepIndex,
                            });
                            return (
                              <button
                                className={`animation-flow-step ${stepState}`}
                                disabled={props.navigationPending}
                                key={`${slide.slideId}-${step.stepIndex}-${effect.animationId}`}
                                type="button"
                                onClick={() =>
                                  props.onNavigate({
                                    kind: "animation-step",
                                    stepIndex: step.stepIndex,
                                    targetSlideIndex: slide.slideIndex,
                                  })
                                }
                              >
                                <span className="animation-flow-step-index">{step.stepIndex}</span>
                                <span>
                                  <strong>{step.triggerLabel}</strong>
                                  <small>{effect.label} · {effect.targetLabel}</small>
                                </span>
                                {isCurrentSlide ? (
                                  <em>
                                    {stepState === "current"
                                      ? "현재"
                                      : stepState === "pending"
                                        ? "대기"
                                        : step.stepIndex < props.currentStepIndex
                                          ? "완료"
                                          : "예정"}
                                  </em>
                                ) : null}
                              </button>
                            );
                          }),
                        )
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
        </>
      )}
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSlideTitle(slide: Slide) {
  return slide.title.trim() || `슬라이드 ${slide.order}`;
}

function getTriggerLabel(
  slide: Slide,
  animations: readonly PlannedSlideshowAnimation[],
) {
  const animationIds = new Set(animations.map((animation) => animation.animationId));
  const action = slide.actions.find(
    (candidate) =>
      candidate.effect.kind === "play-animation" &&
      animationIds.has(candidate.effect.animationId),
  );
  if (!action) return "클릭";
  if (action.trigger.kind === "cue") return `“${action.trigger.cue}” 발화`;
  const keywordId = action.trigger.keywordId;
  const keyword = slide.keywords.find((candidate) => candidate.keywordId === keywordId);
  return keyword ? `“${keyword.text}” 발화` : "키워드 발화";
}

function getTriggerOccurrenceId(
  slide: Slide,
  animations: readonly PlannedSlideshowAnimation[],
) {
  const animationIds = new Set(animations.map((animation) => animation.animationId));
  const action = slide.actions.find(
    (candidate) =>
      candidate.trigger.kind === "keyword-occurrence" &&
      candidate.effect.kind === "play-animation" &&
      animationIds.has(candidate.effect.animationId),
  );
  return action?.trigger.kind === "keyword-occurrence"
    ? action.trigger.occurrenceId
    : null;
}

function toFlowEffect(slide: Slide, animation: PlannedSlideshowAnimation) {
  const target = slide.elements.find((element) => element.elementId === animation.elementId);
  return {
    animationId: animation.animationId,
    label: formatAnimationType(animation.type),
    targetLabel: target ? getElementLabel(target.type) : "대상 요소 없음"
  };
}

function getElementLabel(type: Slide["elements"][number]["type"]) {
  const labels: Partial<Record<Slide["elements"][number]["type"], string>> = {
    chart: "차트", customShape: "도형", group: "그룹", image: "이미지",
    line: "선", rect: "도형", table: "표", text: "텍스트"
  };
  return labels[type] ?? "요소";
}

function formatAnimationType(type: PlannedSlideshowAnimation["type"]) {
  const labels: Record<PlannedSlideshowAnimation["type"], string> = {
    appear: "나타나기",
    disappear: "사라지기",
    "fade-in": "페이드 인",
    "fade-out": "페이드 아웃",
    rotate: "회전",
    "zoom-in": "확대",
    "zoom-out": "축소",
  };
  return labels[type];
}

function getStepState(input: {
  currentSlideIndex: number;
  currentStepIndex: number;
  occurrenceId?: string | null;
  pendingOccurrenceIds?: readonly string[];
  slideIndex: number;
  stepIndex: number;
}) {
  if (input.slideIndex !== input.currentSlideIndex) return "available";
  if (
    input.occurrenceId &&
    input.pendingOccurrenceIds?.includes(input.occurrenceId)
  ) {
    return "pending";
  }
  if (input.stepIndex === input.currentStepIndex) return "current";
  return input.stepIndex < input.currentStepIndex ? "completed" : "upcoming";
}
