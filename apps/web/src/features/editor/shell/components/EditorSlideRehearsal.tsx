import type { Slide } from "@orbit/shared";
import {
  IconCircle,
  IconCircleCheck,
  IconMicrophone,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  RehearsalScriptTeleprompter,
  type RehearsalScriptTeleprompterRow
} from "../../../rehearsal/presenter/RehearsalScriptTeleprompter";
import { createDefaultPhraseExtractor } from "../../../rehearsal/speech/phraseExtractor";
import type { ExtractedSentence } from "../../../rehearsal/speech/speechTrackingEvents";
import { normalizeLiveTranscriptText } from "../../../rehearsal/stt/liveTranscriptText";
import type { PracticeSessionState } from "../../practice/useSlidePracticeSession";
import type { EditorSlideRehearsalState } from "../hooks/useEditorSlideRehearsal";

type EditorSlideRehearsalSummaryProps = {
  slide: Slide;
  state: EditorSlideRehearsalState;
};

export function EditorSlideRehearsalBottomPanel(
  props: EditorSlideRehearsalSummaryProps & {
    elapsedMs: number;
    message: string;
    onStart: () => void;
    onStop: () => void;
    practiceState: PracticeSessionState;
  }
) {
  const isRecording = props.practiceState === "recording";
  const isBusy =
    props.practiceState === "starting" || props.practiceState === "stopping";
  const scriptProgress = useMemo(
    () =>
      createEditorSlideRehearsalScriptProgress({
        finalTranscript: props.state.finalTranscript,
        interimTranscript: props.state.interimTranscript,
        slide: props.slide
      }),
    [props.slide, props.state.finalTranscript, props.state.interimTranscript]
  );
  const [followMode, setFollowMode] = useState<"auto" | "manual">("auto");
  const [manualCompletedCount, setManualCompletedCount] = useState(0);
  const automaticCompletedCount = scriptProgress.rows.filter(
    (row) => row.status === "covered"
  ).length;
  const visibleProgress =
    followMode === "auto"
      ? scriptProgress
      : createManualScriptProgress(
          scriptProgress.rows,
          manualCompletedCount
        );

  useEffect(() => {
    setFollowMode("auto");
    setManualCompletedCount(0);
  }, [props.slide.slideId]);

  useEffect(() => {
    if (props.practiceState !== "starting") return;
    setFollowMode("auto");
    setManualCompletedCount(0);
  }, [props.practiceState]);

  function moveManually(offset: -1 | 1) {
    const currentCount =
      followMode === "auto"
        ? automaticCompletedCount
        : manualCompletedCount;
    setFollowMode("manual");
    setManualCompletedCount(
      Math.min(
        scriptProgress.rows.length,
        Math.max(0, currentCount + offset)
      )
    );
  }

  function toggleFollowMode() {
    if (followMode === "auto") {
      setManualCompletedCount(automaticCompletedCount);
      setFollowMode("manual");
      return;
    }
    setFollowMode("auto");
  }

  return (
    <section
      aria-label="현재 슬라이드 음성 인식"
      className="editor-slide-rehearsal-bottom"
    >
      <header className="editor-slide-rehearsal-bottom-header">
        <div className="editor-slide-rehearsal-heading">
          <span
            aria-hidden="true"
            className={`editor-slide-rehearsal-live-dot ${isRecording ? "active" : ""}`}
          />
          <strong>음성 인식</strong>
          <span>{getRehearsalStatusLabel(props.practiceState)}</span>
          <span className="editor-slide-rehearsal-script-progress">
            대본 {visibleProgress.progressPercent}%
          </span>
          {props.message ? (
            <span
              aria-live="polite"
              className="editor-slide-rehearsal-message"
              title={props.message}
            >
              {props.message}
            </span>
          ) : null}
        </div>
        <div className="editor-slide-rehearsal-controls">
          <span className="editor-slide-rehearsal-time">
            {formatRehearsalTime(Math.floor(props.elapsedMs / 1_000))}
          </span>
          {isRecording ? (
            <button
              aria-label="슬라이드 연습 종료"
              className="editor-slide-rehearsal-stop"
              type="button"
              onClick={props.onStop}
            >
              <IconPlayerStop aria-hidden="true" size={15} />
              연습 종료
            </button>
          ) : (
            <button
              aria-label="슬라이드 연습 시작"
              className="editor-slide-rehearsal-restart"
              disabled={isBusy}
              type="button"
              onClick={props.onStart}
            >
              <IconPlayerPlay aria-hidden="true" size={15} />
              {props.practiceState === "starting"
                ? "준비 중"
                : props.practiceState === "stopping"
                  ? "분석 중"
                  : "연습 시작"}
            </button>
          )}
        </div>
      </header>
      <RehearsalScriptTeleprompter
        focusScopeId={props.slide.slideId}
        progressPercent={visibleProgress.progressPercent}
        rows={visibleProgress.rows}
      >
        <div
          className="editor-slide-rehearsal-script-controls"
          data-follow-mode={followMode}
        >
          <button
            aria-label="이전 대본 문장"
            disabled={
              (followMode === "auto"
                ? automaticCompletedCount
                : manualCompletedCount) === 0
            }
            type="button"
            onClick={() => moveManually(-1)}
          >
            ←
          </button>
          <button
            aria-label={
              followMode === "auto"
                ? "자동 따라가기 끄기"
                : "자동 따라가기 켜기"
            }
            aria-pressed={followMode === "auto"}
            className="editor-slide-rehearsal-follow-toggle"
            type="button"
            onClick={toggleFollowMode}
          >
            {followMode === "auto" ? "자동 따라가기" : "수동 이동"}
          </button>
          <button
            aria-label="다음 대본 문장"
            disabled={
              (followMode === "auto"
                ? automaticCompletedCount
                : manualCompletedCount) >= scriptProgress.rows.length
            }
            type="button"
            onClick={() => moveManually(1)}
          >
            →
          </button>
        </div>
      </RehearsalScriptTeleprompter>
    </section>
  );
}

