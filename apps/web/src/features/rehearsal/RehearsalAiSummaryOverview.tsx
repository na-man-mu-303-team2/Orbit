import { Lightbulb, Sparkles, Target, Volume2 } from "lucide-react";
import type { RehearsalReport } from "@orbit/shared";

type ReportAiSummary = {
  headline: string;
  paragraphs: string[];
};

type ReportWithOptionalAiSummary = RehearsalReport & {
  aiSummary?: ReportAiSummary | null;
};

const AI_INSIGHT_META = [
  {
    label: "핵심 메시지",
    caption: "청중 관점",
    status: "강점",
    tone: "positive",
    icon: Target,
  },
  {
    label: "전달 포인트",
    caption: "집중 체크",
    status: "체크",
    tone: "attention",
    icon: Volume2,
  },
  {
    label: "개선 액션",
    caption: "다음 한 걸음",
    status: "추천",
    tone: "action",
    icon: Lightbulb,
  },
] as const;

type Props = {
  report: RehearsalReport;
};

export function RehearsalAiSummaryOverview({ report }: Props) {
  const coaching = report.coaching;
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
  const aiInsightCards = AI_INSIGHT_META.map((meta, index) => ({
    ...meta,
    text: aiSummary?.paragraphs[index] ?? "추가 분석 데이터가 없습니다.",
    hasText: Boolean(aiSummary?.paragraphs[index]),
  }));

  return (
    <section className="rrd-card rrd-ai-card">
      <header className="rrd-card-head">
        <Sparkles size={20} className="rrd-card-icon rrd-card-icon-ai" />
        <div className="rrd-ai-heading">
          <span className="rrd-ai-eyebrow">청중 관점 핵심 인사이트</span>
          <h2>AI 총평</h2>
        </div>
      </header>

      <div className="rrd-ai-overview">
        <span className="rrd-ai-overview-label">한 줄 요약</span>
        {aiSummary?.headline ? (
          <p className="rrd-ai-summary">{aiSummary.headline}</p>
        ) : (
          <p className="rrd-empty-hint">피드백 데이터가 없습니다.</p>
        )}
      </div>

      <div className="rrd-ai-insights" aria-label="AI 핵심 인사이트">
        {aiInsightCards.map((insight, index) => {
          const InsightIcon = insight.icon;

          return (
            <article
              className={`rrd-ai-insight rrd-ai-insight-${insight.tone}`}
              key={insight.label}
            >
              <div className="rrd-ai-insight-topline">
                <span className="rrd-ai-insight-icon" aria-hidden="true">
                  <InsightIcon size={20} />
                </span>
                <span className="rrd-ai-insight-index">0{index + 1}</span>
                <span className="rrd-ai-insight-status">{insight.status}</span>
              </div>
              <div className="rrd-ai-insight-title">
                <h3>{insight.label}</h3>
                <span>{insight.caption}</span>
              </div>
              <p className={insight.hasText ? "" : "is-empty"}>{insight.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
