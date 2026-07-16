import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Volume1,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { RehearsalReport } from "@orbit/shared";
import { useRehearsalAudioSegmentPlayback } from "./useRehearsalAudioSegmentPlayback";

type Props = {
  formatDuration: (totalSeconds: number) => string;
  report: RehearsalReport;
};

const initiallyVisibleIssueCount = 5;

export function RehearsalVolumeOverview({ formatDuration, report }: Props) {
  const [expanded, setExpanded] = useState(false);
  const analysis = report.volumeAnalysis;
  const issues = useMemo(
    () =>
      [...analysis.issueSegments].sort(
        (left, right) => left.startSeconds - right.startSeconds,
      ),
    [analysis.issueSegments],
  );
  const quietCount = issues.filter((issue) => issue.kind === "quiet").length;
  const loudCount = issues.length - quietCount;
  const timelineDuration = Math.max(
    1,
    report.metrics.durationSeconds,
    ...issues.map((issue) => issue.endSeconds),
  );
  const visibleIssues = expanded
    ? issues
    : issues.slice(0, initiallyVisibleIssueCount);
  const playback = useRehearsalAudioSegmentPlayback(report.runId);

  return (
    <section className="rrd-card rrd-volume-section">
      <header className="rrd-volume-section-head">
        <div className="rrd-volume-section-title">
          <div className="rrd-volume-section-heading">
            <Volume2 size={22} aria-hidden="true" />
            <h2>음량 변화 구간</h2>
          </div>
          <p>
            이 리허설의 전체 발화와 비교해 음량이 달라진 구간을
            확인하세요.
          </p>
        </div>
        <div className="rrd-volume-section-stats" aria-label="음량 변화 요약">
          <div>
            <span>전체 발화보다 작게 말한 구간</span>
            <strong>
              {quietCount}
              <em>개</em>
            </strong>
          </div>
          <div>
            <span>전체 발화보다 크게 말한 구간</span>
            <strong>
              {loudCount}
              <em>개</em>
            </strong>
          </div>
        </div>
      </header>

      {analysis.measurementState === "unmeasured" ? (
        <p className="rrd-empty-hint">
          {analysis.reasonCode === "LEGACY_REPORT"
            ? "이 리허설은 음량 분석 기능이 적용되기 전에 생성되었어요."
            : "이 회차는 음량 변화를 측정하지 못했어요."}
        </p>
      ) : issues.length === 0 ? (
        <p className="rrd-empty-hint">
          전체 발화와 비교해 음량 변화가 큰 구간이 없었어요.
        </p>
      ) : (
        <div className="rrd-volume-dashboard">
          <div className="rrd-volume-legend" aria-label="음량 타임라인 범례">
            <span>
              <i className="is-quiet" />
              전체 발화보다 작게 말함
            </span>
            <span>
              <i className="is-loud" />
              전체 발화보다 크게 말함
            </span>
          </div>
          <div className="rrd-volume-timeline-wrap">
            <div
              className="rrd-volume-timeline"
              role="img"
              aria-label={`음량 변화 타임라인. 작게 말한 구간 ${quietCount}개, 크게 말한 구간 ${loudCount}개`}
            >
              <span className="rrd-volume-timeline-line" aria-hidden="true" />
              {issues.map((issue, index) => (
                <i
                  key={`${issue.kind}-${issue.startSeconds}-${index}`}
                  className={`rrd-volume-timeline-segment is-${issue.kind}`}
                  style={{
                    left: `${(issue.startSeconds / timelineDuration) * 100}%`,
                    width: `${Math.max(1.5, (issue.durationSeconds / timelineDuration) * 100)}%`,
                  }}
                  title={`${issueLabel(issue.kind)} · ${formatDuration(issue.startSeconds)} · ${formatDuration(issue.durationSeconds)}`}
                />
              ))}
            </div>
            <div className="rrd-volume-timeline-axis" aria-hidden="true">
              <span>0분 00초</span>
              <span>{formatDuration(timelineDuration)}</span>
            </div>
          </div>

          {playback.error && (
            <p className="rrd-volume-playback-error" role="alert">
              {playback.error}
            </p>
          )}

          <div className="rrd-volume-issue-list">
            {visibleIssues.map((issue, index) => {
              const segmentId = `${issue.kind}-${issue.startSeconds}-${issue.endSeconds}`;
              const isLoading =
                playback.status === "loading" &&
                playback.segmentId === segmentId;
              const isPlaying =
                playback.status === "playing" &&
                playback.segmentId === segmentId;
              return (
                <article
                  key={`${segmentId}-${index}`}
                  className={`rrd-volume-issue is-${issue.kind}`}
                >
                  <div className="rrd-volume-issue-icon" aria-hidden="true">
                    {issue.kind === "quiet" ? (
                      <Volume1 size={19} />
                    ) : (
                      <Volume2 size={19} />
                    )}
                  </div>
                  <div className="rrd-volume-issue-copy">
                    <strong>{issueLabel(issue.kind)}</strong>
                    <p>
                      {formatDuration(issue.startSeconds)} 지점부터{" "}
                      {formatDuration(issue.durationSeconds)} 동안 이어졌어요.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rrd-volume-playback-button"
                    disabled={isLoading}
                    onClick={() => {
                      if (isPlaying) {
                        playback.stop();
                        return;
                      }
                      void playback.playSegment(
                        segmentId,
                        issue.startSeconds,
                        issue.endSeconds,
                      );
                    }}
                    aria-label={`${issueLabel(issue.kind)} ${formatDuration(issue.startSeconds)} 지점 ${isPlaying ? "재생 중지" : "재생"}`}
                  >
                    {isPlaying ? (
                      <Pause size={15} aria-hidden="true" />
                    ) : (
                      <Play size={15} aria-hidden="true" />
                    )}
                    {isLoading
                      ? "불러오는 중"
                      : isPlaying
                        ? "재생 중지"
                        : "이 구간 들어보기"}
                  </button>
                </article>
              );
            })}
          </div>

          {issues.length > initiallyVisibleIssueCount && (
            <button
              type="button"
              className="rrd-volume-expand-button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? "접기" : `전체 ${issues.length}개 보기`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function issueLabel(kind: "quiet" | "loud") {
  return kind === "quiet"
    ? "전체 발화보다 작게 말한 구간"
    : "전체 발화보다 크게 말한 구간";
}
