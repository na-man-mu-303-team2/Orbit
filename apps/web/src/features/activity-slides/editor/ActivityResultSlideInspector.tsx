import type {
  ActivityResultDefinition,
  ActivityResultsSlide,
  ActivitySessionResultItem,
  ActivitySlide,
  Deck
} from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { activityApi } from "../api/activityApi";
import { activityQueryKeys } from "../model/activityQueryKeys";
import { ActivityResultSlideRenderer } from "../rendering/ActivityResultSlideRenderer";
import "./activity-slide-editor.css";

const layoutLabels: Record<ActivityResultDefinition["layout"], string> = {
  summary: "요약",
  chart: "차트",
  "approved-text": "승인된 주관식"
};

type ActivityResultSlideInspectorProps = {
  deck: Deck;
  onChange: (activityResult: ActivityResultDefinition) => void;
  onSelectSourceSlide: (slideId: string) => void;
  projectId: string;
  readOnly?: boolean;
  slide: ActivityResultsSlide;
};

export function ActivityResultSlideInspector(
  props: ActivityResultSlideInspectorProps
) {
  if (props.readOnly) {
    return <ReadOnlyActivityResultSlideInspector {...props} />;
  }

  return <EditableActivityResultSlideInspector {...props} />;
}

function EditableActivityResultSlideInspector(
  props: ActivityResultSlideInspectorProps
) {
  const sources = useMemo(
    () => props.deck.slides.filter(isActivitySlide),
    [props.deck.slides]
  );
  const source = sources.find(
    (candidate) =>
      candidate.activity.activityId ===
      props.slide.activityResult.sourceActivityId
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const sessions = useQuery({
    queryKey: activityQueryKeys.sessionList(props.projectId, props.deck.deckId),
    queryFn: () =>
      activityApi.listSessions(props.projectId, props.deck.deckId),
    staleTime: 15_000
  });
  const sessionResults = useQuery({
    enabled: Boolean(source && selectedSessionId),
    queryKey: activityQueryKeys.sessionResults(
      props.projectId,
      selectedSessionId
    ),
    queryFn: () => activityApi.getSessionResults(
      props.projectId,
      selectedSessionId
    ),
    staleTime: 5_000
  });
  const selectedResult = source
    ? findCurrentActivityResult(
        sessionResults.data?.activities ?? [],
        source.activity.activityId
      )
    : null;
  const resultsDeleted = Boolean(
    sessionResults.data?.session.resultsDeletedAt ||
    selectedResult?.availability === "results-deleted"
  );

  return (
    <div className="activity-slide-inspector activity-result-inspector">
      <div className="activity-inspector-heading">
        <span>연결 결과 장표</span>
        <h3>{source ? `${source.activity.title} 결과` : "원본 연결 필요"}</h3>
      </div>

      <label>
        원본 참여 장표
        <select
          aria-describedby={source ? undefined : "activity-result-source-help"}
          value={props.slide.activityResult.sourceActivityId}
          onChange={(event) =>
            props.onChange({
              ...props.slide.activityResult,
              sourceActivityId: event.currentTarget.value
            })
          }
        >
          {!source ? (
            <option value={props.slide.activityResult.sourceActivityId}>
              삭제된 원본
            </option>
          ) : null}
          {sources.map((candidate) => (
            <option
              key={candidate.activity.activityId}
              value={candidate.activity.activityId}
            >
              {candidate.order}. {candidate.activity.title}
            </option>
          ))}
        </select>
      </label>
      {!source ? (
        <p id="activity-result-source-help" role="alert">
          원본 참여 장표가 삭제되었습니다. 다른 원본을 선택해 연결을 복구하세요.
        </p>
      ) : (
        <button
          className="activity-inspector-secondary-button"
          type="button"
          onClick={() => props.onSelectSourceSlide(source.slideId)}
        >
          원본 장표로 이동
        </button>
      )}

      <label>
        결과 레이아웃
        <select
          value={props.slide.activityResult.layout}
          onChange={(event) =>
            props.onChange({
              ...props.slide.activityResult,
              layout: event.currentTarget
                .value as ActivityResultDefinition["layout"]
            })
          }
        >
          {Object.entries(layoutLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        미리 볼 발표 세션
        <select
          value={selectedSessionId}
          onChange={(event) => setSelectedSessionId(event.currentTarget.value)}
        >
          <option value="">선택하지 않음</option>
          {(sessions.data?.sessions ?? []).map((session) => (
            <option key={session.sessionId} value={session.sessionId}>
              {formatSessionLabel(session.createdAt, session.status)}
            </option>
          ))}
        </select>
      </label>
      {sessions.isLoading ? <p role="status">발표 세션을 불러오는 중입니다.</p> : null}
      {sessions.isError ? (
        <p role="alert">발표 세션을 불러오지 못했습니다.</p>
      ) : null}

      <div
        aria-label="결과 장표 미리보기"
        className="activity-result-preview"
        data-state={previewState({
          hasResult: Boolean(selectedResult?.result),
          loading: sessionResults.isLoading,
          resultsDeleted,
          selectedSessionId,
          source: Boolean(source)
        })}
      >
        {!source ? (
          <p>연결할 원본 참여 장표를 선택하세요.</p>
        ) : !selectedSessionId ? (
          <p>발표 세션을 선택하면 실제 결과를 미리 볼 수 있습니다.</p>
        ) : sessionResults.isLoading ? (
          <p role="status">선택한 세션의 실제 결과를 불러오는 중입니다.</p>
        ) : sessionResults.isError ? (
          <p role="alert">선택한 세션 결과를 불러오지 못했습니다.</p>
        ) : resultsDeleted ? (
          <p>이 발표 세션의 결과는 영구 삭제되었습니다.</p>
        ) : selectedResult ? (
          <ActivityResultSlideRenderer
            presenterResult={selectedResult.result}
            publicResult={null}
            role="presenter"
            run={selectedResult.run}
            scale={0.135}
            slide={props.slide}
            source={source}
          />
        ) : (
          <p>선택한 세션에서 이 참여 장표의 현재 실행 결과를 찾지 못했습니다.</p>
        )}
      </div>
      <p className="activity-system-layer-lock">
        세션 선택과 응답 데이터는 Deck에 저장되지 않습니다.
      </p>
    </div>
  );
}

function ReadOnlyActivityResultSlideInspector(
  props: ActivityResultSlideInspectorProps
) {
  const source = findActivityResultSource(
    props.deck,
    props.slide.activityResult.sourceActivityId
  );

  return (
    <div
      className="activity-slide-inspector activity-result-inspector"
      data-read-only="true"
    >
      <div className="activity-inspector-heading">
        <span>연결 결과 장표</span>
        <h3>{source ? `${source.activity.title} 결과` : "원본 연결 필요"}</h3>
        <p>보기 권한에서는 결과 장표 설정을 변경할 수 없습니다.</p>
      </div>
      <dl className="activity-read-only-summary">
        <div>
          <dt>원본 참여 장표</dt>
          <dd>{source?.activity.title ?? "삭제된 원본"}</dd>
        </div>
        <div>
          <dt>결과 레이아웃</dt>
          <dd>{layoutLabels[props.slide.activityResult.layout]}</dd>
        </div>
      </dl>
      {source ? (
        <button
          className="activity-inspector-secondary-button"
          type="button"
          onClick={() => props.onSelectSourceSlide(source.slideId)}
        >
          원본 장표로 이동
        </button>
      ) : null}
      <p className="activity-system-layer-lock">
        결과 미리보기와 세션 조회는 편집 권한이 있는 사용자에게만 제공됩니다.
      </p>
    </div>
  );
}

export function findCurrentActivityResult(
  activities: ActivitySessionResultItem[],
  sourceActivityId: string
): ActivitySessionResultItem | null {
  return activities.find(
    (item) =>
      item.run.activityId === sourceActivityId && item.run.isCurrent
  ) ?? null;
}

function previewState(input: {
  hasResult: boolean;
  loading: boolean;
  resultsDeleted: boolean;
  selectedSessionId: string;
  source: boolean;
}) {
  if (!input.source) return "source-missing";
  if (!input.selectedSessionId) return "no-session";
  if (input.loading) return "waiting";
  if (input.resultsDeleted) return "results-deleted";
  return input.hasResult ? "presenter-live" : "no-run";
}

export function findActivityResultSource(
  deck: Pick<Deck, "slides">,
  sourceActivityId: string
): ActivitySlide | null {
  return (
    deck.slides.find(
      (slide): slide is ActivitySlide =>
        slide.kind === "activity" &&
        slide.activity.activityId === sourceActivityId
    ) ?? null
  );
}

function isActivitySlide(slide: Deck["slides"][number]): slide is ActivitySlide {
  return slide.kind === "activity";
}

function formatSessionLabel(createdAt: string, status: string) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(createdAt));
  return `${date} · ${status}`;
}
