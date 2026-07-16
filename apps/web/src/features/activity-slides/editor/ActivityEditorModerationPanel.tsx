import type {
  ActivityPresenterResult,
  ActivitySlide,
  ModerateActivityTextRequest
} from "@orbit/shared";
import { useEffect, useState } from "react";

import { activityApi } from "../api/activityApi";
import { ActivityPresenterResults } from "../presenter/ActivityPresenterPanel";

export function ActivityEditorModerationPanel(props: {
  deckId: string;
  projectId: string;
  slide: ActivitySlide;
}) {
  const [result, setResult] = useState<ActivityPresenterResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const current = await activityApi.getCurrentSession(props.projectId, props.deckId);
        if (!current.session) {
          if (!cancelled) {
            setResult(null);
            setSessionId(null);
          }
          return;
        }
        const { run } = await activityApi.ensureRun(
          props.projectId,
          current.session.sessionId,
          props.slide.activity.activityId
        );
        const response = await activityApi.getPresenterResult(
          props.projectId,
          current.session.sessionId,
          run.activityRunId
        );
        if (!cancelled) {
          setResult(response.result);
          setSessionId(current.session.sessionId);
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "결과를 불러오지 못했습니다.");
      }
    }
    void refresh();
    const timerId = window.setInterval(() => void refresh(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [props.deckId, props.projectId, props.slide.activity.activityId]);

  async function moderate(
    entryId: string,
    patch: Pick<ModerateActivityTextRequest, "moderationStatus" | "answered">
  ) {
    if (!result || !sessionId || pendingEntryId) return;
    const previous = result;
    setPendingEntryId(entryId);
    setResult({
      ...result,
      textEntries: result.textEntries.map((entry) => entry.entryId === entryId
        ? {
            ...entry,
            ...(patch.moderationStatus ? { moderationStatus: patch.moderationStatus } : {}),
            ...(patch.answered !== undefined
              ? { answeredAt: patch.answered ? new Date().toISOString() : null }
              : {})
          }
        : entry)
    });
    try {
      const response = await activityApi.moderateTextEntry(
        props.projectId,
        sessionId,
        entryId,
        { ...patch, expectedRevision: result.revision }
      );
      setResult(response.result);
      setError("");
    } catch (cause) {
      setResult(previous);
      setError(cause instanceof Error ? cause.message : "승인 상태를 저장하지 못했습니다.");
    } finally {
      setPendingEntryId(null);
    }
  }

  if (!result && !error) return null;
  return (
    <section className="activity-editor-moderation" aria-label="에디터 참여 응답 관리">
      <strong>현재 세션 응답 관리</strong>
      {error ? <p role="status">{error}</p> : null}
      {result ? (
        <ActivityPresenterResults
          disabledEntryId={pendingEntryId}
          onModerate={(entryId, patch) => void moderate(entryId, patch)}
          result={result}
          slide={props.slide}
        />
      ) : null}
    </section>
  );
}
