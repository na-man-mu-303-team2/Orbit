import {
  FileText,
  Mic,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import type { Deck, RehearsalReport, RehearsalRun } from "@orbit/shared";
import { navigateTo } from "./rehearsalUtils";
import { RehearsalSlideAnalysisOverview } from "./RehearsalSlideAnalysisOverview";
import { RehearsalSlideTimingOverview } from "./RehearsalSlideTimingOverview";
import {
  RehearsalSemanticCoverage,
  type SemanticRetryState,
} from "./RehearsalSemanticCoverage";
import { buildRehearsalReportViewModel } from "./rehearsalReportViewModel";
import { createDefaultPhraseExtractor } from "./speech/phraseExtractor";

const FILLER_CHART_COLORS = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#D55E00",
  "#CC79A7",
] as const;

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

function fmtPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

type UtteranceOutcome = RehearsalReport["utteranceOutcomes"][number];

const UTTERANCE_OUTCOME_LABELS: Record<
  UtteranceOutcome["kind"],
  string
> = {
  "ad-lib": "추가로 말한 애드리브",
  covered: "그대로 말한 문장",
  missed: "설명하지 않은 문장",
  paraphrased: "바꿔 말한 문장"
};

function buildUtteranceOutcomeSections(
  outcomes: readonly UtteranceOutcome[] = [],
  deck: Deck | null
) {
  const sentenceTextByKey = buildReportSentenceTextMap(deck);
  const slideLabelById = buildReportSlideLabelMap(deck);

  return (["covered", "paraphrased", "ad-lib", "missed"] as const).map(
    (kind) => ({
      kind,
      label: UTTERANCE_OUTCOME_LABELS[kind],
      items: outcomes
        .filter((outcome) => outcome.kind === kind)
        .map((outcome, index) => ({
          key: `${kind}-${outcome.slideId}-${outcome.sentenceId ?? "ad-lib"}-${index}`,
          metric:
            outcome.similarity === undefined
              ? ""
              : `${Math.round(outcome.similarity * 100)}%`,
          slideLabel: slideLabelById.get(outcome.slideId) ?? outcome.slideId,
          text:
            outcome.kind === "ad-lib"
              ? outcome.text ?? "추가 발화"
              : sentenceTextByKey.get(
                  `${outcome.slideId}:${outcome.sentenceId ?? ""}`
                ) ??
                outcome.sentenceId ??
                "문장 정보 없음"
        }))
    })
  );
}

function buildReportSentenceTextMap(deck: Deck | null) {
  const result = new Map<string, string>();
  const extractor = createDefaultPhraseExtractor();

  for (const slide of deck?.slides ?? []) {
    for (const sentence of extractor.extract(slide.speakerNotes)) {
      result.set(`${slide.slideId}:${sentence.sentenceId}`, sentence.text);
    }
  }

  return result;
}

