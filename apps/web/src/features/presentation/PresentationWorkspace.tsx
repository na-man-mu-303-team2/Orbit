import {
  createSlidePlaybackState,
  type SlidePlaybackState,
} from "@orbit/editor-core";
import type {
  Deck,
  DeckElement,
  PresentationRecordingMode,
  Slide,
  SlideTranscriptSnapshot,
} from "@orbit/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrbitButton, OrbitFailureState } from "../../components/ui";
import { PresentationScreen } from "./PresentationScreen";
import { PresentationCompletionDialog } from "./PresentationCompletionDialog";
import { PresentationMicCheckModal } from "./PresentationMicCheckModal";
import {
  completePresentationWithoutAudio,
  createPresentationRuntime,
  fetchOrCreatePresentationDeck,
  uploadPresentationRecording,
  type PresentationRuntimeIdentity,
} from "./presentationApi";
import {
  createPresentationRecordingSession,
  type PresentationRecordingSession,
} from "./presentationRecording";
import { usePresentationSpeech } from "./usePresentationSpeech";
import { getPresentationHighlightedKeywordOccurrences } from "./presentationKeywordOccurrences";
import { getPresentationFailureCopy } from "./presentationFailureCopy";
import {
  shouldWarnBeforePresentationUnload,
  type PresentationRuntimePhase,
} from "./presentationLifecycle";
import { activityApi } from "../activity-slides/api/activityApi";
import { prepareActivityQrRuns } from "../activity-slides/model/activityQrElements";
import {
  getRehearsalMicrophoneAudioConstraints,
  readRehearsalMicrophoneDeviceId,
} from "../presenter-shell/microphoneSettings";
import {
  getDeckTargetSeconds,
  getSlideTargetSeconds,
  type RehearsalTimingSnapshot,
  type TimingAdviceState,
} from "../rehearsal/panel/rehearsalTiming";
import { getNextPresenterStepState } from "../rehearsal/presenter/presenterStepNavigation";
import { createSlideshowAnimationPlan } from "../rehearsal/presenter/slideshowStepModel";
import { usePresenterKeyboard } from "../rehearsal/presenter/usePresenterKeyboard";
import {
  getTriggerAnimationIdsForSlide,
  resolveKeywordTriggeredActions,
  resolveTriggeredActionPlaybackUpdate,
} from "../rehearsal/playback/triggeredActionPlayback";
import { AutoAdvanceStatus } from "../rehearsal/advance/AutoAdvanceStatus";
import {
  defaultAutoAdvanceConfig,
  defaultAutoAdvancePolicy,
} from "../rehearsal/advance/autoAdvanceConfig";
import {
  cancelAdvanceCountdown,
  createInitialAdvanceControllerState,
  evaluateAdvanceController,
  resetAdvanceControllerForSlide,
  type AdvanceControllerState,
} from "../rehearsal/advance/advanceController";
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
    formatClock(
      props.initialDeck ? getDeckTargetSeconds(props.initialDeck) : 5 * 60,
    ),
  );
  const [editingTimeField, setEditingTimeField] = useState<
    "elapsed" | "duration" | null
  >(null);
  const [hasManualTimerDuration, setHasManualTimerDuration] = useState(false);
  const requiresPresentationRuntime = Boolean(
    props.projectId && !props.initialDeck,
  );
  const [runtimePhase, setRuntimePhase] = useState<PresentationRuntimePhase>(
    requiresPresentationRuntime ? "preflight" : "active",
  );
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeFailureOperation, setRuntimeFailureOperation] = useState<
    "start" | "finish" | null
  >(null);
  const [requestedRecordingMode, setRequestedRecordingMode] =
    useState<PresentationRecordingMode>("microphone");
  const runtimeRef = useRef<PresentationRuntimeIdentity | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<PresentationRecordingSession | null>(null);
  const recordedFileRef = useRef<File | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const finishPromiseRef = useRef<Promise<void> | null>(null);
  const slideTranscriptSnapshotsRef = useRef<SlideTranscriptSnapshot[]>([]);
  const slideTranscriptVisitVersionsRef = useRef<Map<string, number>>(
    new Map(),
  );
  const activeSlideTranscriptVisitRef = useRef<{
    slideId: string;
    slideNum: number;
    visitedAt: string;
    visitedVer: number;
  } | null>(null);
  const previousSlideIndexRef = useRef(currentSlideIndex);
  const playbackStateRef = useRef<SlidePlaybackState>(
    createSlidePlaybackState(),
  );
  const previousHitKeywordIdsRef = useRef<Set<string>>(new Set());
  const advanceControllerStateRef = useRef<AdvanceControllerState>(
    createInitialAdvanceControllerState(),
  );
  const finalSentenceCommittedAtMsRef = useRef<number | null>(null);
  const finalSentenceSpokenAtMsRef = useRef<number | null>(null);
  const [advanceControllerState, setAdvanceControllerState] =
    useState<AdvanceControllerState>(() =>
      createInitialAdvanceControllerState(),
    );
  const [autoAdvanceNowMs, setAutoAdvanceNowMs] = useState(0);
  const speech = usePresentationSpeech(props.projectId);

  useEffect(() => {
    if (props.initialDeck) {
      return;
    }

    let isCancelled = false;
    setPhase("loading");
    void fetchOrCreatePresentationDeck({
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

        setError(
          cause instanceof Error
            ? cause.message
            : "발표 자료를 불러오지 못했습니다.",
        );
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
  useEffect(() => {
    if (runtimePhase !== "active" || !currentSlide) {
      previousSlideIndexRef.current = currentSlideIndex;
      return;
    }
    if (previousSlideIndexRef.current !== currentSlideIndex) {
      captureSlideTranscriptSnapshot("slide-change");
      beginSlideTranscriptVisit(currentSlide, currentSlideIndex);
      previousSlideIndexRef.current = currentSlideIndex;
    }
  }, [currentSlide, currentSlideIndex, runtimePhase]);
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
  const timing: RehearsalTimingSnapshot =
    deck && currentSlide
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
  const panelSnapshot = useMemo(() => {
    if (
      speech.state.snapshot &&
      speech.state.snapshot.slideId === currentSlide?.slideId
    ) {
      return speech.state.snapshot;
    }
    return createEmptySpeechTrackerSnapshot({
      matchableSentenceCount: sentences.filter((sentence) => sentence.matchable)
        .length,
      slideId: currentSlide?.slideId ?? "presentation-empty",
    });
  }, [currentSlide?.slideId, sentences, speech.state.snapshot]);
  const checklistKeywords = currentSlide?.keywords ?? [];
  const highlightedKeywordOccurrences = useMemo(
    () => getPresentationHighlightedKeywordOccurrences(currentSlide),
    [currentSlide],
  );
  const rehearsalProgressPercent =
    timerDurationSeconds > 0
      ? Math.min(
          100,
          Math.max(0, (elapsedSeconds / timerDurationSeconds) * 100),
        )
      : 0;
  const presentationStatusLabel =
    runtimePhase === "finishing"
      ? "발표 저장 중"
      : speech.state.status === "paused"
        ? "발표 일시정지"
        : isTimerRunning
          ? "발표 진행 중"
          : "발표 준비";
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

  const cancelAutoAdvanceForManualCommand = useCallback(() => {
    const result = cancelAdvanceCountdown(
      advanceControllerStateRef.current,
      "manual",
    );
    advanceControllerStateRef.current = result.state;
    setAdvanceControllerState(result.state);
  }, []);

  const goPrevious = useCallback(() => {
    cancelAutoAdvanceForManualCommand();
    setPresenterStepIndex(0);
    setCurrentSlideIndex((current) => Math.max(0, current - 1));
  }, [cancelAutoAdvanceForManualCommand]);

  const goNext = useCallback(() => {
    if (!deck) {
      return;
    }

    cancelAutoAdvanceForManualCommand();
    setPresenterStepIndex(0);
    setCurrentSlideIndex((current) =>
      Math.min(deck.slides.length - 1, current + 1),
    );
  }, [cancelAutoAdvanceForManualCommand, deck]);

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
    enabled: Boolean(deck) && runtimePhase === "active",
    onNextStep: handleNextPresenterStep,
    onPreviousSlide: goPrevious,
  });

  useEffect(() => {
    previousHitKeywordIdsRef.current = new Set();
    playbackStateRef.current = createSlidePlaybackState();
    finalSentenceCommittedAtMsRef.current = null;
    finalSentenceSpokenAtMsRef.current = null;
    const nextAdvanceState = currentSlide
      ? resetAdvanceControllerForSlide(currentSlide.slideId)
      : createInitialAdvanceControllerState();
    advanceControllerStateRef.current = nextAdvanceState;
    setAdvanceControllerState(nextAdvanceState);
    if (currentSlide && speech.state.status === "listening") {
      speech.enterSlide(currentSlide);
    }
  }, [currentSlide, speech.enterSlide, speech.state.status]);

  useEffect(() => {
    if (runtimePhase !== "active" || speech.state.status !== "listening") {
      return;
    }

    const timer = window.setInterval(
      () => setAutoAdvanceNowMs(Date.now()),
      250,
    );
    return () => window.clearInterval(timer);
  }, [runtimePhase, speech.state.status]);

  useEffect(() => {
    if (
      !deck ||
      !currentSlide ||
      !slideshowAnimationPlan ||
      runtimePhase !== "active" ||
      speech.state.status !== "listening"
    ) {
      return;
    }

    const nowMs = autoAdvanceNowMs || Date.now();
    if (panelSnapshot.finalSentenceCommitted === true) {
      finalSentenceCommittedAtMsRef.current ??= nowMs;
    } else {
      finalSentenceCommittedAtMsRef.current = null;
    }
    if (panelSnapshot.finalSentenceSpoken) {
      finalSentenceSpokenAtMsRef.current ??=
        speech.state.lastTranscriptActivityAtMs ?? nowMs;
    } else {
      finalSentenceSpokenAtMsRef.current = null;
    }

    const lastActivityAtMs = speech.state.lastTranscriptActivityAtMs;
    const silenceDurationMs = lastActivityAtMs
      ? Math.max(0, nowMs - lastActivityAtMs)
      : 0;
    const result = evaluateAdvanceController(
      advanceControllerStateRef.current,
      {
        effectiveCoverage: panelSnapshot.effectiveCoverage,
        finalSentenceCommitted: panelSnapshot.finalSentenceCommitted === true,
        finalSentenceCommittedAtMs: finalSentenceCommittedAtMsRef.current,
        finalSentenceSpoken: panelSnapshot.finalSentenceSpoken,
        finalSentenceSpokenAtMs: finalSentenceSpokenAtMsRef.current,
        isLastSlide: currentSlideIndex >= deck.slides.length - 1,
        mode: "live",
        nowMs,
        pause: {
          isPaused:
            lastActivityAtMs !== null &&
            silenceDurationMs >= presentationAutoAdvancePolicy.pauseMs,
          silenceDurationMs,
        },
        policy: presentationAutoAdvancePolicy,
        remainingTriggerSteps: Math.max(
          0,
          slideshowAnimationPlan.maxStepIndex - presenterStepIndex,
        ),
        semanticAutoActionAllowed: true,
        slideId: currentSlide.slideId,
      },
      defaultAutoAdvanceConfig,
    );
    advanceControllerStateRef.current = result.state;
    setAdvanceControllerState(result.state);

    if (result.commands.some((command) => command.type === "advance-slide")) {
      setPresenterStepIndex(0);
      setCurrentSlideIndex((current) =>
        Math.min(deck.slides.length - 1, current + 1),
      );
    }
  }, [
    autoAdvanceNowMs,
    currentSlide,
    currentSlideIndex,
    deck,
    panelSnapshot.effectiveCoverage,
    panelSnapshot.finalSentenceCommitted,
    panelSnapshot.finalSentenceSpoken,
    presenterStepIndex,
    runtimePhase,
    slideshowAnimationPlan,
    speech.state.lastTranscriptActivityAtMs,
    speech.state.status,
  ]);

  useEffect(() => {
    if (!currentSlide || !slideshowAnimationPlan || runtimePhase !== "active") {
      return;
    }

    const nextHitIds = new Set(panelSnapshot.hitKeywordIds);
    const newlyHitIds = panelSnapshot.hitKeywordIds.filter(
      (keywordId) => !previousHitKeywordIdsRef.current.has(keywordId),
    );
    previousHitKeywordIdsRef.current = nextHitIds;

    for (const keywordId of newlyHitIds) {
      const actions = resolveKeywordTriggeredActions(currentSlide, keywordId);
      if (actions.length === 0) {
        continue;
      }
      const update = resolveTriggeredActionPlaybackUpdate({
        actions,
        playbackState: playbackStateRef.current,
        presenterStepIndex,
        slide: currentSlide,
        slideAnimationPlan: slideshowAnimationPlan,
      });
      playbackStateRef.current = update.playbackState;
      if (update.shouldAdvanceSlide) {
        goNext();
        return;
      }
      if (update.presenterStepIndex !== presenterStepIndex) {
        setPresenterStepIndex(update.presenterStepIndex);
      }
    }
  }, [
    currentSlide,
    goNext,
    panelSnapshot.hitKeywordIds,
    presenterStepIndex,
    runtimePhase,
    slideshowAnimationPlan,
  ]);

  useEffect(() => {
    if (!shouldWarnBeforePresentationUnload(runtimePhase)) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [runtimePhase]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function startPresentation(recordingMode: PresentationRecordingMode) {
    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }

    const promise = (async () => {
      if (!deck || !currentSlide || !props.projectId) {
        throw new Error("발표 자료가 준비되지 않았습니다.");
      }
      setRuntimePhase("starting");
      setRuntimeError("");
      setRuntimeFailureOperation(null);
      setRequestedRecordingMode(recordingMode);

      const runtime =
        runtimeRef.current ??
        (await createPresentationRuntime({
          deckId: deck.deckId,
          deckVersion: deck.version,
          projectId: props.projectId,
          recordingMode,
        }));
      runtimeRef.current = runtime;

      if (runtime.status !== "created") {
        navigateToPresentationReport({
          projectId: props.projectId,
          runId: runtime.runId,
          sessionId: runtime.sessionId,
        });
        return;
      }

      await prepareActivityQrRuns({
        deck,
        projectId: props.projectId,
        sessionId: runtime.sessionId,
      });

      setRequestedRecordingMode(runtime.recordingMode);

      if (runtime.recordingMode === "microphone") {
        const deviceId = readRehearsalMicrophoneDeviceId();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...getRehearsalMicrophoneAudioConstraints(),
            ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
          },
          video: false,
        });
        streamRef.current = stream;
        recordingRef.current = createPresentationRecordingSession(stream);
        await speech.start(stream, currentSlide);
      }

      resetSlideTranscriptSnapshots(deck, currentSlideIndex);

      setElapsedSeconds(0);
      setSlideElapsedSeconds(0);
      setIsTimerRunning(true);
      setRuntimePhase("active");
    })()
      .catch(async (cause) => {
        await speech.stop().catch(() => undefined);
        if (recordingRef.current) {
          await recordingRef.current.stop().catch(() => undefined);
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recordingRef.current = null;
        runtimeRef.current = null;
        setRuntimeError(
          cause instanceof Error
            ? cause.message
            : "실전 발표를 시작하지 못했습니다.",
        );
        setRuntimeFailureOperation("start");
        setRuntimePhase("failed");
      })
      .finally(() => {
        startPromiseRef.current = null;
      });
    startPromiseRef.current = promise;
    return promise;
  }

  function finishPresentation() {
    if (finishPromiseRef.current) {
      return finishPromiseRef.current;
    }

    const promise = (async () => {
      const runtime = runtimeRef.current;
      if (!runtime || !props.projectId) {
        navigateToProject(deck?.projectId ?? props.projectId);
        return;
      }
      setRuntimePhase("finishing");
      setRuntimeError("");
      setRuntimeFailureOperation(null);
      setIsTimerRunning(false);
      captureSlideTranscriptSnapshot("rehearsal-end");
      const liveTranscript = speech.getTranscript();
      await speech.stop();

      if (recordingRef.current && !recordedFileRef.current) {
        recordedFileRef.current = await recordingRef.current.stop();
        recordingRef.current = null;
      }
      if (recordedFileRef.current && recordedFileRef.current.size > 0) {
        await uploadPresentationRecording({
          file: recordedFileRef.current,
          liveTranscript,
          projectId: props.projectId,
          runId: runtime.runId,
          sessionId: runtime.sessionId,
          slideTranscriptSnapshots: slideTranscriptSnapshotsRef.current,
        });
      } else {
        await completePresentationWithoutAudio({
          projectId: props.projectId,
          runId: runtime.runId,
          sessionId: runtime.sessionId,
        });
      }
      await activityApi.closeSession(props.projectId, runtime.sessionId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRuntimePhase("completed");
    })()
      .catch((cause) => {
        setRuntimeError(
          cause instanceof Error
            ? cause.message
            : "발표 기록을 저장하지 못했습니다.",
        );
        setRuntimeFailureOperation("finish");
        setRuntimePhase("failed");
      })
      .finally(() => {
        finishPromiseRef.current = null;
      });
    finishPromiseRef.current = promise;
    return promise;
  }

  function requestPresentationExit() {
    if (!requiresPresentationRuntime) {
      navigateToProject(deck?.projectId ?? props.projectId);
      return;
    }
    if (!window.confirm("발표를 종료하고 결과를 저장할까요?")) {
      return;
    }
    void finishPresentation();
  }

  async function handleTimePrimaryAction() {
    if (isTimerRunning) {
      setIsTimerRunning(false);
      recordingRef.current?.pause();
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      await speech.pause().catch(() => undefined);
      return;
    }

    if (timeMode === "timer" && elapsedSeconds >= timerDurationSeconds) {
      resetPresentationTimerState({
        setElapsedSeconds,
        setIsTimerRunning,
        setSlideElapsedSeconds,
      });
    }

    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    recordingRef.current?.resume();
    if (
      requestedRecordingMode === "microphone" &&
      streamRef.current &&
      currentSlide
    ) {
      await speech
        .resume(streamRef.current, currentSlide)
        .catch(() => undefined);
    }
    setIsTimerRunning(true);
  }

  function beginSlideTranscriptVisit(
    slide: Slide,
    slideIndex: number,
    visitedAt = new Date().toISOString(),
  ) {
    const visitedVer =
      (slideTranscriptVisitVersionsRef.current.get(slide.slideId) ?? 0) + 1;
    slideTranscriptVisitVersionsRef.current.set(slide.slideId, visitedVer);
    activeSlideTranscriptVisitRef.current = {
      slideId: slide.slideId,
      slideNum: slideIndex + 1,
      visitedAt,
      visitedVer,
    };
  }

  function captureSlideTranscriptSnapshot(
    reason: SlideTranscriptSnapshot["reason"],
    capturedAt = new Date().toISOString(),
  ) {
    const activeVisit = activeSlideTranscriptVisitRef.current;
    if (!activeVisit) {
      return;
    }
    slideTranscriptSnapshotsRef.current.push({
      ...activeVisit,
      capturedAt,
      reason,
      transcript: speech.getTranscript(),
    });
    activeSlideTranscriptVisitRef.current = null;
  }

  function resetSlideTranscriptSnapshots(activeDeck: Deck, slideIndex: number) {
    slideTranscriptSnapshotsRef.current = [];
    slideTranscriptVisitVersionsRef.current = new Map();
    activeSlideTranscriptVisitRef.current = null;
    previousSlideIndexRef.current = slideIndex;
    const slide = activeDeck.slides[slideIndex];
    if (slide) {
      beginSlideTranscriptVisit(slide, slideIndex);
    }
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
    const failureCopy = getPresentationFailureCopy("load", error);

    return (
      <main className="rehearsal-presenter-shell">
        <OrbitFailureState
          description={failureCopy.description}
          onRetry={() => window.location.reload()}
          recommendedAction={failureCopy.recommendedAction}
          retryLabel="다시 불러오기"
          secondaryAction={
            <OrbitButton
              onClick={() =>
                navigateToProject(deck?.projectId ?? props.projectId)
              }
              size="prominent"
              variant="secondary"
            >
              프로젝트로 돌아가기
            </OrbitButton>
          }
          title={failureCopy.title}
        />
      </main>
    );
  }

  if (phase === "loading" && !deck) {
    return (
      <PresenterStatusShell title="발표 화면을 준비하는 중입니다.">
        최신 슬라이드와 발표 메모를 불러오고 있습니다.
      </PresenterStatusShell>
    );
  }

  if (runtimePhase === "starting") {
    return (
      <PresenterStatusShell title="실전 발표를 준비하는 중입니다.">
        발표 세션과 음성 인식을 연결하고 있습니다.
      </PresenterStatusShell>
    );
  }

  if (runtimePhase === "failed") {
    const failureOperation =
      runtimeFailureOperation === "finish" ? "finish" : "start";
    const failureCopy = getPresentationFailureCopy(
      failureOperation,
      runtimeError,
    );

    return (
      <main className="rehearsal-presenter-shell">
        <OrbitFailureState
          description={failureCopy.description}
          onRetry={() =>
            runtimeFailureOperation === "finish"
              ? void finishPresentation()
              : void startPresentation(requestedRecordingMode)
          }
          recommendedAction={failureCopy.recommendedAction}
          secondaryAction={
            <>
              {runtimeFailureOperation === "start" &&
              requestedRecordingMode === "microphone" ? (
                <OrbitButton
                  onClick={() => void startPresentation("none")}
                  size="prominent"
                  variant="secondary"
                >
                  마이크 없이 시작
                </OrbitButton>
              ) : null}
              <OrbitButton
                onClick={() =>
                  navigateToProject(deck?.projectId ?? props.projectId)
                }
                size="prominent"
                variant="secondary"
              >
                프로젝트로 돌아가기
              </OrbitButton>
            </>
          }
          title={failureCopy.title}
        />
      </main>
    );
  }

  return (
    <>
      <PresentationScreen
        adviceState={adviceState}
        autoAdvanceStatus={
          <AutoAdvanceStatus
            countdownMs={presentationAutoAdvancePolicy.countdownMs}
            nowMs={autoAdvanceNowMs}
            onFinish={requestPresentationExit}
            state={advanceControllerState}
          />
        }
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
        onExit={requestPresentationExit}
        onNext={handleNextPresenterStep}
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
        presentationSession={runtimeRef.current ?? undefined}
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
        wordsPerMinute={speech.state.wordsPerMinute}
      />
      {runtimePhase === "preflight" ? (
        <PresentationMicCheckModal
          onClose={() => navigateToProject(deck?.projectId ?? props.projectId)}
          onStart={() => void startPresentation("microphone")}
          onStartWithoutMicrophone={() => void startPresentation("none")}
        />
      ) : null}
      {runtimePhase === "finishing" || runtimePhase === "completed" ? (
        <PresentationCompletionDialog
          isSaving={runtimePhase === "finishing"}
          onClose={() => navigateToProject(deck?.projectId ?? props.projectId)}
          onGoHome={navigateToHome}
          onOpenProject={() =>
            navigateToProject(deck?.projectId ?? props.projectId)
          }
          onOpenReport={() => {
            const runtime = runtimeRef.current;
            if (!runtime || !props.projectId) {
              return;
            }
            navigateToPresentationReport({
              projectId: props.projectId,
              runId: runtime.runId,
              sessionId: runtime.sessionId,
            });
          }}
        />
      ) : null}
    </>
  );
}

const presentationAutoAdvancePolicy = Object.freeze({
  ...defaultAutoAdvancePolicy,
  live: true,
  rehearsal: false,
});

function navigateToProject(projectId?: string) {
  if (!projectId || typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", `/project/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToHome() {
  if (typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToPresentationReport(input: {
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  if (typeof window === "undefined") {
    return;
  }
  const search = new URLSearchParams({ runId: input.runId });
  window.history.pushState(
    {},
    "",
    `/presentation/${encodeURIComponent(input.projectId)}/report/${encodeURIComponent(
      input.sessionId,
    )}?${search.toString()}`,
  );
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
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
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
