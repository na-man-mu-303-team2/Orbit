import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Layers,
  Mic,
  Repeat2,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Deck, RehearsalReport, RehearsalRun } from "@orbit/shared";
import { resolveEditorAssetUrl } from "../editor/shared/editorAssetUrl";
import { navigateTo } from "./rehearsalUtils";

const TRANSCRIPT_WINDOW_MS = 30 * 60 * 1000;

type ReportAiSummary = {
  headline: string;
  paragraphs: string[];
};

type ReportWithOptionalAiSummary = RehearsalReport & {
  aiSummary?: ReportAiSummary | null;
};

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadTranscriptDoc(title: string, transcript: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title></head><body><pre>${escapeHtml(transcript)}</pre></body></html>`;
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}_전사본.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  deck: Deck | null;
  prevReports: RehearsalReport[];
  projectId: string;
  report: RehearsalReport;
  run: RehearsalRun | null;
  runNumber: number | null;
  totalRunCount: number;
};

export function RehearsalReportDocument({
  deck,
  prevReports,
  projectId,
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
    runNumber != null ? `${runNumber}회차 리허설 리포트` : "리허설 리포트";
  const reportWithAiSummary = report as ReportWithOptionalAiSummary;
  const aiSummary = reportWithAiSummary.aiSummary ?? (
    coaching?.summary
      ? {
          headline: coaching.summary,
          paragraphs: [
            ...coaching.improvements.slice(0, 2),
            coaching.nextPracticeFocus,
          ].filter(Boolean).slice(0, 3),
        }
      : null
  );

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
  const durationTrend = [
    ...prevReports
      .slice()
      .reverse()
      .map((pr, index) => ({
        label: `이전 ${prevReports.length - index}`,
        seconds: pr.metrics.durationSeconds,
      })),
    { label: "이번", seconds: report.metrics.durationSeconds },
  ];
  const maxTrendSeconds = Math.max(
    1,
    ...durationTrend.map((item) => item.seconds),
  );

  return (
    <div className="rrd-root">
      {/* ── Hero ── */}
      <section className="rrd-hero">
        <div className="rrd-hero-text">
          <h1 className="rrd-hero-title">{title}</h1>
          <time className="rrd-hero-date">{runDate}</time>
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
      <section className="rrd-card rrd-ai-card">
        <header className="rrd-card-head">
          <Sparkles size={16} className="rrd-card-icon rrd-card-icon-ai" />
          <h2>AI 총평</h2>
        </header>

        <div className="rrd-summary-block">
          <span className="rrd-summary-block-label">한 줄 요약</span>
          {aiSummary?.headline ? (
            <p className="rrd-ai-summary">{aiSummary.headline}</p>
          ) : (
            <p className="rrd-empty-hint">피드백 데이터가 없습니다.</p>
          )}
        </div>

        <div className="rrd-summary-block">
          <span className="rrd-summary-block-label">총평</span>
          {aiSummary?.paragraphs && aiSummary.paragraphs.length > 0 ? (
            <div className="rrd-ai-paragraphs">
              {aiSummary.paragraphs.slice(0, 3).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="rrd-empty-hint">구조화된 AI 총평 데이터가 없습니다.</p>
          )}
        </div>
      </section>

      {/* ── 2. Overview ── */}
      <section className="rrd-card rrd-overview-card">
        <header className="rrd-card-head">
          <FileText size={16} className="rrd-card-icon" />
          <h2>이번 발표 상태</h2>
        </header>

        <div className="rrd-overview-grid">
          <div className="rrd-overview-metric rrd-overview-metric-primary">
            <span>전체 발표 시간</span>
            <strong>{fmt(metrics.durationSeconds)}</strong>
            <em>
              {durationDelta === null
                ? "비교할 이전 리허설 없음"
                : `직전 대비 ${fmtDelta(durationDelta)}`}
            </em>
          </div>
          <div className="rrd-overview-metric">
            <span>말버릇 총 횟수</span>
            <strong>{metrics.fillerWordCount}회</strong>
            <em>
              {fillerDelta === null
                ? "이전 비교 없음"
                : `직전 대비 ${fillerDelta === 0 ? "변화 없음" : `${fillerDelta > 0 ? "+" : ""}${fillerDelta}회`}`}
            </em>
          </div>
          <div className="rrd-overview-metric">
            <span>긴 멈춤</span>
            <strong>{metrics.pauseCount}회</strong>
            <em>1초 이상 침묵 기준</em>
          </div>
          <div className="rrd-overview-metric">
            <span>키워드 커버리지</span>
            <strong>{Math.round(metrics.keywordCoverage * 100)}%</strong>
            <em>저장된 장표 키워드 기준</em>
          </div>
        </div>

        <div className="rrd-overview-columns">
          <div className="rrd-overview-panel">
            <h3 className="rrd-section-label">이전 리허설 대비 시간 그래프</h3>
            <div className="rrd-time-trend">
              {durationTrend.map((item) => (
                <div key={item.label} className="rrd-time-trend-row">
                  <span>{item.label}</span>
                  <div className="rrd-time-trend-bar-wrap">
                    <div
                      className="rrd-time-trend-bar"
                      style={{ width: `${Math.max(6, (item.seconds / maxTrendSeconds) * 100)}%` }}
                    />
                  </div>
                  <strong>{fmt(item.seconds)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="rrd-overview-panel">
            <h3 className="rrd-section-label">슬라이드별 소요 시간</h3>
            {deck && slideTimings.length > 0 ? (
              <div className="rrd-overview-slide-list">
                {slideTimings.slice(0, 5).map((timing) => {
                  const slide = getSlide(deck, timing.slideId);
                  const thumbnailUrl = slide?.thumbnailUrl
                    ? resolveEditorAssetUrl(slide.thumbnailUrl)
                    : "";
                  return (
                    <div key={timing.slideId} className="rrd-overview-slide-row">
                      <div className="rrd-slide-thumb">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt=""
                            className="rrd-slide-thumb-img"
                          />
                        ) : (
                          <div className="rrd-slide-thumb-placeholder">
                            <FileText size={14} />
                          </div>
                        )}
                      </div>
                      <span>{getSlideName(deck, timing.slideId)}</span>
                      <strong>{fmt(timing.actualSeconds)}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rrd-empty-hint">슬라이드 타이밍 데이터가 없습니다.</p>
            )}
          </div>
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

      {/* ── 3. 장표별 분석 ── */}
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

      {/* ── 4. 계속 문제였던 장표 ── */}
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

      {/* ── 5. 말버릇 / 멈춤 ── */}
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

      {/* ── 6. 전체 코칭 ── */}
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

      {/* ── 7. 전사본 ── */}
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
                  downloadTranscriptDoc(
                    deck?.title ?? "리허설",
                    report.transcript ?? "",
                  )
                }
              >
                <Download size={14} />
                DOC 내려받기
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
