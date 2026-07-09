import type { Deck, DeckElement, Slide } from "@orbit/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PresentationScreen } from "./PresentationScreen";
import {
  fetchOrCreateRehearsalDeck,
  getHighlightedKeywordOccurrencesForSlide,
} from "../rehearsal/RehearsalWorkspace";
import {
  getDeckTargetSeconds,
  getSlideTargetSeconds,
  type RehearsalTimingSnapshot,
  type TimingAdviceState,
} from "../rehearsal/panel/rehearsalTiming";
import { getNextPresenterStepState } from "../rehearsal/presenter/presenterStepNavigation";
import { createSlideshowAnimationPlan } from "../rehearsal/presenter/slideshowStepModel";
import { usePresenterKeyboard } from "../rehearsal/presenter/usePresenterKeyboard";
import { getTriggerAnimationIdsForSlide } from "../rehearsal/playback/triggeredActionPlayback";
import { createDefaultPhraseExtractor } from "../rehearsal/speech/phraseExtractor";
import type { SpeechTrackerSnapshot } from "../rehearsal/speech/speechTrackingEvents";
import {
  PresenterStatusShell,
  type PresenterInfoCardItem,
  type PresenterTimeMode,
} from "../presenter-shell/PresenterScaffold";

type PresentationPhase = "loading" | "ready" | "failed";