export function createManualScriptProgress(
  rows: readonly RehearsalScriptTeleprompterRow[],
  completedCount: number
): {
  focusSentenceId: string | null;
  progressPercent: number;
  rows: RehearsalScriptTeleprompterRow[];
} {
  if (rows.length === 0) {
    return { focusSentenceId: null, progressPercent: 0, rows: [] };
  }
  const boundedCompletedCount = Math.min(
    rows.length,
    Math.max(0, completedCount)
  );
  const focusIndex =
    boundedCompletedCount < rows.length ? boundedCompletedCount : -1;

  return {
    focusSentenceId: rows[focusIndex]?.id ?? null,
    progressPercent: Math.round(
      (boundedCompletedCount / rows.length) * 100
    ),
    rows: rows.map((row, index) => ({
      ...row,
      isFocusTarget: index === focusIndex,
      status:
        index < boundedCompletedCount
          ? "covered"
          : index === focusIndex
            ? "current"
            : index === focusIndex + 1
              ? "next"
              : "pending"
    }))
  };
}

export function createEditorSlideRehearsalScriptProgress(input: {
  finalTranscript: string;
  interimTranscript: string;
  slide: Slide;
}): {
  focusSentenceId: string | null;
  progressPercent: number;
  rows: RehearsalScriptTeleprompterRow[];
} {
  const keywordTerms = input.slide.keywords.flatMap((keyword) => [
    keyword.text,
    ...keyword.synonyms,
    ...keyword.abbreviations
  ]);
  const sentences = createDefaultPhraseExtractor({ keywordTerms }).extract(
    input.slide.speakerNotes
  );
  if (sentences.length === 0) {
    return {
      focusSentenceId: "fallback",
      progressPercent: 0,
      rows: [
        {
          id: "fallback",
          isFocusTarget: true,
          status: "current",
          text: input.slide.speakerNotes.trim() || "작성된 발표 대본이 없습니다."
        }
      ]
    };
  }

  const finalTranscript = normalizeLiveTranscriptText(input.finalTranscript);
  const liveTranscript = normalizeLiveTranscriptText(
    `${input.finalTranscript} ${input.interimTranscript}`
  );
  const finalMatchedIndexes = sentences
    .filter((sentence) => sentenceMatchesTranscript(sentence, finalTranscript))
    .map((sentence) => sentence.index);
  const liveMatchedIndexes = sentences
    .filter((sentence) => sentenceMatchesTranscript(sentence, liveTranscript))
    .map((sentence) => sentence.index);
  const lastCommittedIndex = Math.max(-1, ...finalMatchedIndexes);
  const lastLiveIndex = Math.max(-1, ...liveMatchedIndexes);
  const committedCount = Math.min(lastCommittedIndex + 1, sentences.length);
  const focusIndex =
    committedCount === sentences.length
      ? sentences.length
      : Math.min(
          Math.max(lastCommittedIndex + 1, lastLiveIndex, 0),
          sentences.length - 1
        );

  return {
    focusSentenceId: sentences[focusIndex]?.sentenceId ?? null,
    progressPercent: Math.round((committedCount / sentences.length) * 100),
    rows: sentences.map(
      (sentence): RehearsalScriptTeleprompterRow => ({
        id: sentence.sentenceId,
        isFocusTarget: sentence.index === focusIndex,
        status:
          sentence.index < focusIndex
            ? "covered"
            : sentence.index === focusIndex
              ? "current"
              : sentence.index === focusIndex + 1
                ? "next"
                : "pending",
        text: sentence.text
      })
    )
  };
}

