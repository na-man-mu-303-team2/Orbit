import { CircleAlert, PauseCircle } from "lucide-react";
import type { Deck, RehearsalReport } from "@orbit/shared";

type Props = {
  deck: Deck | null;
  formatDuration: (totalSeconds: number) => string;
  report: RehearsalReport;
};

type PausePoint = RehearsalReport["pauseDetails"][number] & {
  index: number;
};

type SlideTransition = {
  atSecond: number;
  index: number;
  slideId: string;
  slideName: string;
};

function buildPauseDistribution(
  pauseDetails: RehearsalReport["pauseDetails"],
): PausePoint[] {
  return [...pauseDetails]
    .sort((a, b) => a.startSecond - b.startSecond)
    .map((pause, index) => ({ ...pause, index }));
}

function buildSlideTransitions(
  deck: Deck | null,
  slideTimings: RehearsalReport["slideTimings"],
): SlideTransition[] {
  let elapsed = 0;
  return slideTimings.map((timing, index) => {
    const slide = deck?.slides.find((item) => item.slideId === timing.slideId);
    const slideName = slide?.title.trim() || `슬라이드 ${slide?.order ?? index + 1}`;
    const transition = {
      atSecond: elapsed,
      index,
      slideId: timing.slideId,
      slideName,
    };
    elapsed += timing.actualSeconds;
    return transition;
  });
}

function formatTransitionLabel(transition: SlideTransition) {
  return `${transition.index + 1}장`;
}

export function RehearsalPauseOverview({
  deck,
  formatDuration,
  report,
}: Props) {
  const pauseDistribution = buildPauseDistribution(report.pauseDetails);
  const slideTransitions = buildSlideTransitions(deck, report.slideTimings);
  const totalPauseSeconds = pauseDistribution.reduce(
    (total, pause) => total + pause.durationSeconds,
    0,
  );
  const slideTotalSeconds = report.slideTimings.reduce(
    (total, timing) => total + timing.actualSeconds,
    0,
  );
  const timelineDuration = Math.max(
    1,
    report.metrics.durationSeconds,
    ...pauseDistribution.map((pause) => pause.endSecond),
    slideTotalSeconds,
  );

  return (
    <section className="rrd-card rrd-pause-section">
      <header className="rrd-pause-section-head">
        <div className="rrd-pause-section-title">
          <div className="rrd-pause-section-heading">
            <PauseCircle size={22} aria-hidden="true" />
            <h2>발화 지체 및 긴 멈춤 분석</h2>
          </div>
          <p>음성 전체 흐름에서 슬라이드 전환과 문제가 된 구간을 함께 확인하세요.</p>
        </div>
        <div className="rrd-pause-section-stats" aria-label="긴 멈춤 요약">
          <div>
            <span>TOTAL PAUSE</span>
            <strong>{pauseDistribution.length}<em>회</em></strong>
          </div>
          <div>
            <span>PAUSE DURATION</span>
            <strong>{formatDuration(totalPauseSeconds)}</strong>
          </div>
        </div>
      </header>

      {pauseDistribution.length > 0 || slideTransitions.length > 0 ? (
        <div className="rrd-pause-dashboard">
          <div className="rrd-pause-legend" aria-label="타임라인 범례">
            <span><i className="is-transition" />슬라이드 전환</span>
            <span><i className="is-pause" />긴 멈춤 구간</span>
          </div>

          <div className="rrd-pause-timeline-wrap">
            <div
              className="rrd-pause-timeline"
              role="img"
              aria-label={`음성 타임라인. 슬라이드 전환 ${slideTransitions.length}개, 긴 멈춤 ${pauseDistribution.length}개`}
            >
              <span className="rrd-pause-timeline-line" aria-hidden="true" />
              <span className="rrd-pause-timeline-start" aria-hidden="true" />
              {slideTransitions.map((transition) => (
                <span
                  key={`${transition.slideId}-${transition.index}`}
                  className="rrd-pause-timeline-transition"
                  style={{ left: `${(transition.atSecond / timelineDuration) * 100}%` }}
                  title={`${formatTransitionLabel(transition)} · ${transition.slideName} · ${formatDuration(transition.atSecond)}`}
                >
                  <b>{formatTransitionLabel(transition)}</b>
                </span>
              ))}
              {pauseDistribution.map((pause) => (
                <i
                  key={`${pause.startSecond}-${pause.index}`}
                  className={`rrd-pause-timeline-segment${pause.durationSeconds >= 3 ? " is-critical" : ""}`}
                  style={{
                    left: `${(pause.startSecond / timelineDuration) * 100}%`,
                    width: `${Math.max(1.5, (pause.durationSeconds / timelineDuration) * 100)}%`,
                  }}
                  title={`긴 멈춤 · ${formatDuration(pause.startSecond)} · ${formatDuration(pause.durationSeconds)}`}
                >
                  <b>긴 멈춤 · {formatDuration(pause.durationSeconds)}</b>
                </i>
              ))}
            </div>
            <div className="rrd-pause-timeline-axis" aria-hidden="true">
              <span>0:00</span>
              <span>{formatDuration(timelineDuration / 2)}</span>
              <span>{formatDuration(timelineDuration)}</span>
            </div>
          </div>

          <div className="rrd-pause-transition-list" aria-label="슬라이드 전환 시점">
            {slideTransitions.map((transition) => (
              <div key={`${transition.slideId}-detail`} className="rrd-pause-transition-item">
                <strong>{formatTransitionLabel(transition)}</strong>
                <span>{formatDuration(transition.atSecond)}</span>
                <small>{transition.slideName}</small>
              </div>
            ))}
          </div>

          {pauseDistribution.length > 0 ? (
            <div className="rrd-pause-alert-grid">
              {pauseDistribution.map((pause) => (
                <article
                  key={`${pause.startSecond}-${pause.index}`}
                  className={`rrd-pause-alert${pause.durationSeconds >= 3 ? " is-critical" : ""}`}
                >
                  <header>
                    {pause.durationSeconds >= 3 ? <CircleAlert size={18} /> : <PauseCircle size={18} />}
                    <strong>{pause.durationSeconds >= 3 ? "긴 멈춤 주의 구간" : "멈춤 구간"}</strong>
                    <span>{formatDuration(pause.durationSeconds)}</span>
                  </header>
                  <p>
                    {formatDuration(pause.startSecond)} 지점에서 침묵이 발생했어요. 다음 슬라이드 전환 멘트를 미리 준비해보세요.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="rrd-empty-hint">긴 멈춤 기록이 없습니다.</p>
          )}
        </div>
      ) : (
        <p className="rrd-empty-hint">음성 타임라인 데이터가 없습니다.</p>
      )}
    </section>
  );
}
