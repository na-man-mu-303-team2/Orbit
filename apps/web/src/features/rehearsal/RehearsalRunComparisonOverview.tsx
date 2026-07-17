import { ArrowRight, CircleCheck, Lightbulb } from "lucide-react";
import type { RehearsalRunComparisonViewModel } from "./rehearsalRunComparisonModel";

export function RehearsalRunComparisonOverview({
  model,
  compact = false,
}: {
  model: RehearsalRunComparisonViewModel;
  compact?: boolean;
}) {
  return (
    <section
      className={`rehearsal-run-comparison${compact ? " rehearsal-run-comparison-compact" : ""}`}
      aria-label="리허설 회차 비교"
    >
      <header className="rehearsal-run-comparison-header">
        <div>
          <span>회차 비교</span>
          {compact ? (
            <strong className="rehearsal-run-comparison-title">
              {model.contextLabel}
            </strong>
          ) : (
            <h2>{model.contextLabel}</h2>
          )}
        </div>
        {model.hasPreviousRun ? <small>직전 완료 회차 기준</small> : null}
      </header>

      {model.briefing.length > 0 ? (
        <section
          className="rehearsal-run-briefing"
          aria-label="다음 리허설 브리핑"
        >
          <header>
            <Lightbulb size={17} />
            <strong>다음 리허설 브리핑</strong>
            <span>먼저 챙길 {model.briefing.length}가지</span>
          </header>
          <ol>
            {model.briefing.map((item) => (
              <li key={issueKey(item)}>
                <a href={item.href}>
                  <span>{item.categoryLabel}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.slideLabel}</small>
                    <p>{item.reason}</p>
                  </div>
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className="rehearsal-run-briefing-empty">
          <CircleCheck size={18} />
          <span>
            {model.hasPreviousRun
              ? "다음 회차에 우선할 반복 핵심 이슈가 없어요."
              : "다음 회차부터 개선과 반복 이슈를 비교할 수 있어요."}
          </span>
        </div>
      )}

      {!compact && model.hasPreviousRun ? (
        model.silenceComparison ? (
          <section
            className="rehearsal-run-silence-comparison"
            aria-label="긴 침묵 회차 비교"
          >
            <strong>긴 침묵 비교</strong>
            <span>
              {model.silenceComparison.previousLongSilenceCount}회 →{" "}
              {model.silenceComparison.currentLongSilenceCount}회
            </span>
            <span>
              총{" "}
              {formatSeconds(
                model.silenceComparison.previousTotalSilenceSeconds,
              )}{" "}
              →{" "}
              {formatSeconds(
                model.silenceComparison.currentTotalSilenceSeconds,
              )}
            </span>
          </section>
        ) : null
      ) : null}

      {!compact && model.hasPreviousRun ? (
        <div className="rehearsal-run-comparison-groups">
          {model.groups.map((group) => (
            <section
              className={`rehearsal-run-comparison-group rehearsal-run-comparison-group-${group.key}`}
              key={group.key}
            >
              <header>
                <strong>{group.label}</strong>
                <span>{group.items.length}</span>
              </header>
              <p>{group.description}</p>
              {group.items.length > 0 ? (
                <ul>
                  {group.items.map((item) => (
                    <li key={issueKey(item)}>
                      <a href={item.href}>
                        <span>{item.categoryLabel}</span>
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.slideLabel}</small>
                        </div>
                        <ArrowRight size={15} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <small className="rehearsal-run-comparison-none">
                  해당 항목이 없어요
                </small>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatSeconds(seconds: number) {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}초`;
}

function issueKey(item: {
  category: string;
  cueId?: string;
  cueRevision?: number;
  slideId: string;
}) {
  return [
    item.category,
    item.slideId,
    item.cueId ?? "none",
    item.cueRevision ?? "none",
  ].join(":");
}