export function PresentationWorkspace(props: {
  fallbackDeck?: Deck;
  initialDeck?: Deck;
  initialSlideIndex?: number;
  initialStepIndex?: number;
  projectId?: string;
}) {
  const [deck, setDeck] = useState<Deck | null>(props.initialDeck ?? null);
  const [phase, setPhase] = useState<PresentationPhase>(
    props.initialDeck ? "ready" : "loading",
  );
  const [error, setError] = useState("");
  const [currentSlideIndex, setCurrentSlideIndex] = useState(
    props.initialSlideIndex ?? 0,
  );
  const [presenterStepIndex, setPresenterStepIndex] = useState(
    props.initialStepIndex ?? 0,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [slideElapsedSeconds, setSlideElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timeMode, setTimeMode] = useState<PresenterTimeMode>("timer");
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(
    props.initialDeck ? getDeckTargetSeconds(props.initialDeck) : 5 * 60,
  );
  const [elapsedTimeInput, setElapsedTimeInput] = useState("00:00");
  const [timerDurationInput, setTimerDurationInput] = useState(() =>
    formatClock(props.initialDeck ? getDeckTargetSeconds(props.initialDeck) : 5 * 60),
  );
  const [editingTimeField, setEditingTimeField] = useState<
    "elapsed" | "duration" | null
  >(null);
  const [hasManualTimerDuration, setHasManualTimerDuration] = useState(false);

  useEffect(() => {
    if (props.initialDeck) {
      return;
    }

    let isCancelled = false;
    setPhase("loading");
    void fetchOrCreateRehearsalDeck({
      fallbackDeck: props.fallbackDeck,
      projectId: props.projectId,
    })
      .then((nextDeck) => {
        if (isCancelled) {
          return;
        }

        setDeck(nextDeck);
        setPhase("ready");
      })
      .catch((cause) => {
        if (isCancelled) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "발표 자료를 불러오지 못했습니다.");
        setPhase("failed");
      });

    return () => {
      isCancelled = true;
    };
  }, [props.fallbackDeck, props.initialDeck, props.projectId]);

  useEffect(() => {
    if (!deck || hasManualTimerDuration) {
      return;
    }

    const nextSeconds = getDeckTargetSeconds(deck);
    setTimerDurationSeconds(nextSeconds);
    if (editingTimeField !== "duration") {
      setTimerDurationInput(formatClock(nextSeconds));
    }
  }, [deck, editingTimeField, hasManualTimerDuration]);

  useEffect(() => {
    if (!isTimerRunning) {
      return;
    }

    const timerId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
      setSlideElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isTimerRunning]);

  useEffect(() => {
    if (timeMode === "timer" && elapsedSeconds >= timerDurationSeconds) {
      setIsTimerRunning(false);
    }
  }, [elapsedSeconds, timeMode, timerDurationSeconds]);

  useEffect(() => {
    setSlideElapsedSeconds(0);
  }, [currentSlideIndex]);

  const displayedTimeSeconds =
    timeMode === "timer"
      ? Math.max(timerDurationSeconds - elapsedSeconds, 0)
      : elapsedSeconds;

  useEffect(() => {
    if (editingTimeField !== "elapsed") {
      setElapsedTimeInput(formatClock(displayedTimeSeconds));
    }
  }, [displayedTimeSeconds, editingTimeField]);

  useEffect(() => {
    if (editingTimeField !== "duration") {
      setTimerDurationInput(formatClock(timerDurationSeconds));
    }
  }, [editingTimeField, timerDurationSeconds]);

  const currentSlide = deck?.slides[currentSlideIndex] ?? null;
  const nextSlide = deck?.slides[currentSlideIndex + 1] ?? null;
  const triggerAnimationIds = useMemo(
    () => (currentSlide ? getTriggerAnimationIdsForSlide(currentSlide) : []),
    [currentSlide],
  );
  const slideshowAnimationPlan = useMemo(
    () =>
      currentSlide
        ? createSlideshowAnimationPlan({
            slide: currentSlide,
            triggerAnimationIds,
          })
        : null,
    [currentSlide, triggerAnimationIds],
  );
  const currentSlideTargetSeconds =
    deck && currentSlide ? getSlideTargetSeconds(deck, currentSlide) : 0;
  const timing: RehearsalTimingSnapshot = deck && currentSlide
    ? {
        currentSlideElapsedSeconds: slideElapsedSeconds,
        currentSlideOvertime:
          currentSlideTargetSeconds > 0 &&
          slideElapsedSeconds > currentSlideTargetSeconds,
        currentSlideTargetSeconds,
        deckTargetSeconds: timerDurationSeconds,
        elapsedSeconds,
        remainingSeconds: timerDurationSeconds - elapsedSeconds,
      }
    : {
        currentSlideElapsedSeconds: 0,
        currentSlideOvertime: false,
        currentSlideTargetSeconds: 0,
        deckTargetSeconds: timerDurationSeconds,
        elapsedSeconds,
        remainingSeconds: timerDurationSeconds - elapsedSeconds,
      };
  const adviceState: TimingAdviceState = {
    pace: "normal",
    slideOvertime: timing.currentSlideOvertime,
  };
  const sentences = useMemo(
    () =>
      currentSlide
        ? createDefaultPhraseExtractor({
            controlPhrases: [],
            keywordTerms: (currentSlide.keywords ?? []).flatMap((keyword) => [
              keyword.text,
              ...keyword.synonyms,
              ...keyword.abbreviations,
            ]),
          }).extract(currentSlide.speakerNotes)
        : [],
    [currentSlide],
  );
  const panelSnapshot = useMemo(
    () =>
      createEmptySpeechTrackerSnapshot({
        matchableSentenceCount: sentences.filter((sentence) => sentence.matchable).length,
        slideId: currentSlide?.slideId ?? "presentation-empty",
      }),
    [currentSlide?.slideId, sentences],
  );
  const checklistKeywords = currentSlide?.keywords ?? [];
  const highlightedKeywordOccurrences = useMemo(
    () => getHighlightedKeywordOccurrencesForSlide(currentSlide),
    [currentSlide],
  );
  const rehearsalProgressPercent =
    timerDurationSeconds > 0
      ? Math.min(100, Math.max(0, (elapsedSeconds / timerDurationSeconds) * 100))
      : 0;
  const presentationStatusLabel = isTimerRunning ? "발표 진행 중" : "발표 준비";
  const miniSlideScale = deck ? getMiniSlideScale(deck) : 0.14;
  const { presenterScale, presenterStageRef } = usePresenterStageScale(deck);
  const infoCards: PresenterInfoCardItem[] = [
    {
      detail: currentSlide ? getSlideTitle(currentSlide) : "-",
      label: "현재 슬라이드",
      value: `슬라이드 ${currentSlideIndex + 1} / ${deck?.slides.length ?? 0}`,
    },
    {
      detail: timing.currentSlideOvertime
        ? "현재 슬라이드 시간 초과"
        : "현재 슬라이드 시간 정상",
      label: "발표 상태",
      value: isTimerRunning ? "진행 중" : "대기 중",
      variantClassName: "rehearsal-side-advice-card",
    },
  ];
  const nextHint = nextSlide?.keywords?.[0]
    ? `다음 키워드 "${nextSlide.keywords[0].text}"를 확인하세요`
    : "마지막 슬라이드를 마무리할 흐름을 점검하세요";

  const goPrevious = useCallback(() => {
    setPresenterStepIndex(0);
    setCurrentSlideIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    if (!deck) {
      return;
    }

    setPresenterStepIndex(0);
    setCurrentSlideIndex((current) => Math.min(deck.slides.length - 1, current + 1));
  }, [deck]);

  const handleNextPresenterStep = useCallback(() => {
    if (!deck || !slideshowAnimationPlan) {
      return;
    }

    const nextState = getNextPresenterStepState({
      currentSlideIndex,
      currentStepIndex: presenterStepIndex,
      maxStepIndex: slideshowAnimationPlan.maxStepIndex,
      slideCount: deck.slides.length,
    });
    setPresenterStepIndex(nextState.stepIndex);
    setCurrentSlideIndex(nextState.slideIndex);
  }, [currentSlideIndex, deck, presenterStepIndex, slideshowAnimationPlan]);

  usePresenterKeyboard({
    enabled: Boolean(deck),
    onNextStep: handleNextPresenterStep,
    onPreviousSlide: goPrevious,
  });

  function handleTimePrimaryAction() {
    if (isTimerRunning) {
      setIsTimerRunning(false);
      return;
    }

    if (timeMode === "timer" && elapsedSeconds >= timerDurationSeconds) {
      resetPresentationTimerState({
        setElapsedSeconds,
        setIsTimerRunning,
        setSlideElapsedSeconds,
      });
    }

    setIsTimerRunning(true);
  }

  function commitElapsedTimeInput(value: string) {
    const nextSeconds = parseClockInput(value);
    setEditingTimeField(null);

    if (nextSeconds === null) {
      setElapsedTimeInput(formatClock(displayedTimeSeconds));
      return;
    }

    const boundedSeconds = Math.min(nextSeconds, 60 * 60 * 24 - 1);
    setElapsedSeconds(
      timeMode === "timer"
        ? Math.max(timerDurationSeconds - boundedSeconds, 0)
        : boundedSeconds,
    );
  }

  function commitTimerDurationInput(value: string) {
    const nextSeconds = parseClockInput(value);
    setEditingTimeField(null);

    if (nextSeconds === null || nextSeconds <= 0) {
      setTimerDurationInput(formatClock(timerDurationSeconds));
      return;
    }

    const boundedSeconds = Math.min(nextSeconds, 60 * 60 * 24 - 1);
    setHasManualTimerDuration(true);
    setTimerDurationSeconds(boundedSeconds);
  }

  if (phase === "failed") {
    return (
      <PresenterStatusShell
        action={
          <button
            className="rehearsal-exit-button"
            type="button"
            onClick={() => navigateToProject(deck?.projectId ?? props.projectId)}
          >
            프로젝트로 돌아가기
          </button>
        }
        title="발표 화면을 열지 못했습니다."
      >
        {error || "발표 자료를 불러오지 못했습니다."}
      </PresenterStatusShell>
    );
  }

  if (phase === "loading" && !deck) {
    return (
      <PresenterStatusShell title="발표 화면을 준비하는 중입니다.">
        최신 슬라이드와 발표 메모를 불러오고 있습니다.
      </PresenterStatusShell>
    );
  }

  return (
    <PresentationScreen
      adviceState={adviceState}
      currentSlide={currentSlide}
      currentSlideIndex={currentSlideIndex}
      deck={deck}
      elapsedTimeInput={elapsedTimeInput}
      highlightedKeywordOccurrences={highlightedKeywordOccurrences}
      infoCards={infoCards}
      isTimerRunning={isTimerRunning}
      keywords={checklistKeywords}
      miniSlideScale={miniSlideScale}
      nextHint={nextHint}
      nextSlide={nextSlide}
      onDurationInputBlur={commitTimerDurationInput}
      onDurationInputChange={(value) => {
        setEditingTimeField("duration");
        setTimerDurationInput(value);
      }}
      onDurationInputFocus={() => setEditingTimeField("duration")}
      onElapsedInputBlur={commitElapsedTimeInput}
      onElapsedInputChange={(value) => {
        setEditingTimeField("elapsed");
        setElapsedTimeInput(value);
      }}
      onElapsedInputFocus={() => setEditingTimeField("elapsed")}
      onExit={() => navigateToProject(deck?.projectId ?? props.projectId)}
      onNext={goNext}
      onPrevious={goPrevious}
      onPrimaryAction={handleTimePrimaryAction}
      onReset={() =>
        resetPresentationTimerState({
          setElapsedSeconds,
          setIsTimerRunning,
          setSlideElapsedSeconds,
        })
      }
      onTimeModeChange={(value) => {
        setTimeMode(value);
        resetPresentationTimerState({
          setElapsedSeconds,
          setIsTimerRunning,
          setSlideElapsedSeconds,
        });
      }}
      panelSnapshot={panelSnapshot}
      presenterScale={presenterScale}
      presenterStageRef={presenterStageRef}
      presenterStepIndex={presenterStepIndex}
      progressPercent={rehearsalProgressPercent}
      sentences={sentences}
      stageEmptyLabel="발표 자료를 불러오는 중입니다."
      stageIndexLabel={
        deck
          ? `${String(currentSlideIndex + 1).padStart(2, "0")} / ${String(
              deck.slides.length,
            ).padStart(2, "0")}`
          : undefined
      }
      statusLabel={presentationStatusLabel}
      timeInputValue={
        editingTimeField === "duration"
          ? timerDurationInput
          : formatClock(displayedTimeSeconds)
      }
      timeMetaLeft={`현재 ${formatClock(timing.currentSlideElapsedSeconds)}`}
      timeMetaRight={`예상 ${formatClock(timing.currentSlideTargetSeconds)}`}
      timeMode={timeMode}
      timing={timing}
      timerDurationInput={timerDurationInput}
      totalSlides={deck?.slides.length ?? 0}
      triggerAnimationIds={triggerAnimationIds}
    />
  );
}

