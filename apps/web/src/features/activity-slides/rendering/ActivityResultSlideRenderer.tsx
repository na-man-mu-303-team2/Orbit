import type {
  ActivityPresenterResult,
  ActivityPublicResult,
  ActivityResultsSlide,
  ActivityRun,
  ActivitySlide,
  Deck
} from "@orbit/shared";
import { IconChartBar, IconEyeOff, IconLinkOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { activityApi } from "../api/activityApi";
import "./activity-result-slide.css";

export type ActivityResultRenderState =
  | "no-run"
  | "waiting"
  | "presenter-live"
  | "public-hidden"
  | "public-results"
  | "source-missing";

type RuntimeProjection = {
  presenterResult: ActivityPresenterResult | null;
  publicResult: ActivityPublicResult | null;
  run: ActivityRun | null;
  waiting: boolean;
};

const waitingProjection: RuntimeProjection = {
  presenterResult: null,
  publicResult: null,
  run: null,
  waiting: true
};

export function ActivityResultRuntime(props: {
  deck: Deck;
  role: "audience" | "presenter";
  scale?: number;
  slide: ActivityResultsSlide;
}) {
  const source = findSource(props.deck, props.slide.activityResult.sourceActivityId);
  const [projection, setProjection] = useState<RuntimeProjection>(waitingProjection);

  useEffect(() => {
    let cancelled = false;
    if (!source) {
      setProjection({ ...waitingProjection, waiting: false });
      return;
    }

    const refresh = async () => {
      try {
        const current = await activityApi.getCurrentSession(
          props.deck.projectId,
          props.deck.deckId
        );
        if (!current.session) {
          if (!cancelled) setProjection({ ...waitingProjection, waiting: false });
          return;
        }
        const currentRun = await activityApi.getCurrentRun(
          props.deck.projectId,
          current.session.sessionId,
          source.activity.activityId
        );
        if (!currentRun.run) {
          if (!cancelled) setProjection({ ...waitingProjection, waiting: false });
          return;
        }
        if (props.role === "presenter") {
          const { result } = await activityApi.getPresenterResult(
            props.deck.projectId,
            current.session.sessionId,
            currentRun.run.activityRunId
          );
          if (!cancelled) {
            setProjection({
              presenterResult: result,
              publicResult: null,
              run: currentRun.run,
              waiting: false
            });
          }
          return;
        }
        const { result } = await activityApi.getPublicResult(
          props.deck.projectId,
          current.session.sessionId,
          currentRun.run.activityRunId
        );
        if (!cancelled) {
          setProjection({
            presenterResult: null,
            publicResult: result,
            run: currentRun.run,
            waiting: false
          });
        }
      } catch {
        if (!cancelled) setProjection({ ...waitingProjection, waiting: false });
      }
    };

    setProjection(waitingProjection);
    void refresh();
    const timerId = window.setInterval(() => void refresh(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [props.deck.deckId, props.deck.projectId, props.role, source?.activity.activityId]);

  return (
    <ActivityResultSlideRenderer
      presenterResult={projection.presenterResult}
      publicResult={projection.publicResult}
      role={props.role}
      run={projection.run}
      scale={props.scale}
      slide={props.slide}
      source={source}
      waiting={projection.waiting}
    />
  );
}

export function ActivityResultSlideRenderer(props: {
  presenterResult: ActivityPresenterResult | null;
  publicResult: ActivityPublicResult | null;
  role: "audience" | "presenter";
  run: ActivityRun | null;
  scale?: number;
  slide: ActivityResultsSlide;
  source: ActivitySlide | null;
  waiting?: boolean;
}) {
  const state = getActivityResultRenderState(props);
  const scale = props.scale ?? 1;
  const visibleResult =
    state === "presenter-live" ? props.presenterResult : props.publicResult;

  return (
    <div
      className="activity-result-slide-viewport"
      style={{ height: 1080 * scale, width: 1920 * scale }}
    >
      <section
        aria-label={props.role === "presenter" ? "발표자 결과 장표" : "공개 결과 장표"}
        className="activity-result-slide"
        data-result-state={state}
        style={{ transform: `scale(${scale})` }}
      >
        <header>
          <span>ACTIVITY RESULTS</span>
          <h1>{props.source ? `${props.source.activity.title} 결과` : "연결 결과"}</h1>
          <p>{props.slide.title}</p>
        </header>
        {visibleResult && props.source ? (
          <ResultContent
            layout={props.slide.activityResult.layout}
            presenterResult={state === "presenter-live" ? props.presenterResult : null}
            publicResult={state === "public-results" ? props.publicResult : null}
            source={props.source}
          />
        ) : (
          <ResultStateNotice state={state} />
        )}
      </section>
    </div>
  );
}

export function getActivityResultRenderState(input: {
  presenterResult: ActivityPresenterResult | null;
  publicResult: ActivityPublicResult | null;
  role: "audience" | "presenter";
  run: ActivityRun | null;
  source: ActivitySlide | null;
  waiting?: boolean;
}): ActivityResultRenderState {
  if (!input.source) return "source-missing";
  if (input.waiting) return "waiting";
  if (!input.run) return "no-run";
  if (input.role === "presenter") {
    return input.presenterResult ? "presenter-live" : "waiting";
  }
  return input.run.status === "results" && input.publicResult
    ? "public-results"
    : "public-hidden";
}

function ResultContent(props: {
  layout: ActivityResultsSlide["activityResult"]["layout"];
  presenterResult: ActivityPresenterResult | null;
  publicResult: ActivityPublicResult | null;
  source: ActivitySlide;
}) {
  const result = props.presenterResult ?? props.publicResult;
  if (!result) return null;
  const publicTexts = props.publicResult?.approvedTextEntries ?? [];
  const presenterTexts = props.presenterResult?.textEntries ?? [];

  if (props.layout === "approved-text") {
    const texts = props.presenterResult
      ? presenterTexts
      : publicTexts.map((entry) => ({ ...entry, moderationStatus: "approved" as const }));
    return (
      <section
        className="activity-result-texts"
        aria-label="주관식 결과"
        data-result-layout="approved-text"
      >
        <strong>응답 {result.responseCount}개</strong>
        {texts.length > 0 ? (
          <ul>
            {texts.slice(0, 6).map((entry) => (
              <li key={entry.entryId}>
                {entry.text}
                {props.presenterResult ? <small>{entry.moderationStatus}</small> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>표시할 주관식 응답이 없습니다.</p>
        )}
      </section>
    );
  }

  if (props.layout === "summary") {
    return (
      <section
        className="activity-result-summary-layout"
        aria-label="결과 요약"
        data-result-layout="summary"
      >
        <div className="activity-result-total">
          <IconChartBar aria-hidden="true" size={42} stroke={1.5} />
          <span>응답</span>
          <strong>{result.responseCount}</strong>
        </div>
        <ul>
          {props.source.activity.questions.map((question) => {
            const aggregate = result.aggregates.find(
              (candidate) => candidate.questionId === question.questionId
            );
            if (!aggregate) return null;
            let value = `${aggregate.responseCount}개 의견`;
            if (question.type === "rating") {
              value = `${aggregate.average?.toFixed(1) ?? "–"} / 5`;
            } else if (
              question.type === "single-choice" ||
              question.type === "multiple-choice"
            ) {
              const top = [...aggregate.choices].sort(
                (left, right) => right.count - left.count
              )[0];
              value = question.options.find(
                (option) => option.optionId === top?.optionId
              )?.label ?? "응답 없음";
            }
            return (
              <li key={question.questionId}>
                <span>{question.prompt}</span>
                <strong>{value}</strong>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section
      className="activity-result-content"
      aria-label="집계 차트"
      data-result-layout="chart"
    >
      <div className="activity-result-total">
        <IconChartBar aria-hidden="true" size={42} stroke={1.5} />
        <span>응답</span>
        <strong>{result.responseCount}</strong>
      </div>
      <div className="activity-result-grid">
        {props.source.activity.questions.map((question) => {
          const aggregate = result.aggregates.find(
            (candidate) => candidate.questionId === question.questionId
          );
          if (!aggregate) return null;
          return (
            <article key={question.questionId}>
              <span>{question.prompt}</span>
              {question.type === "rating" ? (
                <>
                  <strong>{aggregate.average?.toFixed(1) ?? "–"}<small>/ 5</small></strong>
                  <i className="activity-result-chart-track" aria-hidden="true">
                    <span style={{ width: `${((aggregate.average ?? 0) / 5) * 100}%` }} />
                  </i>
                </>
              ) : question.type === "single-choice" || question.type === "multiple-choice" ? (
                <ul>
                  {question.options.map((option) => {
                    const choice = aggregate.choices.find(
                      (candidate) => candidate.optionId === option.optionId
                    );
                    return (
                      <li key={option.optionId}>
                        <span>{option.label}</span>
                        <i className="activity-result-chart-track" aria-hidden="true">
                          <span style={{ width: `${(choice?.ratio ?? 0) * 100}%` }} />
                        </i>
                        <strong>{Math.round((choice?.ratio ?? 0) * 100)}%</strong>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <strong>{aggregate.responseCount}<small>개 의견</small></strong>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultStateNotice(props: { state: ActivityResultRenderState }) {
  const content: Record<ActivityResultRenderState, [string, string]> = {
    "no-run": ["아직 실행된 참여 장표가 없습니다", "발표 세션에서 원본 참여 장표를 실행하면 결과가 연결됩니다."],
    waiting: ["결과를 불러오는 중입니다", "잠시만 기다려주세요."],
    "presenter-live": ["결과를 준비하고 있습니다", "집계가 도착하면 자동으로 표시됩니다."],
    "public-hidden": ["결과는 아직 공개되지 않았습니다", "발표자가 결과를 공개하면 이 화면에 표시됩니다."],
    "public-results": ["공개 결과를 준비하고 있습니다", "잠시만 기다려주세요."],
    "source-missing": ["원본 참여 장표를 찾을 수 없습니다", "에디터에서 결과 장표의 원본 연결을 복구하세요."]
  };
  const [title, description] = content[props.state];
  const Icon = props.state === "source-missing" ? IconLinkOff : IconEyeOff;
  return (
    <div className="activity-result-notice" role="status">
      <Icon aria-hidden="true" size={54} stroke={1.4} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function findSource(deck: Deck, activityId: string): ActivitySlide | null {
  return (
    deck.slides.find(
      (slide): slide is ActivitySlide =>
        slide.kind === "activity" && slide.activity.activityId === activityId
    ) ?? null
  );
}
