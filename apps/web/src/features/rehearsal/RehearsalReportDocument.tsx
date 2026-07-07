import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Layers,
  Repeat2,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Deck, RehearsalReport, RehearsalRun } from "@orbit/shared";
import { resolveEditorAssetUrl } from "../editor/shared/editorAssetUrl";

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

function getSlide(deck: Deck, slideId: string) {
  return deck.slides.find((s) => s.slideId === slideId);
}

function getSlideLabel(deck: Deck, slideId: string) {
  const slide = getSlide(deck, slideId);
  if (!slide) return slideId;
  const t = slide.title.trim();
  return t ? `슬라이드 ${slide.order} · ${t}` : `슬라이드 ${slide.order}`;
}

function getSlideName(deck: Deck, slideId: string) {
  const slide = getSlide(deck, slideId);
  if (!slide) return slideId;
  const t = slide.title.trim();
  return t || `슬라이드 ${slide.order}`;
}

function downloadTranscript(title: string, transcript: string) {
  const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}_전사본.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  deck: Deck | null;
  prevReports: RehearsalReport[];
  report: RehearsalReport;
  run: RehearsalRun | null;
  runNumber: number | null;
  totalRunCount: number;
};

export function RehearsalReportDocument({
  deck,
  prevReports,
  report,
  run,
  runNumber,
  totalRunCount,
}: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const coaching = report.coaching;
  const metrics = report.metrics;
  const slideTimings = report.slideTimings;
  const missedKeywords = report.missedKeywords;
  const fillerWordDetails = [...report.fillerWordDetails].sort(
    (a, b) => b.count - a.count,
  );

  const runDate = run?.createdAt ? formatDate(run.createdAt) : "";
  const title =
    runNumber != null ? `리허설 ${runNumber}회차 리포트` : "리허설 리포트";

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

  // ── 이전 회차 데이터 계산 ──────────────────────────────────────────
  const prevReport = prevReports[0] ?? null; // 직전 회차

  const slideAvgMap = useMemo(() => {
    const raw = new Map<string, number[]>();
    for (const pr of prevReports) {
      for (const t of pr.slideTimings) {
        const arr = raw.get(t.slideId) ?? [];
        arr.push(t.actualSeconds);
        raw.set(t.slideId, arr);
      }
    }
    const avg = new Map<string, number>();
    for (const [id, times] of raw) {
      avg.set(id, times.reduce((a, b) => a + b, 0) / times.length);
    }
    return avg;
  }, [prevReports]);

  const recurringIssues = useMemo(() => {
    const map = new Map<string, { timeOverCount: number; missedCount: number }>();
    for (const pr of prevReports) {
      const seen = new Set<string>();
      for (const t of pr.slideTimings) {
        if (t.actualSeconds > t.targetSeconds * 1.2) {
          const e = map.get(t.slideId) ?? { timeOverCount: 0, missedCount: 0 };
          e.timeOverCount++;
          map.set(t.slideId, e);
        }
      }
      for (const mk of pr.missedKeywords) {
        if (!seen.has(mk.slideId)) {
          seen.add(mk.slideId);
          const e = map.get(mk.slideId) ?? { timeOverCount: 0, missedCount: 0 };
          e.missedCount++;
          map.set(mk.slideId, e);
        }
      }
    }
    return map;
  }, [prevReports]);

  const recurringProblemSlides = useMemo(
    () =>
      [...recurringIssues.entries()]
        .filter(([, v]) => v.timeOverCount >= 2 || v.missedCount >= 2)
        .map(([slideId, v]) => ({ slideId, ...v })),
    [recurringIssues],
  );

  const durationDelta = prevReport
    ? report.metrics.durationSeconds - prevReport.metrics.durationSeconds
    : null;
  const fillerDelta = prevReport
    ? report.metrics.fillerWordCount - prevReport.metrics.fillerWordCount
    : null;

  return (
    <div className="rrd-root">
      {/* ── Hero ── */}
      <section className="rrd-hero">
        <div className="rrd-hero-text">
          <h1 className="rrd-hero-title">{title}</h1>
          <time className="rrd-hero-date">{runDate}</time>
        </div>
      </section>

      {/* ── 1. Summary ── */}
      <section className="rrd-card rrd-ai-card">
        <header className="rrd-card-head">
          <Sparkles size={16} className="rrd-card-icon rrd-card-icon-ai" />
          <h2>Summary</h2>
        </header>

        <div className="rrd-summary-block">
          <span className="rrd-summary-block-label">전체 공통 피드백</span>
          {coaching?.summary ? (
            <p className="rrd-ai-summary">{coaching.summary}</p>
          ) : (
            <p className="rrd-empty-hint">피드백 데이터가 없습니다.</p>
          )}
          {coaching?.improvements && coaching.improvements.length > 0 && (
            <ul className="rrd-ai-points">
              {coaching.improvements.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div
          className={`rrd-summary-block${prevReports.length === 0 ? " rrd-summary-block-muted" : ""}`}
        >
          <span className="rrd-summary-block-label">이번 회차 핵심 변화</span>
          {prevReports.length === 0 ? (
            <p className="rrd-empty-hint">
              {totalRunCount < 2
                ? "2회차부터 이전 회차와의 변화를 분석합니다."
                : "이전 회차 데이터를 불러오는 중입니다."}
            </p>
          ) : (
            <ul className="rrd-change-list">
              {durationDelta !== null && (
                <li>
                  <span>전체 시간</span>
                  <strong
                    className={
                      durationDelta > 10
                        ? "rrd-change-over"
                        : durationDelta < -10
                          ? "rrd-change-under"
                          : ""
                    }
                  >
                    {fmtDelta(durationDelta)}
                  </strong>
                  <span className="rrd-change-ref">
                    직전 {fmt(prevReport!.metrics.durationSeconds)}
                  </span>
                </li>
              )}
              {fillerDelta !== null && (
                <li>
                  <span>말버릇</span>
                  <strong
                    className={
                      fillerDelta > 0
                        ? "rrd-change-over"
                        : fillerDelta < 0
                          ? "rrd-change-under"
                          : ""
                    }
                  >
                    {fillerDelta === 0
                      ? "변화 없음"
                      : `${fmtDelta(fillerDelta)}회`}
                  </strong>
                  <span className="rrd-change-ref">
                    직전 {prevReport!.metrics.fillerWordCount}회
                  </span>
                </li>
              )}
              {slideTimings
                .filter((t) => {
                  const prevTiming = prevReport?.slideTimings.find(
                    (pt) => pt.slideId === t.slideId,
                  );
                  if (!prevTiming) return false;
                  return Math.abs(t.actualSeconds - prevTiming.actualSeconds) > 15;
                })
                .slice(0, 2)
                .map((t) => {
                  const prevT = prevReport!.slideTimings.find(
                    (pt) => pt.slideId === t.slideId,
                  )!;
                  const d = t.actualSeconds - prevT.actualSeconds;
                  return (
                    <li key={t.slideId}>
                      <span>
                        {deck ? getSlideName(deck, t.slideId) : t.slideId}
                      </span>
                      <strong className={d > 0 ? "rrd-change-over" : "rrd-change-under"}>
                        {fmtDelta(d)}
                      </strong>
                      <span className="rrd-change-ref">
                        직전 {fmt(prevT.actualSeconds)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </section>

      {/* ── 2. 장표별 분석 ── */}
      <section className="rrd-card">
        <header className="rrd-card-head">
          <Layers size={16} className="rrd-card-icon" />
          <h2>장표별 분석</h2>
          {slideTimings.length > 0 && (
            <span className="rrd-card-count">{slideTimings.length}장</span>
          )}
        </header>

        {deck && slideTimings.length > 0 ? (
          <div className="rrd-slide-analysis-list">
            {slideTimings.map((timing) => {
              const slide = getSlide(deck, timing.slideId);
              const thumbnailUrl = slide?.thumbnailUrl
                ? resolveEditorAssetUrl(slide.thumbnailUrl)
                : "";
              const slideMissed = missedKeywords.filter(
                (k) => k.slideId === timing.slideId,
              );
              const avgSeconds = slideAvgMap.get(timing.slideId);
              const diff =
                avgSeconds != null
                  ? timing.actualSeconds - avgSeconds
                  : null;
              const isOver = diff != null && diff > 12;
              const isUnder = diff != null && diff < -12;
              const recurring = recurringIssues.get(timing.slideId);

              return (
                <div key={timing.slideId} className="rrd-slide-analysis-item">
                  <div className="rrd-slide-analysis-thumb">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt=""
                        className="rrd-slide-thumb-img"
                      />
                    ) : (
                      <div className="rrd-slide-thumb-placeholder">
                        <FileText size={18} />
                      </div>
                    )}
                  </div>

                  <div className="rrd-slide-analysis-body">
                    <strong className="rrd-slide-analysis-title">
                      {getSlideLabel(deck, timing.slideId)}
                    </strong>

                    <div className="rrd-slide-time-grid">
                      <div className="rrd-slide-time-cell">
                        <span>이번 시간</span>
                        <strong>{fmt(timing.actualSeconds)}</strong>
                      </div>
                      <div className="rrd-slide-time-cell">
                        <span>평균 시간</span>
                        <strong className={avgSeconds == null ? "rrd-muted" : ""}>
                          {avgSeconds != null ? fmt(avgSeconds) : "집계 중"}
                        </strong>
                      </div>
                      <div
                        className={`rrd-slide-time-cell${isOver ? " rrd-diff-over" : isUnder ? " rrd-diff-under" : ""}`}
                      >
                        <span>평균 대비</span>
                        <strong>
                          {diff != null ? fmtDelta(diff) : "집계 중"}
                        </strong>
                      </div>
                    </div>

                    <div className="rrd-slide-row">
                      <span className="rrd-slide-row-label">누락 핵심 메시지</span>
                      {slideMissed.length > 0 ? (
                        <div className="rrd-keyword-chips">
                          {slideMissed.map((k) => (
                            <span key={k.keywordId} className="rrd-keyword-chip">
                              {k.text}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="rrd-ok-text">없음</span>
                      )}
                    </div>

                    <div className="rrd-slide-row">
                      <span className="rrd-slide-row-label">반복 문제</span>
                      {recurring ? (
                        <div className="rrd-recurring-tags">
                          {recurring.timeOverCount >= 2 && (
                            <span className="rrd-recurring-tag">
                              시간 초과 {recurring.timeOverCount}회
                            </span>
                          )}
                          {recurring.missedCount >= 2 && (
                            <span className="rrd-recurring-tag">
                              메시지 누락 {recurring.missedCount}회
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={prevReports.length === 0 ? "rrd-muted" : "rrd-ok-text"}>
                          {prevReports.length === 0 ? "집계 중" : "없음"}
                        </span>
                      )}
                    </div>

                    <div className="rrd-slide-row rrd-slide-row-muted">
                      <span className="rrd-slide-row-label">개선 포인트</span>
                      <span className="rrd-muted">AI 분석 준비 중</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rrd-empty-hint">슬라이드 타이밍 데이터가 없습니다.</p>
        )}
      </section>

      {/* ── 3. 계속 문제였던 장표 ── */}
      <section
        className={`rrd-card${totalRunCount < 2 ? " rrd-card-disabled" : ""}`}
      >
        <header className="rrd-card-head">
          <Repeat2 size={16} className="rrd-card-icon" />
          <h2>계속 문제였던 장표</h2>
          {totalRunCount < 2 && (
            <span className="rrd-badge-muted">2회차부터 분석</span>
          )}
        </header>

        {totalRunCount < 2 ? (
          <p className="rrd-empty-hint">
            리허설을 2회 이상 완료하면 반복되는 문제 장표를 분석합니다.
          </p>
        ) : recurringProblemSlides.length === 0 ? (
          <p className="rrd-empty-hint">
            {prevReports.length === 0
              ? "데이터를 불러오는 중입니다."
              : "최근 회차에서 반복된 문제 장표가 없습니다."}
          </p>
        ) : (
          <div className="rrd-recurring-list">
            {recurringProblemSlides.map(({ slideId, timeOverCount, missedCount }) => (
              <div key={slideId} className="rrd-recurring-item">
                <strong className="rrd-recurring-slide-name">
                  {deck ? getSlideName(deck, slideId) : slideId}
                </strong>
                <div className="rrd-recurring-tags">
                  {timeOverCount >= 2 && (
                    <span className="rrd-recurring-tag">
                      시간 초과 {timeOverCount}회
                    </span>
                  )}
                  {missedCount >= 2 && (
                    <span className="rrd-recurring-tag">
                      메시지 누락 {missedCount}회
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 4. 말버릇 / 멈춤 ── */}
      <section className="rrd-card">
        <header className="rrd-card-head">
          <Volume2 size={16} className="rrd-card-icon" />
          <h2>말버릇 / 멈춤</h2>
        </header>

        <div className="rrd-filler-totals">
          <div className="rrd-filler-total-chip">
            <span>말버릇 총량</span>
            <strong>{metrics.fillerWordCount}회</strong>
          </div>
          <div className="rrd-filler-total-chip">
            <span>긴 멈춤</span>
            <strong>{metrics.pauseCount}회</strong>
          </div>
        </div>

        {fillerWordDetails.length > 0 && (
          <>
            <h3 className="rrd-section-label">상위 표현</h3>
            <div className="rrd-filler-list">
              {fillerWordDetails.slice(0, 5).map((fw) => (
                <div key={fw.word} className="rrd-filler-row">
                  <span className="rrd-filler-word">"{fw.word}"</span>
                  <div className="rrd-filler-bar-wrap">
                    <div
                      className="rrd-filler-bar"
                      style={{
                        width: `${Math.min(
                          100,
                          metrics.fillerWordCount > 0
                            ? (fw.count / metrics.fillerWordCount) * 100
                            : 0,
                        )}%`,
                      }}
                    />
                  </div>
                  <strong className="rrd-filler-count">{fw.count}회</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

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
            <FileText size={16} className="rrd-card-icon" />
            <h2>발표 전사본</h2>
            <span className="rrd-transcript-ttl">{minutesLeft}분 후 만료</span>
            <div className="rrd-transcript-actions">
              <button
                type="button"
                className="rrd-transcript-download"
                onClick={() =>
                  downloadTranscript(
                    deck?.title ?? "리허설",
                    report.transcript ?? "",
                  )
                }
              >
                <Download size={14} />
                내려받기
              </button>
              <button
                type="button"
                className="rrd-transcript-toggle"
                onClick={() => setTranscriptOpen((v) => !v)}
                aria-expanded={transcriptOpen}
              >
                {transcriptOpen ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
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
