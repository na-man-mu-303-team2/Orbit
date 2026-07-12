export type DurationPoint = { label: string; seconds: number };

export function DurationLineChart({ series }: { series: DurationPoint[] }) {
  if (series.length < 2) return null;

  const max = Math.max(...series.map((p) => p.seconds), 1);
  const maxIndex = series.reduce(
    (bestIndex, point, index, points) =>
      point.seconds > points[bestIndex].seconds ? index : bestIndex,
    0,
  );
  const width = 640;
  const height = 220;
  const padX = 42;
  const padY = 24;
  const bottomPad = 34;
  const chartW = width - padX * 2;
  const chartH = height - padY - bottomPad;
  const axisStep = Math.max(1, Math.ceil((series.length - 1) / 5));
  const axisIndexes = new Set<number>([0, series.length - 1]);
  for (let i = 0; i < series.length; i += axisStep) axisIndexes.add(i);
  const valueIndexes = new Set([0, maxIndex, series.length - 1]);

  const points = series.map((p, i) => ({
    x: padX + (i / (series.length - 1)) * chartW,
    y: padY + (1 - p.seconds / max) * chartH,
    label: p.label,
    seconds: p.seconds,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="report-project-chart-svg"
      role="img"
      aria-label="회차별 총 소요시간 추이"
    >
      {[0, 0.5, 1].map((ratio) => {
        const y = padY + ratio * chartH;
        return (
          <line
            key={ratio}
            x1={padX}
            x2={width - padX}
            y1={y}
            y2={y}
            stroke="#e2e8f0"
            strokeDasharray="4 5"
          />
        );
      })}
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--color-primary, #6366f1)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="var(--color-primary, #6366f1)" stroke="#ffffff" strokeWidth="2" />
          {valueIndexes.has(i) ? (
            <text x={p.x} y={Math.max(14, p.y - 12)} textAnchor="middle" fontSize="12" fill="var(--color-primary, #6366f1)" fontWeight="800">
              {`${Math.round(p.seconds)}초`}
            </text>
          ) : null}
          {axisIndexes.has(i) ? (
            <text
              x={p.x}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
              fontSize="11"
              fill="currentColor"
              opacity="0.66"
            >
              {p.label}
            </text>
          ) : null}
          <title>{`${p.label}: ${Math.round(p.seconds)}초`}</title>
        </g>
      ))}
    </svg>
  );
}

export type SlideAvgTiming = { slideId: string; avgSeconds: number };

export function SlideAvgBarChart({ timings }: { timings: SlideAvgTiming[] }) {
  if (timings.length === 0) return null;

  const max = Math.max(...timings.map((t) => t.avgSeconds), 1);
  const barW = Math.max(16, Math.floor(280 / timings.length) - 4);

  return (
    <div className="report-project-slide-chart">
      {timings.map((t, i) => (
        <div
          key={t.slideId}
          className="report-project-slide-bar-wrap"
          title={`슬라이드 ${i + 1}: 평균 ${t.avgSeconds}초`}
        >
          <span className="report-project-slide-bar-value">
            {Math.round(t.avgSeconds)}초
          </span>
          <div
            className="report-project-slide-bar"
            style={{ height: `${Math.round((t.avgSeconds / max) * 80)}px`, width: `${barW}px` }}
          />
          <span className="report-project-slide-bar-label">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
