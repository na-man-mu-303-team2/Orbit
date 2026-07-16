import type {
  ActivityPresenterResult,
  ActivityRun,
  ActivityRuntimeStatus,
  ActivitySlide
} from "@orbit/shared";
import {
  IconChartBar,
  IconExternalLink,
  IconPlayerPause,
  IconPlayerPlay,
  IconPresentationAnalytics
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { activityApi } from "../api/activityApi";
import { canonicalActivityUrl } from "../rendering/ActivityAudienceSlideRenderer";
import "./activity-presenter-panel.css";

type ActivityPresenterRuntime = {
  audienceUrl: string;
  result: ActivityPresenterResult;
  run: ActivityRun;
  sessionId: string;
};

export function ActivityPresenterPanel(props: {
  deckId: string;
  projectId: string;
  slide: ActivitySlide;
}) {
  const [runtime, setRuntime] = useState<ActivityPresenterRuntime | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const activityId = props.slide.activity.activityId;

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const current = await activityApi.getCurrentSession(props.projectId, props.deckId);
        if (!current.session || !current.audienceUrl) {
          if (!cancelled) {
            setRuntime(null);
            setError("청중 링크에서 발표 세션을 먼저 시작해주세요.");
          }
          return;
        }
        const { run } = await activityApi.ensureRun(
          props.projectId,
          current.session.sessionId,
          activityId
        );
        const { result } = await activityApi.getPresenterResult(
          props.projectId,
          current.session.sessionId,
          run.activityRunId
        );
        if (!cancelled) {
          setRuntime({
            audienceUrl: canonicalActivityUrl(current.audienceUrl, activityId),
            result,
            run,
            sessionId: current.session.sessionId
          });
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(activityErrorMessage(cause));
      }
    };

    void setup();
    const timerId = window.setInterval(() => void setup(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [activityId, props.deckId, props.projectId]);

  const primary = useMemo(
    () => getActivityPrimaryCommand(runtime?.run.status ?? "draft"),
    [runtime?.run.status]
  );
  const average = runtime?.result.aggregates.find(
    (aggregate) => aggregate.type === "rating"
  )?.average;

  const updateStatus = async () => {
    if (!runtime || pending) return;
    setPending(true);
    setError("");
    try {
      const { run } = await activityApi.updateRunStatus(
        props.projectId,
        runtime.sessionId,
        runtime.run.activityRunId,
        { status: primary.nextStatus, expectedRevision: runtime.run.revision }
      );
      const { result } = await activityApi.getPresenterResult(
        props.projectId,
        runtime.sessionId,
        run.activityRunId
      );
      setRuntime((current) => current ? { ...current, result, run } : current);
    } catch (cause) {
      setError(activityErrorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="activity-presenter-panel" aria-label="참여 장표 운영">
      <div className="activity-presenter-panel-heading">
        <div>
          <span>ACTIVITY CONTROL</span>
          <strong>{props.slide.activity.title}</strong>
        </div>
        <ActivityStatusBadge status={runtime?.run.status ?? "draft"} />
      </div>

      <div className="activity-presenter-metrics" aria-live="polite">
        <div>
          <IconChartBar aria-hidden="true" size={20} stroke={1.7} />
          <span>실시간 응답</span>
          <strong>{runtime?.result.responseCount ?? 0}</strong>
        </div>
        <div>
          <IconPresentationAnalytics aria-hidden="true" size={20} stroke={1.7} />
          <span>평균 평점</span>
          <strong>{average == null ? "–" : average.toFixed(1)}</strong>
        </div>
      </div>

      {runtime ? (
        <a href={runtime.audienceUrl} rel="noreferrer" target="_blank">
          청중 참여 화면
          <IconExternalLink aria-hidden="true" size={15} stroke={1.7} />
        </a>
      ) : null}
      {error ? <p className="activity-presenter-error" role="status">{error}</p> : null}
      <button
        className="activity-presenter-primary-command"
        disabled={!runtime || pending}
        onClick={() => void updateStatus()}
        type="button"
      >
        {primary.nextStatus === "open" ? (
          <IconPlayerPlay aria-hidden="true" size={18} stroke={1.8} />
        ) : (
          <IconPlayerPause aria-hidden="true" size={18} stroke={1.8} />
        )}
        {pending ? "상태 변경 중" : primary.label}
      </button>
    </section>
  );
}

export function getActivityPrimaryCommand(status: ActivityRuntimeStatus): {
  label: "응답 열기" | "응답 마감" | "결과 공개" | "결과 숨기기";
  nextStatus: ActivityRuntimeStatus;
} {
  if (status === "open") return { label: "응답 마감", nextStatus: "closed" };
  if (status === "closed") return { label: "결과 공개", nextStatus: "results" };
  if (status === "results") return { label: "결과 숨기기", nextStatus: "closed" };
  return { label: "응답 열기", nextStatus: "open" };
}

function ActivityStatusBadge(props: { status: ActivityRuntimeStatus }) {
  const labels: Record<ActivityRuntimeStatus, string> = {
    draft: "준비",
    open: "응답 중",
    closed: "마감",
    results: "결과 공개"
  };
  return <span className={`activity-presenter-status activity-presenter-status--${props.status}`}>{labels[props.status]}</span>;
}

function activityErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "참여 장표 상태를 불러오지 못했습니다.";
}