function navigateToProject(projectId?: string) {
  if (!projectId || typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", `/project/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function createEmptySpeechTrackerSnapshot(options: {
  matchableSentenceCount: number;
  slideId: string;
}): SpeechTrackerSnapshot {
  return {
    coveredSentenceIds: [],
    coveredSentenceMatchKinds: {},
    effectiveCoverage: 0,
    finalSentenceSpoken: false,
    hitKeywordIds: [],
    matchableSentenceCount: options.matchableSentenceCount,
    provisionalMissingKeywordIds: [],
    sentenceCoverage: 0,
    slideId: options.slideId,
    wordCoverage: 0,
  };
}

function getMiniSlideScale(deck: Deck) {
  return Math.min(0.16, 154 / deck.canvas.width, 87 / deck.canvas.height);
}

function getSlideTitle(slide: Slide) {
  const title = slide.title.trim();
  if (title) {
    return title;
  }

  const titleElement = slide.elements.find(
    (element): element is Extract<DeckElement, { type: "text" }> =>
      element.type === "text" && element.role === "title",
  );
  return titleElement?.props.text || `Slide ${slide.order}`;
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseClockInput(value: string): number | null {
  const normalizedValue = value.trim();
  const match = normalizedValue.match(/^(\d{1,3})(?::([0-5]?\d))?$/);

  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2] ?? 0);

  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) {
    return null;
  }

  return minutes * 60 + seconds;
}

