import type { Slide } from "@orbit/shared";
import {
  IconCircle,
  IconCircleCheck,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useMemo } from "react";

import {
  RehearsalScriptTeleprompter,
  type RehearsalScriptTeleprompterRow
} from "../../../rehearsal/presenter/RehearsalScriptTeleprompter";
import { createDefaultPhraseExtractor } from "../../../rehearsal/speech/phraseExtractor";
import type { ExtractedSentence } from "../../../rehearsal/speech/speechTrackingEvents";
import { normalizeLiveTranscriptText } from "../../../rehearsal/stt/liveTranscriptText";
import type { EditorSlideRehearsalState } from "../hooks/useEditorSlideRehearsal";

type EditorSlideRehearsalProps = {
  onRestart: () => void;
  onStop: () => void;
  slide: Slide;
  state: EditorSlideRehearsalState;
};

export function EditorSlideRehearsalBottomPanel(
  props: EditorSlideRehearsalProps
) {
  const isListening = props.state.status === "listening";
  const scriptProgress = useMemo(
    () =>
      createEditorSlideRehearsalScriptProgress({
        finalTranscript: props.state.finalTranscript,
        interimTranscript: props.state.interimTranscript,
        slide: props.slide
      }),
    [props.slide, props.state.finalTranscript, props.state.interimTranscript]
  );

  return (
    <section
      aria-label="현재 슬라이드 음성 인식"
      className="editor-slide-rehearsal-bottom"
    >
      <header className="editor-slide-rehearsal-bottom-header">
        <div className="editor-slide-rehearsal-heading">
          <span
            aria-hidden="true"
            className={`editor-slide-rehearsal-live-dot ${isListening ? "active" : ""}`}
          />
          <strong>음성 인식</strong>
          <span>{getRehearsalStatusLabel(props.state)}</span>
          <span className="editor-slide-rehearsal-script-progress">
            대본 {scriptProgress.progressPercent}%
          </span>
        </div>
        <div className="editor-slide-rehearsal-controls">
          <span className="editor-slide-rehearsal-time">
            {formatRehearsalTime(props.state.elapsedSeconds)}
          </span>
          {isListening || props.state.status === "starting" ? (
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
              type="button"
              onClick={props.onRestart}
            >
              <IconPlayerPlay aria-hidden="true" size={15} />
              연습 시작
            </button>
          )}
        </div>
      </header>
      <RehearsalScriptTeleprompter
        focusScopeId={props.slide.slideId}
        progressPercent={scriptProgress.progressPercent}
        rows={scriptProgress.rows}
      />
    </section>
  );
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
  props: EditorSlideRehearsalProps
) {
  const hitKeywordIds = new Set(props.state.hitKeywordIds);
  const hitCount = props.slide.keywords.filter((keyword) =>
    hitKeywordIds.has(keyword.keywordId)
  ).length;

  return (
    <div className="editor-slide-rehearsal-side">
      <section className="editor-slide-rehearsal-summary">
        <span className="orbit-ds-eyebrow">CURRENT SLIDE</span>
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

export function formatRehearsalTime(elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getRehearsalStatusLabel(state: EditorSlideRehearsalState) {
  switch (state.status) {
    case "starting":
      return "준비 중";
    case "listening":
      return "인식 중";
    case "stopped":
      return "중지됨";
    case "error":
      return "연결 확인 필요";
    default:
      return "대기 중";
  }
}
