import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Mic,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Deck, RehearsalReport, RehearsalRun } from "@orbit/shared";
import { navigateTo } from "./rehearsalUtils";
import { RehearsalAiSummaryOverview } from "./RehearsalAiSummaryOverview";
import { RehearsalHabitOverview } from "./RehearsalHabitOverview";
import { RehearsalPauseOverview } from "./RehearsalPauseOverview";
import { RehearsalSlideAnalysisOverview } from "./RehearsalSlideAnalysisOverview";
import { RehearsalSlideTimingOverview } from "./RehearsalSlideTimingOverview";
import { downloadTranscriptDocx } from "./rehearsalTranscriptExport";
import type { SemanticRetryState } from "./RehearsalSemanticCoverage";
import "./rehearsal-report-components.css";

const TRANSCRIPT_WINDOW_MS = 30 * 60 * 1000;

function fmt(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}분 ${(s % 60).toString().padStart(2, "0")}초`;
}

function fmtDelta(diff: number) {
  const abs = Math.abs(Math.floor(diff));
  const sign = diff >= 0 ? "+" : "−";
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return m > 0 ? `${sign}${m}분 ${s.toString().padStart(2, "0")}초` : `${sign}${s}초`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  deck: Deck | null;
  onSemanticRetry?: () => void;
  prevReports: RehearsalReport[];
  projectId: string;
  report: RehearsalReport;
  run: RehearsalRun | null;
  runNumber: number | null;
  semanticRetryState?: SemanticRetryState;
  totalRunCount: number;
};

export function RehearsalReportDocument({
  deck,
  prevReports,
  projectId,
  report,
  run,
  runNumber,
  totalRunCount: _totalRunCount,
}: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const coaching = report.coaching;
  const metrics = report.metrics;
  const slideTimings = report.slideTimings;
  const reportDeck = useMemo(() => {
    if (!deck) return deck;

    const snapshots = new Map(
      run?.evaluationSnapshot?.slides.map((slide) => [slide.slideId, slide]) ?? [],
    );
    return {
      ...deck,
      slides: deck.slides.map((slide) => ({
        ...slide,
        estimatedSeconds:
          snapshots.get(slide.slideId)?.estimatedSeconds ?? slide.estimatedSeconds,
        order: snapshots.get(slide.slideId)?.order ?? slide.order,
        title: snapshots.get(slide.slideId)?.title ?? slide.title,
        thumbnailUrl: snapshots.get(slide.slideId)?.thumbnailUrl ?? "",
      })),
    };
  }, [deck, run?.evaluationSnapshot]);

  const runDate = run?.createdAt ? formatDate(run.createdAt) : "";
  const title =
    runNumber != null ? `${runNumber}회차 리허설 리포트` : "리허설 리포트";

  // ── 이전 회차 데이터 계산 ──────────────────────────────────────────
  const prevReport = prevReports[0] ?? null; // 직전 회차

  const durationDelta = prevReport
    ? report.metrics.durationSeconds - prevReport.metrics.durationSeconds
    : null;
  const transcriptAvailable =
    report.transcriptRetained &&
    report.transcript !== null &&
    Date.now() - Date.parse(report.generatedAt) < TRANSCRIPT_WINDOW_MS;
  const minutesLeft = transcriptAvailable
    ? Math.ceil(
        (TRANSCRIPT_WINDOW_MS -
          (Date.now() - Date.parse(report.generatedAt))) /
          60000,
      )
    : 0;

  return (
    <div className="rrd-root">
      {/* ── Hero ── */}
      <section className="rrd-hero">
        <div className="rrd-hero-text">
          <h1 className="rrd-hero-title">{title}</h1>
          <time className="rrd-hero-date">{runDate}</time>
          <span className="rrd-hero-status">
            <i aria-hidden="true" /> AI 코칭 완료
          </span>
        </div>
        <button
          type="button"
          className="rrd-hero-action"
          onClick={() => navigateTo(`/rehearsal/${encodeURIComponent(projectId)}`)}
        >
          <Mic size={15} />
          바로 다시 리허설
        </button>
      </section>

      {/* ── 1. AI summary ── */}
      <RehearsalAiSummaryOverview report={report} />

      {/* ── 2. 말버릇 ── */}
      <RehearsalHabitOverview prevReport={prevReport} report={report} />

      {/* ── 3. 음성 타임라인 / 긴 멈춤 ── */}
      <RehearsalPauseOverview
        deck={deck}
        formatDuration={fmt}
        report={report}
      />

      {/* ── 4. 소요 시간 분석 ── */}
      <section className="rrd-card rrd-overview-card">
        <header className="rrd-card-head">
          <FileText size={20} className="rrd-card-icon" />
          <h2>소요 시간 분석</h2>
        </header>

        <div className="rrd-duration-hero">
          <Clock size={26} className="rrd-duration-hero-icon" />
          <div className="rrd-duration-hero-text">
            <span>전체 발표 시간</span>
            <strong>{fmt(metrics.durationSeconds)}</strong>
            <em>
              {durationDelta === null
                ? "비교할 이전 리허설 없음"
                : `직전 대비 ${fmtDelta(durationDelta)}`}
            </em>
          </div>
        </div>

        <div className="rrd-overview-columns">
          <RehearsalSlideTimingOverview
            deck={reportDeck}
            formatDuration={fmt}
            slideTimings={slideTimings}
          />
        </div>

      </section>

      <RehearsalSlideAnalysisOverview
        deck={reportDeck}
        formatDelta={fmtDelta}
        formatDuration={fmt}
        prevReports={prevReports}
        report={report}
      />

      {/* ── 5. 전체 코칭 ── */}
      {coaching && (
        <section className="rrd-card">
          <header className="rrd-card-head">
            <Target size={16} className="rrd-card-icon" />
            <h2>전체 코칭</h2>
          </header>

          {coaching.nextPracticeFocus && (
            <div className="rrd-coaching-focus">
              <span>다음 연습 우선순위</span>
              <p>{coaching.nextPracticeFocus}</p>
            </div>
          )}

          <div className="rrd-coaching-cols">
            {coaching.improvements.length > 0 && (
              <div>
                <strong className="rrd-coaching-col-head">개선 포인트</strong>
                <ol className="rrd-coaching-list rrd-coaching-list-ordered">
                  {coaching.improvements.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            )}
            {coaching.strengths.length > 0 && (
              <div>
                <strong className="rrd-coaching-col-head">잘한 점</strong>
                <ul className="rrd-coaching-list">
                  {coaching.strengths.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 6. 전사본 ── */}
      {transcriptAvailable && (
        <section className="rrd-card rrd-transcript-card">
          <header className="rrd-card-head">
            <FileText size={20} className="rrd-card-icon" />
            <h2>발표 전사본</h2>
            <span className="rrd-transcript-ttl">{minutesLeft}분 후 만료</span>
            <div className="rrd-transcript-actions">
              <button
                type="button"
                className="rrd-transcript-download"
                onClick={() =>
                  downloadTranscriptDocx(
                    deck?.title ?? "리허설",
                    report.transcript ?? "",
                  )
                }
              >
                <Download size={14} />
                DOCX 내려받기
              </button>
              <button
                type="button"
                className="rrd-transcript-toggle"
                onClick={() => setTranscriptOpen((value) => !value)}
                aria-expanded={transcriptOpen}
              >
                {transcriptOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {transcriptOpen ? "접기" : "펼치기"}
              </button>
            </div>
          </header>

          {transcriptOpen && (
            <pre className="rrd-transcript-body">{report.transcript}</pre>
          )}
        </section>
      )}

    </div>
  );
}
