import { useId } from "react";

const FILLER_CHART_COLORS = [
  "#0072b2",
  "#e69f00",
  "#009e73",
  "#d55e00",
  "#cc79a7",
  "#56b4e9",
] as const;

const PIE_SIZE = 200;
const PIE_CENTER = PIE_SIZE / 2;
const PIE_RADIUS = 82;

type FillerDetail = {
  word: string;
  count: number;
};

export type FillerWordChartItem = FillerDetail & {
  color: string;
  percentage: number;
};

export function buildFillerWordChartItems(
  details: readonly FillerDetail[],
  totalCount: number,
): FillerWordChartItem[] {
  if (totalCount <= 0 || details.length === 0) return [];

  const sorted = [...details].sort(
    (left, right) => right.count - left.count || left.word.localeCompare(right.word, "ko"),
  );
  const visible = sorted.slice(0, 5);
  const otherCount = sorted
    .slice(5)
    .reduce((sum, detail) => sum + detail.count, 0);
  const grouped = otherCount > 0
    ? [...visible, { word: "기타", count: otherCount }]
    : visible;

  return grouped.map((detail, index) => ({
    ...detail,
    color: FILLER_CHART_COLORS[index % FILLER_CHART_COLORS.length]!,
    percentage: (detail.count / totalCount) * 100,
  }));
}

export function FillerWordPieChart(props: {
  details: readonly FillerDetail[];
  totalCount: number;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const items = buildFillerWordChartItems(props.details, props.totalCount);

  return (
    <section className="editor-practice-filler-chart" aria-labelledby={titleId}>
      <header>
        <div>
          <h3 id={titleId}>습관어 사용 비율</h3>
          <p>연습 중 사용한 표현별 횟수와 점유율입니다.</p>
        </div>
        <strong>{props.totalCount}회</strong>
      </header>

      {items.length > 0 ? (
        <div className="editor-practice-filler-chart-body">
          <svg
            className="editor-practice-filler-pie"
            viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}
            role="img"
            aria-labelledby={`${titleId} ${descriptionId}`}
          >
            <desc id={descriptionId}>
              {items
                .map((item) => `${item.word} ${item.count}회 ${formatPercentage(item.percentage)}`)
                .join(", ")}
            </desc>
            {buildPieSegments(items).map((segment) => (
              segment.fullCircle ? (
                <circle
                  key={segment.key}
                  cx={PIE_CENTER}
                  cy={PIE_CENTER}
                  r={PIE_RADIUS}
                  fill={segment.color}
                />
              ) : (
                <path key={segment.key} d={segment.path} fill={segment.color} />
              )
            ))}
          </svg>

          <ul className="editor-practice-filler-legend" aria-label="습관어별 사용 횟수">
            {items.map((item) => (
              <li className="editor-practice-filler-legend-item" key={item.word}>
                <span
                  className="editor-practice-filler-legend-color"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="editor-practice-filler-legend-word">{item.word}</span>
                <strong>{item.count}회</strong>
                <span>{formatPercentage(item.percentage)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="editor-practice-filler-empty">감지된 습관어가 없습니다.</p>
      )}
    </section>
  );
}

type PieSegment = {
  color: string;
  fullCircle: boolean;
  key: string;
  path: string;
};

function buildPieSegments(items: readonly FillerWordChartItem[]): PieSegment[] {
  let startAngle = -Math.PI / 2;

  return items.map((item, index) => {
    if (items.length === 1) {
      return {
        color: item.color,
        fullCircle: true,
        key: `${item.word}-${index}`,
        path: "",
      };
    }

    const sweepAngle = (item.percentage / 100) * Math.PI * 2;
    const endAngle = startAngle + sweepAngle;
    const start = polarPoint(startAngle);
    const end = polarPoint(endAngle);
    const largeArcFlag = sweepAngle > Math.PI ? 1 : 0;
    const path = [
      `M ${PIE_CENTER} ${PIE_CENTER}`,
      `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
      `A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
      "Z",
    ].join(" ");
    startAngle = endAngle;

    return {
      color: item.color,
      fullCircle: false,
      key: `${item.word}-${index}`,
      path,
    };
  });
}

function polarPoint(angle: number) {
  return {
    x: PIE_CENTER + PIE_RADIUS * Math.cos(angle),
    y: PIE_CENTER + PIE_RADIUS * Math.sin(angle),
  };
}

function formatPercentage(value: number) {
  return `${Math.round(value)}%`;
}
