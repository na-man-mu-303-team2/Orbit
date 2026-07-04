import { AnimationPanelSection } from "./AnimationPanelSection";
import type { AnimationKeywordTriggerOption } from "../models";

export function AnimationKeywordPicker(props: {
  keywordOptions: AnimationKeywordTriggerOption[];
  selectedKeywordId: string | null;
  onSelectKeyword: (keywordId: string) => void;
}) {
  const { keywordOptions, selectedKeywordId, onSelectKeyword } = props;

  return (
    <AnimationPanelSection
      action={
        selectedKeywordId ? (
          <span className="animation-inspector-status-pill active">키워드 선택됨</span>
        ) : (
          <span className="animation-inspector-status-pill muted">선택 안 됨</span>
        )
      }
      title="키워드 트리거"
    >
      <p className="animation-panel-section-note">
        키워드를 고르면 새 애니메이션이 음성 트리거와 함께 연결됩니다.
      </p>
      {keywordOptions.length > 0 ? (
        <div className="keyword-strip animation-panel-keyword-strip">
          {keywordOptions.map((keyword) => (
            <button
              key={keyword.keywordId}
              className={`keyword-chip ${
                keyword.keywordId === selectedKeywordId ? "selected" : ""
              }`}
              type="button"
              onClick={() => onSelectKeyword(keyword.keywordId)}
            >
              <span>{keyword.label}</span>
              {keyword.required ? (
                <small className="keyword-chip-badge">필수</small>
              ) : null}
            </button>
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