function sentenceMatchesTranscript(
  sentence: ExtractedSentence,
  normalizedTranscript: string
) {
  if (!normalizedTranscript) return false;
  const normalizedSentence = normalizeLiveTranscriptText(sentence.text);
  if (
    normalizedSentence.length >= 4 &&
    normalizedTranscript.includes(normalizedSentence)
  ) {
    return true;
  }

  return sentence.candidates.some(
    (candidate) =>
      candidate.normalizedText.length >= 4 &&
      normalizedTranscript.includes(candidate.normalizedText)
  );
}

export function EditorSlideRehearsalRightPanel(
  props: EditorSlideRehearsalSummaryProps
) {
  const hitKeywordIds = new Set(props.state.hitKeywordIds);
  const hitCount = props.slide.keywords.filter((keyword) =>
    hitKeywordIds.has(keyword.keywordId)
  ).length;

  return (
    <div className="editor-slide-rehearsal-side">
      <section className="editor-slide-rehearsal-summary">
        <span className="redesign-eyebrow">CURRENT SLIDE</span>
        <strong>
          {props.slide.order}. {props.slide.title || "제목 없는 슬라이드"}
        </strong>
        <p>현재 슬라이드만 반복해서 연습합니다.</p>
      </section>

      <section className="editor-slide-rehearsal-checkpoints">
        <header>
          <strong>발표 체크포인트</strong>
          <span>
            {hitCount}/{props.slide.keywords.length}
          </span>
        </header>
        {props.slide.keywords.length > 0 ? (
          <ul>
            {props.slide.keywords.map((keyword) => {
              const isHit = hitKeywordIds.has(keyword.keywordId);
              return (
                <li className={isHit ? "hit" : ""} key={keyword.keywordId}>
                  {isHit ? (
                    <IconCircleCheck aria-hidden="true" size={16} />
                  ) : (
                    <IconCircle aria-hidden="true" size={16} />
                  )}
                  <span>{keyword.text}</span>
                  {keyword.required ? <small>필수</small> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="editor-slide-rehearsal-empty">
            이 슬라이드에는 체크포인트가 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}

export function EditorSlideRehearsalLeftPanel(
  props: EditorSlideRehearsalSummaryProps & {
    onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  }
) {
  return (
    <aside className="slides-pane editor-slide-rehearsal-left-pane">
      <div className="slides-pane-header editor-slide-rehearsal-left-header">
        <div className="slides-pane-title">
          <IconMicrophone aria-hidden="true" size={15} />
          <strong>슬라이드 리허설</strong>
        </div>
      </div>
      <div className="editor-slide-rehearsal-left-content">
        <EditorSlideRehearsalRightPanel {...props} />
      </div>
      <button
        aria-label="리허설 패널 크기 조정"
        className="slides-pane-resizer"
        type="button"
        onPointerDown={props.onResizeStart}
      />
    </aside>
  );
}

export function formatRehearsalTime(elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getRehearsalStatusLabel(state: PracticeSessionState) {
  switch (state) {
    case "starting":
      return "준비 중";
    case "recording":
      return "녹음 중";
    case "stopping":
      return "분석 중";
    case "completed":
      return "분석 완료";
    case "error":
      return "연결 확인 필요";
    default:
      return "대기 중";
  }
}
