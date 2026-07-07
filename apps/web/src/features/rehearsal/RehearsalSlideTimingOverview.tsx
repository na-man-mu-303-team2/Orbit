import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import type { Deck, RehearsalReport } from "@orbit/shared";
import { resolveEditorAssetUrl } from "../editor/shared/editorAssetUrl";

type Props = {
  deck: Deck | null;
  formatDuration: (totalSeconds: number) => string;
  slideTimings: RehearsalReport["slideTimings"];
};

type SlideDurationPoint = RehearsalReport["slideTimings"][number] & {
  cumulativeActualSeconds: number;
  index: number;
  slideName: string;
  thumbnailUrl: string;
};

function getSlide(deck: Deck, slideId: string) {
  return deck.slides.find((slide) => slide.slideId === slideId);
}

function getSlideName(deck: Deck, slideId: string) {
  const slide = getSlide(deck, slideId);
  if (!slide) return slideId;
  const title = slide.title.trim();
  return title || `슬라이드 ${slide.order}`;
}

function formatAxis(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  if (minutes === 0) {
    return `${seconds}초`;
  }
  return `${minutes}분 ${seconds.toString().padStart(2, "0")}초`;
}

function buildSlideDurationSeries(
  deck: Deck | null,
  slideTimings: RehearsalReport["slideTimings"],
): SlideDurationPoint[] {
  if (!deck || slideTimings.length === 0) {
    return [];
  }

  let cumulativeActualSeconds = 0;
  return slideTimings.map((timing, index) => {
    cumulativeActualSeconds += timing.actualSeconds;
    const slide = getSlide(deck, timing.slideId);
    return {
      ...timing,
      cumulativeActualSeconds,
      index,
      slideName: getSlideName(deck, timing.slideId),
      thumbnailUrl: slide?.thumbnailUrl
        ? resolveEditorAssetUrl(slide.thumbnailUrl)
        : "",
    };
  });
}

function buildSlideTimingChartModel(slideDurationSeries: SlideDurationPoint[]) {
  if (slideDurationSeries.length === 0) {
    return null;
  }

  const chartWidth = 720;
  const chartHeight = 216;
  const paddingX = 28;
  const paddingTop = 20;
  const paddingBottom = 18;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const pointCount = slideDurationSeries.length;
  const columnWidth = plotWidth / pointCount;
  const maxSeconds = Math.max(
    1,
    ...slideDurationSeries.map((item) => item.actualSeconds),
  );
  const points = slideDurationSeries.map((item, index) => {
    const x = paddingX + columnWidth * index + columnWidth / 2;
    const y =
      paddingTop + (1 - item.actualSeconds / maxSeconds) * plotHeight;
    return {
      ...item,
      x,
      y,
    };
  });
  const linePath = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]!.x.toFixed(2)} ${(chartHeight - paddingBottom).toFixed(2)} L ${points[0]!.x.toFixed(2)} ${(chartHeight - paddingBottom).toFixed(2)} Z`;
  const yTicks = [maxSeconds, maxSeconds / 2, 0].map((seconds) => ({
    label: formatAxis(seconds),
    y: paddingTop + (1 - seconds / maxSeconds) * plotHeight,
  }));

  return {
    areaPath,
    chartHeight,
    chartWidth,
    linePath,
    points,
    yTicks,
  };
}

export function RehearsalSlideTimingOverview({
  deck,
  formatDuration,
  slideTimings,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const slideDurationSeries = useMemo(
    () => buildSlideDurationSeries(deck, slideTimings),
    [deck, slideTimings],
  );
  const chart = useMemo(
    () => buildSlideTimingChartModel(slideDurationSeries),
    [slideDurationSeries],
  );

  return (
    <div className="rrd-overview-panel rrd-overview-panel-wide">
      <div className="rrd-overview-panel-head">
        <h3 className="rrd-section-label">슬라이드별 소요 시간</h3>
        {slideDurationSeries.length > 0 && (
          <div className="rrd-overview-panel-actions">
            <strong className="rrd-cumulative-total">
              최대{" "}
              {formatDuration(
                Math.max(...slideDurationSeries.map((item) => item.actualSeconds)),
              )}
            </strong>
            {slideDurationSeries.length > 5 && (
              <button
                type="button"
                className="rrd-panel-toggle"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? "접기" : "펼치기"}
              </button>
            )}
          </div>
        )}
      </div>
      {chart ? (
        <div className="rrd-cumulative-chart-card">
          <div className="rrd-cumulative-chart-shell">
            <div className="rrd-cumulative-axis">
              {chart.yTicks.map((tick) => (
                <span
                  key={tick.label}
                  className="rrd-cumulative-axis-label"
                  style={{ top: `${(tick.y / chart.chartHeight) * 100}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
            <svg
              viewBox={`0 0 ${chart.chartWidth} ${chart.chartHeight}`}
              className="rrd-cumulative-chart"
              role="img"
              aria-label="슬라이드별 소요 시간 그래프"
            >
              {chart.yTicks.map((tick) => (
                <line
                  key={tick.label}
                  className="rrd-cumulative-gridline"
                  x1="0"
                  x2={chart.chartWidth}
                  y1={tick.y}
                  y2={tick.y}
                />
              ))}
              {chart.points.map((point) => (
                <line
                  key={`${point.slideId}-guide`}
                  className="rrd-cumulative-guide"
                  x1={point.x}
                  x2={point.x}
                  y1={point.y}
                  y2={chart.chartHeight - 18}
                />
              ))}
              <path d={chart.areaPath} className="rrd-cumulative-area" />
              <path d={chart.linePath} className="rrd-cumulative-line" />
              {chart.points.map((point) => (
                <g key={point.slideId}>
                  <circle
                    className="rrd-cumulative-point-ring"
                    cx={point.x}
                    cy={point.y}
                    r="8"
                  />
                  <circle
                    className="rrd-cumulative-point"
                    cx={point.x}
                    cy={point.y}
                    r="4.5"
                  />
                </g>
              ))}
            </svg>
          </div>

          <div
            className="rrd-cumulative-x-axis"
            style={{
              gridTemplateColumns: `repeat(${Math.max(chart.points.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {chart.points.map((point) => (
              <span key={point.slideId} className="rrd-cumulative-x-label">
                {point.index + 1}
              </span>
            ))}
          </div>

          <div className={`rrd-slide-detail-list${expanded ? " is-expanded" : ""}`}>
            {chart.points.map((point) => (
              <div key={point.slideId} className="rrd-slide-detail-item">
                <div className="rrd-cumulative-thumb">
                  {point.thumbnailUrl ? (
                    <img
                      src={point.thumbnailUrl}
                      alt=""
                      className="rrd-slide-thumb-img"
                    />
                  ) : (
                    <div className="rrd-slide-thumb-placeholder">
                      <FileText size={14} />
                    </div>
                  )}
                </div>
                <div className="rrd-slide-detail-copy">
                  <strong className="rrd-cumulative-slide-name">
                    {point.index + 1}번 슬라이드
                  </strong>
                  <span className="rrd-slide-detail-title">{point.slideName}</span>
                </div>
                <div className="rrd-slide-detail-metrics">
                  <span className="rrd-cumulative-slide-time">
                    소요 {formatDuration(point.actualSeconds)}
                  </span>
                  <em className="rrd-cumulative-slide-total">
                    누적 {formatDuration(point.cumulativeActualSeconds)}
                  </em>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rrd-empty-hint">슬라이드 타이밍 데이터가 없습니다.</p>
      )}
    </div>
  );
}
