import type { FormEvent, KeyboardEvent } from "react";

import {
  nextSemanticCueReviewChoice,
  type SemanticCueReviewChoice,
  type SemanticCueReviewItem
} from "./semanticCueReviewModel";

export function SemanticCueReviewCard(props: {
  index: number;
  item: SemanticCueReviewItem;
  onEditMeaning: (meaning: string) => void;
  onReviewChoice: (choice: SemanticCueReviewChoice) => void;
}) {
  const { index, item } = props;

  function submitMeaning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const meaning = readNamedInput(event.currentTarget, "meaning").trim();
    if (meaning) {
      props.onEditMeaning(meaning);
    }
  }

  return (
    <article
      aria-label={`${index + 1}번 메시지: ${item.displayLabel}`}
      className={`semantic-cue-review-card ${item.isStale ? "stale" : ""}`}
      tabIndex={0}
    >
      <header className="semantic-cue-card-header">
        <div>
          <span className="semantic-cue-order">메시지 {index + 1}</span>
          <strong>{item.displayLabel}</strong>
        </div>
        <span className="semantic-cue-review-state">{item.reviewLabel}</span>
      </header>

      <p className="semantic-cue-meaning">{item.cue.meaning}</p>

      <div className="semantic-cue-state-notices" aria-live="polite">
        {item.isStale ? (
          <span className="semantic-cue-state-notice warning">
            슬라이드 변경 후 재검토 필요
          </span>
        ) : null}
        {item.isRegenerated ? (
          <span className="semantic-cue-state-notice">
            재생성 변경 · revision {item.cue.revision}
          </span>
        ) : null}
        {item.isVisualOnly ? (
          <span className="semantic-cue-state-notice visual">
            이미지 분석만을 근거로 생성됨
          </span>
        ) : null}
      </div>

      <fieldset
        className="semantic-cue-choice-group"
        onKeyDown={(event) =>
          handleChoiceKeyDown(event, item.reviewChoice, props.onReviewChoice)
        }
      >
        <legend>평가 중요도</legend>
        {reviewChoiceOptions.map((option) => (
          <label key={option.value}>
            <input
              checked={item.reviewChoice === option.value}
              name={`semantic-cue-choice-${item.cue.cueId}`}
              type="radio"
              value={option.value}
              onChange={() => props.onReviewChoice(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <details className="semantic-cue-evidence">
        <summary>근거 {item.evidence.length}개 확인</summary>
        {item.evidence.length > 0 ? (
          <ul>
            {item.evidence.map((evidence) => (
              <li key={`${evidence.kindLabel}-${evidence.refLabel}`}>
                <span>{evidence.kindLabel}</span>
                <strong>{evidence.sourcePreview}</strong>
                <small>{evidence.refLabel}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {item.cue.origin === "manual"
              ? "발표자가 직접 추가한 메시지입니다."
              : "연결된 원본 근거가 없습니다."}
          </p>
        )}
      </details>

      {item.warningLabels.length > 0 ? (
        <ul className="semantic-cue-warning-list" aria-label="품질 경고">
          {item.warningLabels.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <form className="semantic-cue-edit-form" onSubmit={submitMeaning}>
        <label htmlFor={`semantic-cue-meaning-${item.cue.cueId}`}>
          메시지 문구
        </label>
        <div>
          <input
            defaultValue={item.cue.meaning}
            id={`semantic-cue-meaning-${item.cue.cueId}`}
            key={`${item.cue.cueId}-${item.cue.revision}-${item.cue.meaning}`}
            maxLength={240}
            name="meaning"
            required
            type="text"
          />
          <button type="submit">문구 저장</button>
        </div>
      </form>
    </article>
  );
}

function handleChoiceKeyDown(
  event: KeyboardEvent<HTMLFieldSetElement>,
  current: SemanticCueReviewChoice | null,
  onChange: (choice: SemanticCueReviewChoice) => void
) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  event.preventDefault();
  const nextChoice = nextSemanticCueReviewChoice(current, event.key);
  event.currentTarget
    .querySelector<HTMLInputElement>(`input[value="${nextChoice}"]`)
    ?.focus();
  onChange(nextChoice);
}

function readNamedInput(form: HTMLFormElement, name: string): string {
  const control = form.elements.namedItem(name);
  return control && "value" in control && typeof control.value === "string"
    ? control.value
    : "";
}

const reviewChoiceOptions: Array<{
  label: string;
  value: SemanticCueReviewChoice;
}> = [
  { label: "핵심", value: "core" },
  { label: "보조", value: "supporting" },
  { label: "제외", value: "excluded" }
];