function buildReportSlideLabelMap(deck: Deck | null) {
  const result = new Map<string, string>();

  deck?.slides.forEach((slide, index) => {
    const title = slide.title.trim();
    result.set(
      slide.slideId,
      title ? `슬라이드 ${index + 1} · ${title}` : `슬라이드 ${index + 1}`
    );
  });

  return result;
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
  onSemanticRetry,
  prevReports,
  projectId,
  report,
  run,
  runNumber,
  semanticRetryState = { status: "idle" },
  totalRunCount: _totalRunCount,
}: Props) {

  const coaching = report.coaching;
  const metrics = report.metrics;
  const slideTimings = report.slideTimings;
  const fillerWordDetails = [...report.fillerWordDetails].sort(
    (a, b) => b.count - a.count,
  );
  const fillerDistribution = fillerWordDetails.slice(0, 5).map((fw, index) => {
    const sharePercent = Math.min(
      100,
      metrics.fillerWordCount > 0 ? (fw.count / metrics.fillerWordCount) * 100 : 0,
    );

    return {
      ...fw,
      color: FILLER_CHART_COLORS[index % FILLER_CHART_COLORS.length]!,
      sharePercent,
    };
  });
  const fillerDistributionGradient =
    fillerDistribution.length > 0
      ? (() => {
          let start = 0;
          return fillerDistribution
            .map((item) => {
              const end = start + item.sharePercent * 3.6;
              const segment = `${item.color} ${start}deg ${end}deg`;
              start = end;
              return segment;
            })
            .join(", ");
        })()
      : "";

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

  // ── 이전 회차 데이터 계산 ──────────────────────────────────────────
  const prevReport = prevReports[0] ?? null; // 직전 회차
  const utteranceOutcomeSections = buildUtteranceOutcomeSections(
    report.utteranceOutcomes ?? [],
    deck
  );
  const reportViewModel = buildRehearsalReportViewModel(report, deck);

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
        <button
          type="button"
          className="rrd-hero-action"
          onClick={() => navigateTo(`/rehearsal/${encodeURIComponent(projectId)}`)}
        >
          <Mic size={15} />
          바로 다시 리허설
        </button>
      </section>

      <RehearsalSemanticCoverage
        model={reportViewModel.semantic}
        onRetry={onSemanticRetry}
        retryState={semanticRetryState}
      />

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
          <h2>이번 발표 요약</h2>
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
            <strong>{reportViewModel.keywordCoverage.valueLabel}</strong>
            <em>{reportViewModel.keywordCoverage.detail}</em>
          </div>
        </div>

        <div className="rrd-overview-columns">
          <RehearsalSlideTimingOverview
            deck={deck}
            formatDuration={fmt}
            slideTimings={slideTimings}
          />
        </div>

      </section>

      {utteranceOutcomeSections.some((section) => section.items.length > 0) ? (
        <section className="rrd-card rrd-utterance-outcomes">
          <header className="rrd-card-head">
            <Target size={16} className="rrd-card-icon" />
            <h2>발화 커버리지</h2>
          </header>
          <div className="rrd-utterance-grid">
            {utteranceOutcomeSections.map((section) => (
              <section className="rrd-utterance-group" key={section.kind}>
                <div className="rrd-utterance-group-head">
                  <span>{section.label}</span>
                  <strong>{section.items.length}</strong>
                </div>
                {section.items.length > 0 ? (
                  <ul className="rrd-utterance-list">
                    {section.items.map((item) => (
                      <li key={item.key}>
                        <span>{item.slideLabel}</span>
                        <p>{item.text}</p>
                        {item.metric ? <em>{item.metric}</em> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rrd-empty-hint">기록 없음</p>
                )}
              </section>
            ))}
          </div>
        </section>
      ) : null}

      <RehearsalSlideAnalysisOverview
        deck={deck}
        formatDelta={fmtDelta}
        formatDuration={fmt}
        prevReports={prevReports}
        report={report}
      />

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
            <div className="rrd-filler-distribution">
              <div
                className="rrd-filler-distribution-chart"
                style={{
                  background: `conic-gradient(${fillerDistributionGradient})`,
                }}
                aria-label="상위 표현 비율 원 그래프"
              >
                <div className="rrd-filler-distribution-inner">
                  <strong>{metrics.fillerWordCount}회</strong>
                  <span>상위 표현</span>
                </div>
              </div>

              <div className="rrd-filler-list-wrap">
                <p className="rrd-filler-list-caption">표현별 비중</p>
                <div className="rrd-filler-list">
                  {fillerDistribution.map((fw) => (
                    <div key={fw.word} className="rrd-filler-row">
                      <div className="rrd-filler-word-group">
                        <span
                          className="rrd-filler-legend-dot"
                          style={{ backgroundColor: fw.color }}
                          aria-hidden="true"
                        />
                        <span className="rrd-filler-word">"{fw.word}"</span>
                      </div>
                      <strong className="rrd-filler-summary">
                        {fmtPercent(fw.sharePercent)} ({fw.count}회)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
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

    </div>
  );
}