function resetPresentationTimerState(actions: {
  setElapsedSeconds: (value: number) => void;
  setIsTimerRunning: (value: boolean) => void;
  setSlideElapsedSeconds: (value: number) => void;
}) {
  actions.setElapsedSeconds(0);
  actions.setSlideElapsedSeconds(0);
  actions.setIsTimerRunning(false);
}

function usePresenterStageScale(deck: Deck | null) {
  const [presenterStageElement, setPresenterStageElement] =
    useState<HTMLDivElement | null>(null);
  const [presenterScale, setPresenterScale] = useState(0.44);
  const presenterStageRef = useCallback((node: HTMLDivElement | null) => {
    setPresenterStageElement(node);
  }, []);

  useEffect(() => {
    const stage = presenterStageElement;
    if (!stage || !deck) {
      return;
    }

    let animationFrame: number | null = null;

    const updateScale = () => {
      const bounds = stage.getBoundingClientRect();
      const style = window.getComputedStyle(stage);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const availableWidth = Math.max(0, bounds.width - horizontalPadding);
      const availableHeight = Math.max(0, bounds.height - verticalPadding);
      const nextScale = Math.min(
        availableWidth / deck.canvas.width,
        availableHeight / deck.canvas.height,
      );
      if (Number.isFinite(nextScale) && nextScale > 0) {
        setPresenterScale((current) =>
          Math.abs(current - nextScale) > 0.001 ? nextScale : current,
        );
      }
    };
    const scheduleScaleUpdate = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(updateScale);
    };

    updateScale();
    scheduleScaleUpdate();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleScaleUpdate);
      return () => {
        window.removeEventListener("resize", scheduleScaleUpdate);
        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
        }
      };
    }

    const observer = new ResizeObserver(scheduleScaleUpdate);
    observer.observe(stage);
    window.addEventListener("resize", scheduleScaleUpdate);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleScaleUpdate);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [deck, presenterStageElement]);

  return { presenterScale, presenterStageRef };
}
