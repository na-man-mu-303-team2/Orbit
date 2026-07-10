import { AlertTriangle, CheckCircle2, RefreshCw, Target } from "lucide-react";

import type {
  RehearsalReportViewModel,
  RehearsalSemanticReportItem,
} from "./rehearsalReportViewModel";

export type SemanticRetryState = {
  message?: string;
  status: "idle" | "running" | "succeeded" | "failed";
};

type Props = {
  model: RehearsalReportViewModel["semantic"];
  onRetry?: () => void;
  retryState: SemanticRetryState;
};

export function RehearsalSemanticCoverage({
  model,
  onRetry,
  retryState,
}: Props) {
  const hasOutcomeDetails =
    model.items.length > 0 ||
    model.unmeasuredItems.length > 0 ||
    model.excludedItems.length > 0;
  const coverageLabel =
    model.coverage.denominator === 0
      ? "N/A"
      : `${model.coverage.percent ?? 0}%`;

  return (
    <section
      aria-labelledby="semantic-report-title"
      className="rrd-card rrd-semantic-report"
    >
      <header className="rrd-card-head">
        <Target aria-hidden="true" className="rrd-card-icon" size={16} />
        <h2 id="semantic-report-title">의미 전달 리포트</h2>
        <span className="rrd-semantic-mode-badge">
          {model.measurementLabel}
        </span>
      </header>

      <div className={`rrd-semantic-state is-${model.tone}`} role="status">
        <div className="rrd-semantic-state-icon" aria-hidden="true">
          {model.tone === "success" ? (
            <CheckCircle2 size={20} />
          ) : (
            <AlertTriangle size={20} />
          )}
        </div>
        <div>
          <strong>{model.stateLabel}</strong>
          <p>{model.stateDetail}</p>
        </div>
        {model.retryable && onRetry ? (
          <button
            className="rrd-semantic-retry"
            disabled={retryState.status === "running"}
            onClick={onRetry}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={retryState.status === "running" ? "is-spinning" : ""}
              size={15}
            />
            {retryState.status === "running" ? "재평가 중" : "서버 재평가"}
          </button>
        ) : null}
      </div>

      {retryState.status !== "idle" && retryState.message ? (
        <p
          className={`rrd-semantic-retry-message is-${retryState.status}`}
          role={retryState.status === "failed" ? "alert" : "status"}
        >
          {retryState.message}
        </p>
      ) : null}

      {model.systemNotices.length > 0 ? (
        <section className="rrd-semantic-system-notices">
          <h3>시스템 상태 안내</h3>
          <ul>
            {model.systemNotices.map((notice) => (
              <li key={`${notice.label}-${notice.detail}`}>
                <strong>{notice.label}</strong>
                <span>{notice.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rrd-semantic-coverage-summary">
        <div className="rrd-semantic-score">
          <span>온전히 전달</span>
          <strong>{coverageLabel}</strong>
          <em>
            {model.coverage.denominator === 0
              ? "측정 가능한 Cue가 없어요"
              : `${model.coverage.coveredCount}/${model.coverage.denominator}개 Cue`}
          </em>
        </div>
        <div className="rrd-semantic-count-grid">
          <SemanticCount
            count={model.coverage.coveredCount}
            label="전달됨"
            tone="success"
          />
          <SemanticCount
            count={model.coverage.partialCount}
            label="일부 전달"
            tone="warning"
          />
          <SemanticCount
            count={model.coverage.missedCount}
            label="놓친 의미"
            tone="danger"
          />
          <SemanticCount
            count={model.unmeasuredItems.length + model.excludedItems.length}
            label="점수 제외"
            tone="muted"
          />
        </div>
      </div>

      {model.topGoals.length > 0 ? (
        <section className="rrd-semantic-goals">
          <div className="rrd-semantic-subhead">
            <h3>다음 연습 목표</h3>
            <span>최대 3개</span>
          </div>
          <ol>
            {model.topGoals.map((goal) => (
              <li key={goal.cueId}>
                <span>{goal.slideLabel}</span>
                <strong>{goal.label}</strong>
                <p>{goal.detail}</p>
                {goal.evidence ? (
                  <blockquote>발표 근거: “{goal.evidence}”</blockquote>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {hasOutcomeDetails ? (
        <div className="rrd-semantic-outcome-groups">
          {model.items.length > 0 ? (
            <SemanticOutcomeGroup items={model.items} title="Cue별 전달 결과" />
          ) : null}
          {model.unmeasuredItems.length > 0 ? (
            <SemanticOutcomeGroup
              items={model.unmeasuredItems}
              title="측정하지 못한 항목"
            />
          ) : null}
          {model.excludedItems.length > 0 ? (
            <SemanticOutcomeGroup
              items={model.excludedItems}
              title="검토에서 제외한 항목"
            />
          ) : null}
        </div>
      ) : (
        <p className="rrd-empty-hint">
          이 리허설에는 표시할 의미 Cue 결과가 없습니다.
        </p>
      )}
    </section>
  );
}

function SemanticCount(props: {
  count: number;
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  return (
    <div className={`rrd-semantic-count is-${props.tone}`}>
      <strong>{props.count}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function SemanticOutcomeGroup(props: {
  items: RehearsalSemanticReportItem[];
  title: string;
}) {
  return (
    <section className="rrd-semantic-outcome-group">
      <div className="rrd-semantic-subhead">
        <h3>{props.title}</h3>
        <span>{props.items.length}개</span>
      </div>
      <ul>
        {props.items.map((item) => (
          <li
            className={`is-${item.tone}`}
            key={`${item.cueId}-${item.cueRevision}`}
          >
            <div className="rrd-semantic-item-head">
              <div>
                <span>{item.slideLabel}</span>
                <strong>{item.label}</strong>
              </div>
              <div className="rrd-semantic-item-badges">
                <span>{item.measurementLabel}</span>
                <span>{item.importanceLabel}</span>
                <strong>{item.statusLabel}</strong>
              </div>
            </div>
            {item.missingConcepts.length > 0 ? (
              <p>빠진 내용: {item.missingConcepts.join(", ")}</p>
            ) : null}
            {item.evidence ? (
              <blockquote>발표 근거: “{item.evidence}”</blockquote>
            ) : null}
            {item.feedback ? <p>평가 피드백: {item.feedback}</p> : null}
            {item.reason ? (
              <div className="rrd-semantic-item-reason">
                <span>시스템 상태 안내</span>
                <strong>{item.reason.label}</strong>
                <p>{item.reason.detail}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
