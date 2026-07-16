import type { Deck, Slide } from "@orbit/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { flushOfflinePracticeReports } from "./slidePracticeApi";
import { useSlidePracticeSession } from "./useSlidePracticeSession";

export function SlidePracticePanel(props: {
  projectId: string;
  deck: Deck;
  slide: Slide | null;
  onReportCreated: () => void;
}) {
  const [allowRemoteFallback, setAllowRemoteFallback] = useState(false);
  const lastReportedSessionRef = useRef<string | null>(null);
  const biasPhrases = useMemo(() => [
    ...(props.slide?.keywords.map((keyword) => keyword.text) ?? []),
    props.slide?.title ?? "",
  ].filter(Boolean), [props.slide]);
  const session = useSlidePracticeSession({
    projectId: props.projectId,
    deckId: props.deck.deckId,
    deckVersion: props.deck.version,
    slideId: props.slide?.slideId ?? null,
    slideOrder: props.slide?.order ?? 0,
    biasPhrases,
  });

  useEffect(() => {
    const flush = () => void flushOfflinePracticeReports();
    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
  }, []);

  useEffect(() => {
    const practiceSessionId = session.report?.practiceSessionId;
    if (practiceSessionId && lastReportedSessionRef.current !== practiceSessionId) {
      lastReportedSessionRef.current = practiceSessionId;
      props.onReportCreated();
    }
  }, [props, session.report?.practiceSessionId]);

  const recording = session.state === "recording";
  const busy = session.state === "starting" || session.state === "stopping";
  return (
    <div className="editor-practice-panel">
      <div className="editor-practice-controls">
        <div>
          <strong>현재 슬라이드 바로 연습</strong>
          <p>{props.slide ? `${props.slide.order + 1}. ${props.slide.title || "제목 없는 슬라이드"}` : "연습할 슬라이드가 없습니다."}</p>
        </div>
        <div className="editor-practice-timer" aria-live="polite">{formatDuration(session.elapsedMs)}</div>
        {recording ? (
          <button className="editor-practice-stop" type="button" onClick={() => void session.stop()}>연습 종료</button>
        ) : (
          <button
            className="editor-practice-start"
            disabled={!props.slide || busy}
            type="button"
            onClick={() => void session.start(allowRemoteFallback)}
          >
            {busy ? "준비 중…" : "연습 시작"}
          </button>
        )}
      </div>
      <label className="editor-practice-consent">
        <input
          checked={allowRemoteFallback}
          disabled={recording || busy}
          type="checkbox"
          onChange={(event) => setAllowRemoteFallback(event.target.checked)}
        />
        온디바이스 전사가 불가능할 때만 서버 실시간 전사 사용에 동의합니다.
      </label>
      <p className="editor-practice-privacy">음성 원본과 전사 원문은 서버에 저장하지 않습니다. 파생 지표만 저장됩니다.</p>
      {recording || session.finalTranscript || session.interimTranscript ? (
        <div className="editor-practice-transcript" aria-live="polite">
          <span>{session.finalTranscript}</span>
          <span className="interim">{session.interimTranscript}</span>
          {!session.finalTranscript && !session.interimTranscript ? "말을 시작해 주세요." : null}
        </div>
      ) : null}
      {session.message ? <p className="editor-practice-message" role="status">{session.message}</p> : null}
      {session.report ? <PracticeResult report={session.report} /> : null}
    </div>
  );
}

function PracticeResult({ report }: { report: NonNullable<ReturnType<typeof useSlidePracticeSession>["report"]> }) {
  return (
    <div className="editor-practice-result">
      <div className={`editor-practice-style style-${report.style.mode}`}>
        <strong>{styleLabel(report.style.mode)}</strong>
        <span>{report.style.message}</span>
      </div>
      <dl className="editor-practice-metrics">
        <div><dt>습관어</dt><dd>{report.fillers.totalCount}회</dd></div>
        <div><dt>말 속도</dt><dd>{formatMetric(report.voice.syllablesPerSecond, "음절/초")}</dd></div>
        <div><dt>쉼 비율</dt><dd>{Math.round(report.voice.pauseRatio * 100)}%</dd></div>
        <div><dt>피치 폭</dt><dd>{formatMetric(report.voice.pitchSpanHz, "Hz")}</dd></div>
      </dl>
      {report.fillers.details.length > 0 ? (
        <p className="editor-practice-fillers">{report.fillers.details.map((detail) => `${detail.word} ${detail.count}회`).join(" · ")}</p>
      ) : null}
      {report.quality.state !== "measured" ? (
        <p className="editor-practice-quality">일부 지표는 측정하지 못했습니다: {report.quality.reasons.join(", ")}</p>
      ) : null}
    </div>
  );
}

function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatMetric(value: number | null, unit: string) {
  return value === null ? "측정 안 됨" : `${value.toFixed(1)} ${unit}`;
}

function styleLabel(mode: "lullaby" | "turbo" | "announcer" | "cloud" | "neutral") {
  return { lullaby: "자장가형", turbo: "터보형", announcer: "아나운서형", cloud: "구름형", neutral: "안정형" }[mode];
}
