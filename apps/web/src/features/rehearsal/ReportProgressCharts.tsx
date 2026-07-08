export type DurationPoint = { label: string; seconds: number };

export function DurationLineChart({ series }: { series: DurationPoint[] }) {
  if (series.length < 2) return null;

  const max = Math.max(...series.map((p) => p.seconds), 1);
  const width = 320;
  const height = 120;
  const padX = 32;
  const padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = series.map((p, i) => ({
    x: padX + (i / (series.length - 1)) * chartW,
    y: padY + (1 - p.seconds / max) * chartH,
    label: p.label,
    seconds: p.seconds,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="report-project-chart-svg">
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--color-primary, #6366f1)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="var(--color-primary, #6366f1)" />
          <text
            x={p.x}
            y={Math.max(10, p.y - 10)}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-primary, #6366f1)"
            fontWeight="700"
          >
            {`${Math.round(p.seconds)}초`}
          </text>
          <text x={p.x} y={height - 2} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">
            {p.label}
          </text>
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
