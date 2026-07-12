import { FileText } from "lucide-react";
import { useId, useMemo } from "react";
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
  isOver: boolean;
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

function roundedTopBarPath(
  x: number,
  width: number,
  top: number,
  bottom: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, Math.max(0, bottom - top));
  if (bottom - top <= 0) return "";
  if (r <= 0) {
    return `M ${x} ${bottom} L ${x} ${top} L ${x + width} ${top} L ${x + width} ${bottom} Z`;
  }
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    `L ${x + width - r} ${top}`,
    `Q ${x + width} ${top} ${x + width} ${top + r}`,
    `L ${x + width} ${bottom}`,
    "Z",
  ].join(" ");
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
      isOver: timing.actualSeconds > timing.targetSeconds,
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
  const paddingBottom = 30;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const bottomY = chartHeight - paddingBottom;
  const pointCount = slideDurationSeries.length;
  const columnWidth = plotWidth / pointCount;
  const barWidth = columnWidth * 0.44;
  const maxSeconds = Math.max(
    1,
    ...slideDurationSeries.map((item) =>
      Math.max(item.actualSeconds, item.targetSeconds),
    ),
  );

  const toY = (seconds: number) =>
    paddingTop + (1 - seconds / maxSeconds) * plotHeight;

  const points = slideDurationSeries.map((item, index) => {
    const centerX = paddingX + columnWidth * index + columnWidth / 2;
    const barX = centerX - barWidth / 2;
    const baseSeconds = Math.min(item.actualSeconds, item.targetSeconds);
    const baseTopY = toY(baseSeconds);
    const overflowTopY = toY(item.actualSeconds);
    const targetY = toY(item.targetSeconds);

    return {
      ...item,
      barPath: roundedTopBarPath(
        barX,
        barWidth,
        baseTopY,
        bottomY,
        item.isOver ? 0 : 6,
      ),
      barX,
      centerX,
      overflowPath: item.isOver
        ? roundedTopBarPath(barX, barWidth, overflowTopY, baseTopY, 6)
        : "",
      targetY,
    };
  });

  const targetLinePath = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.centerX.toFixed(2)} ${point.targetY.toFixed(2)}`,
    )
    .join(" ");
  const yTicks = [maxSeconds, maxSeconds / 2, 0].map((seconds) => ({
    label: formatAxis(seconds),
    y: toY(seconds),
  }));

  return {
    bottomY,
    chartHeight,
    chartWidth,
    points,
    targetLinePath,
    yTicks,
  };
}

export function RehearsalSlideTimingOverview({
  deck,
  formatDuration,
  slideTimings,
}: Props) {
  const gradientId = useId();

  const slideDurationSeries = useMemo(
    () => buildSlideDurationSeries(deck, slideTimings),
    [deck, slideTimings],
  );
  const chart = useMemo(
    () => buildSlideTimingChartModel(slideDurationSeries),
    [slideDurationSeries],
  );
  const overCount = slideDurationSeries.filter((item) => item.isOver).length;
  const actualGradientId = `${gradientId}-actual`;
  const overGradientId = `${gradientId}-over`;

  return (
    <div className="rrd-overview-panel rrd-overview-panel-wide">
      <div className="rrd-overview-panel-head">
        <h3 className="rrd-section-label">슬라이드별 소요 시간</h3>
        {slideDurationSeries.length > 0 && (
          <div className="rrd-overview-panel-actions">
            {overCount > 0 && (
              <strong className="rrd-timing-over-badge">
                {overCount}개 슬라이드 초과
              </strong>
            )}
            <strong className="rrd-cumulative-total">
              최대{" "}
              {formatDuration(
                Math.max(...slideDurationSeries.map((item) => item.actualSeconds)),
              )}
            </strong>
          </div>
        )}
      </div>
      {chart ? (
        <div className="rrd-cumulative-chart-card">
          <div className="rrd-timing-legend">
            <span className="rrd-timing-legend-item">
              <i className="rrd-timing-legend-swatch is-actual" />
              실제 소요 시간
            </span>
            <span className="rrd-timing-legend-item">
              <i className="rrd-timing-legend-swatch is-over" />
              권장 시간 초과
            </span>
            <span className="rrd-timing-legend-item">
              <i className="rrd-timing-legend-line" />
              권장 소요 시간
            </span>
          </div>

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
              aria-label="슬라이드별 권장 소요 시간과 실제 소요 시간 비교 그래프"
            >
              <defs>
                <linearGradient id={actualGradientId} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#bfdbfe" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id={overGradientId} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#fca5a5" />
                  <stop offset="100%" stopColor="#b91c1c" />
                </linearGradient>
              </defs>

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
                <path
                  key={`${point.slideId}-base`}
                  d={point.barPath}
                  fill={`url(#${actualGradientId})`}
                />
              ))}
              {chart.points.map((point) =>
                point.overflowPath ? (
                  <path
                    key={`${point.slideId}-over`}
                    d={point.overflowPath}
                    fill={`url(#${overGradientId})`}
                  />
                ) : null,
              )}

              <path
                d={chart.targetLinePath}
                className="rrd-timing-target-line"
              />
              {chart.points.map((point) => (
                <g key={`${point.slideId}-target`}>
                  <circle
                    className="rrd-timing-target-point-ring"
                    cx={point.centerX}
                    cy={point.targetY}
                    r="7"
                  />
                  <circle
                    className="rrd-timing-target-point"
                    cx={point.centerX}
                    cy={point.targetY}
                    r="3.5"
                  />
                </g>
              ))}
              {chart.points.map((point) => (
                <text
                  key={`${point.slideId}-x-label`}
                  className="rrd-cumulative-x-label"
                  x={point.centerX}
                  y={chart.chartHeight - 8}
                  textAnchor="middle"
                >
                  {point.index + 1}
                </text>
              ))}
            </svg>
          </div>

          <div className="rrd-slide-detail-list">
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
                  <span
                    className={`rrd-cumulative-slide-time${point.isOver ? " is-over" : ""}`}
                  >
                    소요 {formatDuration(point.actualSeconds)}
                  </span>
                  <span className="rrd-timing-slide-target">
                    권장 {formatDuration(point.targetSeconds)}
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
