import { AnimationPanelSection } from "./AnimationPanelSection";
import type { AnimationKeywordTriggerOption } from "../models";

export function AnimationKeywordPicker(props: {
  keywordOptions: AnimationKeywordTriggerOption[];
  keywordTriggerRestrictionMessage?: string | null;
  keywordTriggerWarningMessage?: string | null;
  selectedKeywordId: string | null;
  selectedKeywordLabel: string | null;
  selectedKeywordOccurrenceId?: string | null;
  onRequestKeywordOccurrence: () => void;
}) {
  const {
    keywordOptions,
    keywordTriggerRestrictionMessage = null,
    keywordTriggerWarningMessage = null,
    selectedKeywordId,
    selectedKeywordLabel,
    selectedKeywordOccurrenceId = null,
    onRequestKeywordOccurrence
  } = props;
  const hasSelectedOccurrence = Boolean(
    selectedKeywordId && selectedKeywordOccurrenceId
  );

  return (
    <AnimationPanelSection
      action={
        hasSelectedOccurrence ? (
          <span className="animation-inspector-status-pill active">키워드 선택됨</span>
        ) : (
          <span className="animation-inspector-status-pill muted">선택 안 됨</span>
        )
      }
      title="키워드 트리거"
    >
      <p className="animation-panel-section-note">
        발표 메모에서 선택한 정확한 단어 위치에 음성 트리거를 연결합니다.
      </p>
      <div
        className={`animation-keyword-selection${
          hasSelectedOccurrence ? " selected" : ""
        }`}
      >
        <div>
          <strong>
            {hasSelectedOccurrence
              ? selectedKeywordLabel ?? "선택한 키워드"
              : "대본에서 위치를 선택하세요"}
          </strong>
          <span>
            {hasSelectedOccurrence
              ? "선택한 대본 위치가 발화되면 이 효과를 재생합니다."
              : "키워드 칩만으로는 트리거 위치를 정할 수 없습니다."}
          </span>
        </div>
        <button
          className="animation-keyword-selection-action"
          type="button"
          onClick={onRequestKeywordOccurrence}
        >
          {hasSelectedOccurrence ? "대본에서 다시 선택" : "대본에서 위치 선택"}
        </button>
      </div>
      {keywordTriggerRestrictionMessage ? (
        <div className="animation-editor-warning">
          {keywordTriggerRestrictionMessage}
        </div>
      ) : null}
      {!keywordTriggerRestrictionMessage && keywordTriggerWarningMessage ? (
        <div className="animation-editor-warning">
          {keywordTriggerWarningMessage}
        </div>
      ) : null}
      {keywordOptions.length > 0 ? (
        <div
          aria-label="등록된 키워드"
          className="keyword-strip animation-panel-keyword-strip"
        >
          {keywordOptions.map((keyword) => (
            <span
              key={keyword.keywordId}
              className={`keyword-chip ${
                keyword.keywordId === selectedKeywordId ? "selected" : ""
              }`}
            >
              <span>{keyword.label}</span>
              {keyword.required ? (
                <small className="keyword-chip-badge">필수</small>
              ) : null}
            </span>
          ))}
        </div>
      ) : (
        <span className="keyword-empty">
          발표 메모 패널에서 키워드를 먼저 등록하세요.
        </span>
      )}
    </AnimationPanelSection>
  );
}
