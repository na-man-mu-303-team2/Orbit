import { AnimationPanelSection } from "./AnimationPanelSection";
import { getAnimationTypeLabel } from "../utils/animationUi";
import { AnimationTimingFields } from "./AnimationTimingFields";
import type {
  AnimationDraftInput,
  AnimationTimingDraft,
  SupportedAnimationType
} from "../types";

export function AnimationCreateEditor(props: {
  canCreateAnimation: boolean;
  draft: AnimationTimingDraft;
  selectedKeywordId: string | null;
  selectedKeywordLabel: string | null;
  type: SupportedAnimationType;
  onAddAnimation: (draft: AnimationDraftInput, keywordId?: string | null) => void;
  onDraftChange: (patch: Partial<AnimationTimingDraft>) => void;
}) {
  const {
    canCreateAnimation,
    draft,
    selectedKeywordId,
    selectedKeywordLabel,
    type,
    onAddAnimation,
    onDraftChange
  } = props;

  return (
    <AnimationPanelSection
      action={
        <span className="animation-inspector-status-pill active">
          {getAnimationTypeLabel(type)}
        </span>
      }
      className="animation-panel-form-card"
      title="새 애니메이션 추가"
    >
      <p className="animation-panel-section-note">
        {selectedKeywordLabel
          ? `선택된 키워드 "${selectedKeywordLabel}"로 음성 트리거를 함께 생성합니다.`
          : "키워드를 선택하지 않으면 일반 애니메이션만 추가됩니다."}
      </p>
      <AnimationTimingFields
        delayMs={draft.delayMs}
        durationMs={draft.durationMs}
        onDelayChange={(delayMs) => onDraftChange({ delayMs })}
        onDurationChange={(durationMs) => onDraftChange({ durationMs })}
      />
      <div className="animation-panel-timing-actions">
        <button
          className="animation-panel-primary-button"
          disabled={!canCreateAnimation}
          type="button"
          onClick={() =>
            onAddAnimation({
              delayMs: draft.delayMs,
              durationMs: draft.durationMs,
              type
            }, selectedKeywordId)
          }
        >
          애니메이션 추가
        </button>
      </div>
    </AnimationPanelSection>
  );
}
