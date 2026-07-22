import type { Deck, Slide } from "@orbit/shared";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "../../../rehearsal/presenter/useReducedMotion";
import { useSlideshowTransitions } from "../../../rehearsal/presenter/useSlideshowTransitions";
import { ReadOnlySlideCanvas } from "../../../slides/rendering";
import {
  createMotionProposalPreviewModel,
  formatMotionProposalSummary,
} from "./motionProposalPreviewModel";

export function MotionProposalPreview(props: {
  deck: Deck;
  slide: Slide;
}) {
  const model = useMemo(
    () => createMotionProposalPreviewModel(props.slide),
    [props.slide],
  );
  const systemReducedMotion = useReducedMotion();
  const [previewReducedMotion, setPreviewReducedMotion] = useState(false);
  const reducedMotion = systemReducedMotion || previewReducedMotion;
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSession, setPlaybackSession] = useState(0);
  const maxStepIndex = model.slideshowPlan.maxStepIndex;

  useEffect(() => {
    if (!isPlaying) return;
    const durationMs = reducedMotion
      ? 600
      : Math.max(
          1,
          stepIndex === 0
            ? model.slideshowPlan.entryDurationMs
            : model.slideshowPlan.triggerSteps[stepIndex - 1]?.durationMs ?? 1,
        );
    const timer = window.setTimeout(() => {
      if (stepIndex >= maxStepIndex) {
        setIsPlaying(false);
        return;
      }
      setStepIndex((current) => Math.min(maxStepIndex, current + 1));
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, maxStepIndex, model, reducedMotion, stepIndex]);

  const currentAnimations =
    stepIndex === 0
      ? model.slideshowPlan.entryAnimations
      : model.slideshowPlan.triggerSteps[stepIndex - 1]?.animations ?? [];
  const currentTargetIds = [...new Set(
    currentAnimations.map((animation) => animation.elementId),
  )];
  const scale = Math.min(0.44, 560 / props.deck.canvas.width);
  const currentLabel =
    stepIndex === 0
      ? "진입"
      : `클릭 ${stepIndex}/${model.slideshowPlan.maxStepIndex}`;

  const play = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (stepIndex >= maxStepIndex) {
      setStepIndex(0);
    }
    setPlaybackSession((session) => session + 1);
    setIsPlaying(true);
  };

  const moveTo = (nextStepIndex: number, resetSession = false) => {
    setIsPlaying(false);
    setStepIndex(Math.min(maxStepIndex, Math.max(0, nextStepIndex)));
    if (resetSession) setPlaybackSession((session) => session + 1);
  };

  return (
    <section className="motion-proposal-preview" aria-label="Motion 제안 미리보기">
      <header className="motion-proposal-preview-header">
        <div>
          <strong>Motion 흐름 미리보기</strong>
          <span>{formatMotionProposalSummary(model)}</span>
        </div>
        <span className="motion-proposal-step" aria-live="polite">
          {currentLabel}
        </span>
      </header>

      <div className="motion-proposal-canvas">
        <MotionPreviewCanvas
          key={playbackSession}
          deck={props.deck}
          highlights={currentTargetIds}
          playInitialEntryAnimations={isPlaying && stepIndex === 0}
          reducedMotion={reducedMotion}
          scale={scale}
          slide={props.slide}
          stepIndex={stepIndex}
          triggerAnimationIds={model.triggerAnimationIds}
        />
      </div>

      <div className="motion-proposal-controls">
        <button
          aria-label="처음으로"
          type="button"
          onClick={() => moveTo(0, true)}
        >
          <IconRefresh aria-hidden="true" size={17} />
          처음으로
        </button>
        <button
          aria-label="이전 beat"
          disabled={stepIndex === 0}
          type="button"
          onClick={() => moveTo(stepIndex - 1)}
        >
          <IconChevronLeft aria-hidden="true" size={18} />
        </button>
        <button className="primary" type="button" onClick={play}>
          {isPlaying ? (
            <IconPlayerPause aria-hidden="true" size={18} />
          ) : (
            <IconPlayerPlay aria-hidden="true" size={18} />
          )}
          {isPlaying ? "일시정지" : "재생"}
        </button>
        <button
          aria-label="다음 beat"
          disabled={stepIndex === maxStepIndex}
          type="button"
          onClick={() => moveTo(stepIndex + 1)}
        >
          <IconChevronRight aria-hidden="true" size={18} />
        </button>
        <button
          aria-pressed={reducedMotion}
          className="motion-proposal-reduced-motion"
          disabled={systemReducedMotion}
          type="button"
          onClick={() => setPreviewReducedMotion((enabled) => !enabled)}
        >
          {reducedMotion ? "동작 줄임 켜짐" : "동작 줄이기"}
        </button>
      </div>

      <p className="motion-proposal-targets" aria-live="polite">
        {currentTargetIds.length > 0
          ? `현재 대상 ${currentTargetIds.length}개`
          : "현재 beat에 표시할 대상이 없습니다."}
        {systemReducedMotion
          ? " 시스템의 동작 줄이기 설정을 따릅니다."
          : reducedMotion
            ? " tween 없이 최종 상태로 전환합니다."
            : " 강조 테두리로 현재 대상을 표시합니다."}
      </p>
    </section>
  );
}

function MotionPreviewCanvas(props: {
  deck: Deck;
  highlights: string[];
  playInitialEntryAnimations: boolean;
  reducedMotion: boolean;
  scale: number;
  slide: Slide;
  stepIndex: number;
  triggerAnimationIds: string[];
}) {
  const playback = useSlideshowTransitions({
    deck: props.deck,
    playInitialEntryAnimations: props.playInitialEntryAnimations,
    reducedMotion: props.reducedMotion,
    slide: props.slide,
    stepIndex: props.stepIndex,
    triggerAnimationIds: props.triggerAnimationIds,
  });

  return (
    <ReadOnlySlideCanvas
      deck={props.deck}
      elementStates={playback.elementStates}
      highlights={props.highlights.map((elementId) => ({
        active: true,
        elementId,
      }))}
      scale={props.scale}
      slide={props.slide}
    />
  );
}
