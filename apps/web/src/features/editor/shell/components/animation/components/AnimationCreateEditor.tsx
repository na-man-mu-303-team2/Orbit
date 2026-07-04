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
  type: SupportedAnimationType;
  onAddAnimation: (draft: AnimationDraftInput) => void;
  onDraftChange: (patch: Partial<AnimationTimingDraft>) => void;
}) {
  const { canCreateAnimation, draft, type, onAddAnimation, onDraftChange } = props;

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
            })
          }
        >
          애니메이션 추가
        </button>
      </div>
    </AnimationPanelSection>
  );
}
