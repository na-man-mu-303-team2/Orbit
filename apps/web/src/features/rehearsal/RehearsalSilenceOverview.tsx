import { CircleAlert, PauseCircle } from "lucide-react";
import type { Deck, RehearsalReport } from "@orbit/shared";

type Props = {
  deck: Deck | null;
  formatDuration: (totalSeconds: number) => string;
  report: RehearsalReport;
};

export function RehearsalSilenceOverview({
  deck,
  formatDuration,
  report,
}: Props) {
  const analysis = report.silenceAnalysis;
  const longSilences = analysis.segments.filter(
    (segment) => segment.category === "long",
  );
  const transitions = buildSlideTransitions(deck, report.slideTimings);
  const timelineDuration = Math.max(
    1,
    report.metrics.durationSeconds,
    ...longSilences.map((silence) => silence.endSeconds),
  );

  return (
    <section className="rrd-card rrd-pause-section">
      <header className="rrd-pause-section-head">
        <div className="rrd-pause-section-title">
          <div className="rrd-pause-section-heading">
            <PauseCircle size={22} aria-hidden="true" />
            <h2>긴 침묵 구간 분석</h2>
          </div>
          <p>실제 음성에서 1초 이상 말하지 않은 구간을 확인하세요.</p>
        </div>
        <div className="rrd-pause-section-stats" aria-label="긴 침묵 요약">
          <div>
            <span>LONG SILENCE</span>
            <strong>
              {analysis.longSilenceCount ?? 0}
              <em>회</em>
            </strong>
          </div>
          <div>
            <span>TOTAL SILENCE</span>
            <strong>{formatDuration(analysis.totalSilenceSeconds ?? 0)}</strong>
          </div>
        </div>
      </header>

      {analysis.measurementState === "unmeasured" ? (
        <p className="rrd-empty-hint">
          이 회차는 음성 기반 침묵 구간을 측정하지 못했습니다.
        </p>
      ) : (
        <div className="rrd-pause-dashboard">
          <div className="rrd-pause-legend" aria-label="타임라인 범례">
            <span>
              <i className="is-transition" />
              슬라이드 전환
            </span>
            <span>
              <i className="is-pause" />
              1초 이상 침묵
            </span>
          </div>
          <div className="rrd-pause-timeline-wrap">
            <div
              className="rrd-pause-timeline"
              role="img"
              aria-label={`음성 타임라인. 긴 침묵 ${longSilences.length}개`}
            >
              <span className="rrd-pause-timeline-line" aria-hidden="true" />
              <span className="rrd-pause-timeline-start" aria-hidden="true" />
              {transitions.map((transition) => (
                <span
                  key={`${transition.slideId}-${transition.index}`}
                  className="rrd-pause-timeline-transition"
                  style={{
                    left: `${(transition.atSecond / timelineDuration) * 100}%`,
                  }}
                  title={`${transition.index + 1}장 · ${transition.slideName}`}
                >
                  <b>{transition.index + 1}장</b>
                </span>
              ))}
              {longSilences.map((silence, index) => (
                <i
                  key={`${silence.startSeconds}-${index}`}
                  className={`rrd-pause-timeline-segment${silence.durationSeconds >= 3 ? " is-critical" : ""}`}
                  style={{
                    left: `${(silence.startSeconds / timelineDuration) * 100}%`,
                    width: `${Math.max(1.5, (silence.durationSeconds / timelineDuration) * 100)}%`,
                  }}
                  title={`긴 침묵 · ${formatDuration(silence.startSeconds)} · ${formatDuration(silence.durationSeconds)}`}
                >
                  <b>긴 침묵 · {formatDuration(silence.durationSeconds)}</b>
                </i>
              ))}
            </div>
          </div>
          {longSilences.length > 0 ? (
            <div className="rrd-pause-alert-grid">
              {longSilences.map((silence, index) => (
                <article
                  key={`${silence.startSeconds}-detail-${index}`}
                  className={`rrd-pause-alert${silence.durationSeconds >= 3 ? " is-critical" : ""}`}
                >
                  <header>
                    {silence.durationSeconds >= 3 ? (
                      <CircleAlert size={18} />
                    ) : (
                      <PauseCircle size={18} />
                    )}
                    <strong>
                      {silence.durationSeconds >= 3
                        ? "긴 침묵 주의 구간"
                        : "침묵 구간"}
                    </strong>
                    <span>{formatDuration(silence.durationSeconds)}</span>
                  </header>
                  <p>
                    {formatDuration(silence.startSeconds)} 지점에서 1초 이상
                    말하지 않았어요.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="rrd-empty-hint">1초 이상 침묵한 구간이 없습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}

function buildSlideTransitions(
  deck: Deck | null,
  slideTimings: RehearsalReport["slideTimings"],
) {
  let elapsed = 0;
  return slideTimings.map((timing, index) => {
    const slide = deck?.slides.find((item) => item.slideId === timing.slideId);
    const transition = {
      atSecond: elapsed,
      index,
      slideId: timing.slideId,
      slideName: slide?.title.trim() || `슬라이드 ${slide?.order ?? index + 1}`,
    };
    elapsed += timing.actualSeconds;
    return transition;
  });
}
