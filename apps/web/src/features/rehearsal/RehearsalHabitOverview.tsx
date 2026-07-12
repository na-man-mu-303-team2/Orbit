import { MessageSquareWarning, PauseCircle, Volume2 } from "lucide-react";
import type { RehearsalReport } from "@orbit/shared";

const FILLER_CHART_COLORS = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#D55E00",
  "#CC79A7",
] as const;

const FILLER_DONUT_SIZE = 200;
const FILLER_DONUT_CENTER = FILLER_DONUT_SIZE / 2;
const FILLER_DONUT_RADIUS = 80;
const FILLER_DONUT_STROKE_WIDTH = 30;
const FILLER_DONUT_CIRCUMFERENCE = 2 * Math.PI * FILLER_DONUT_RADIUS;

type FillerDistributionItem = {
  color: string;
  count: number;
  sharePercent: number;
  word: string;
};

function fmtPercent(value: number) {
  return `${Math.round(value)}%`;
}

function buildFillerDistribution(
  fillerWordDetails: RehearsalReport["fillerWordDetails"],
  fillerWordCount: number,
): FillerDistributionItem[] {
  return [...fillerWordDetails]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((fw, index) => ({
      ...fw,
      color: FILLER_CHART_COLORS[index % FILLER_CHART_COLORS.length]!,
      sharePercent: Math.min(
        100,
        fillerWordCount > 0 ? (fw.count / fillerWordCount) * 100 : 0,
      ),
    }));
}

function buildFillerDonutSegments(distribution: FillerDistributionItem[]) {
  let cumulativePercent = 0;

  return distribution.map((item) => {
    const segmentLength = (item.sharePercent / 100) * FILLER_DONUT_CIRCUMFERENCE;
    const midPercent = cumulativePercent + item.sharePercent / 2;
    const midRad = (midPercent / 100) * 2 * Math.PI;
    const segment = {
      ...item,
      dashArray: `${segmentLength} ${FILLER_DONUT_CIRCUMFERENCE - segmentLength}`,
      dashOffset: -((cumulativePercent / 100) * FILLER_DONUT_CIRCUMFERENCE),
      labelX: FILLER_DONUT_CENTER + FILLER_DONUT_RADIUS * Math.sin(midRad),
      labelY: FILLER_DONUT_CENTER - FILLER_DONUT_RADIUS * Math.cos(midRad),
      showLabel: item.sharePercent >= 8,
    };
    cumulativePercent += item.sharePercent;
    return segment;
  });
}

function buildPauseDistribution(pauseDetails: RehearsalReport["pauseDetails"]) {
  return [...pauseDetails]
    .sort((a, b) => a.startSecond - b.startSecond)
    .map((pause, index) => ({ ...pause, index }));
}

type Props = {
  formatDuration: (totalSeconds: number) => string;
  prevReport: RehearsalReport | null;
  report: RehearsalReport;
};

export function RehearsalHabitOverview({
  formatDuration,
  prevReport,
  report,
}: Props) {
  const metrics = report.metrics;
  const fillerDistribution = buildFillerDistribution(
    report.fillerWordDetails,
    metrics.fillerWordCount,
  );
  const fillerDonutSegments = buildFillerDonutSegments(fillerDistribution);
  const pauseDistribution = buildPauseDistribution(report.pauseDetails);
  const maxPauseDuration = Math.max(
    1,
    ...pauseDistribution.map((pause) => pause.durationSeconds),
  );
  const fillerDelta = prevReport
    ? metrics.fillerWordCount - prevReport.metrics.fillerWordCount
    : null;

  return (
    <section className="rrd-card">
      <header className="rrd-card-head">
        <Volume2 size={20} className="rrd-card-icon" />
        <h2>말버릇 / 멈춤</h2>
      </header>

      <div className="rrd-habit-columns">
        <div className="rrd-habit-col">
          <div className="rrd-habit-col-head">
            <MessageSquareWarning size={20} className="rrd-habit-col-icon" />
            <span>말버릇 총량</span>
            <strong>{metrics.fillerWordCount}회</strong>
            <em>
              {fillerDelta === null
                ? "이전 비교 없음"
                : `직전 대비 ${fillerDelta === 0 ? "변화 없음" : `${fillerDelta > 0 ? "+" : ""}${fillerDelta}회`}`}
            </em>
          </div>

          {fillerDistribution.length > 0 ? (
            <>
              <h3 className="rrd-section-label">상위 표현</h3>
              <div className="rrd-filler-distribution">
                <div className="rrd-filler-distribution-chart">
                  <svg
                    viewBox={`0 0 ${FILLER_DONUT_SIZE} ${FILLER_DONUT_SIZE}`}
                    role="img"
                    aria-label="상위 표현 비율 원 그래프"
                  >
                    <circle
                      className="rrd-filler-donut-track"
                      cx={FILLER_DONUT_CENTER}
                      cy={FILLER_DONUT_CENTER}
                      r={FILLER_DONUT_RADIUS}
                      fill="none"
                      strokeWidth={FILLER_DONUT_STROKE_WIDTH}
                    />
                    <g
                      transform={`rotate(-90 ${FILLER_DONUT_CENTER} ${FILLER_DONUT_CENTER})`}
                    >
                      {fillerDonutSegments.map((segment) => (
                        <circle
                          key={segment.word}
                          cx={FILLER_DONUT_CENTER}
                          cy={FILLER_DONUT_CENTER}
                          r={FILLER_DONUT_RADIUS}
                          fill="none"
                          stroke={segment.color}
                          strokeWidth={FILLER_DONUT_STROKE_WIDTH}
                          strokeDasharray={segment.dashArray}
                          strokeDashoffset={segment.dashOffset}
                        />
                      ))}
                    </g>
                    {fillerDonutSegments.map((segment) =>
                      segment.showLabel ? (
                        <text
                          key={`${segment.word}-label`}
                          className="rrd-filler-donut-label"
                          x={segment.labelX}
                          y={segment.labelY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {fmtPercent(segment.sharePercent)}
                        </text>
                      ) : null,
                    )}
                  </svg>
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
          ) : (
            <p className="rrd-empty-hint">말버릇 기록이 없습니다.</p>
          )}
        </div>

        <div className="rrd-habit-col rrd-habit-col-pause">
          <div className="rrd-habit-col-head">
            <PauseCircle size={20} className="rrd-habit-col-icon" />
            <span>긴 멈춤</span>
            <strong>{metrics.pauseCount}회</strong>
            <em>1초 이상 침묵 기준</em>
          </div>

          {pauseDistribution.length > 0 ? (
            <>
              <h3 className="rrd-section-label">멈춤 분포</h3>
              <div className="rrd-pause-list">
                {pauseDistribution.map((pause) => (
                  <div
                    key={`${pause.startSecond}-${pause.index}`}
                    className="rrd-pause-row"
                  >
                    <span className="rrd-pause-row-label">
                      {pause.index + 1}번째 · {formatDuration(pause.startSecond)} 지점
                    </span>
                    <div className="rrd-pause-bar-track">
                      <div
                        className="rrd-pause-bar-fill"
                        style={{
                          width: `${Math.min(100, (pause.durationSeconds / maxPauseDuration) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong className="rrd-pause-duration">
                      {formatDuration(pause.durationSeconds)}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="rrd-empty-hint">긴 멈춤 기록이 없습니다.</p>
          )}
        </div>
      </div>
    </section>
  );
}
