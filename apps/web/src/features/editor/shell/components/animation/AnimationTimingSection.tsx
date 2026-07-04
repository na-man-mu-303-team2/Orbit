import type { DeckAnimation } from "@orbit/shared";
import { Plus, Trash2 } from "lucide-react";

import { AnimationRangeField } from "./AnimationRangeField";
import { getAnimationTypeLabel } from "./animationUi";
import type { AnimationDraftInput, SupportedAnimationType } from "./types";

export function AnimationTimingSection(props: {
  animation: DeckAnimation | undefined;
  canCreateAnimation: boolean;
  draft: Omit<AnimationDraftInput, "type">;
  selectedType: SupportedAnimationType;
  onAddAnimation: (draft: AnimationDraftInput) => void;
  onDeleteAnimation: (animationId: string) => void;
  onDraftChange: (patch: Partial<Omit<AnimationDraftInput, "type">>) => void;
  onUpdateAnimation: (
    animationId: string,
    patch: Partial<DeckAnimation>
  ) => void;
}) {
  const {
    animation,
    canCreateAnimation,
    draft,
    selectedType,
    onAddAnimation,
    onDeleteAnimation,
    onDraftChange,
    onUpdateAnimation
  } = props;
  const currentValue = animation
    ? {
        delayMs: animation.delayMs,
        durationMs: animation.durationMs
      }
    : draft;

  return (
    <section className="animation-panel-section">
      <AnimationRangeField
        label="재생 시간"
        max={2000}
        min={100}
        value={currentValue.durationMs}
        onCommit={(value) => {
          if (animation) {
            onUpdateAnimation(animation.animationId, { durationMs: value });
            return;
          }

          onDraftChange({ durationMs: value });
        }}
      />
      <AnimationRangeField
        label="지연 시간"
        max={2000}
        min={0}
        value={currentValue.delayMs}
        onCommit={(value) => {
          if (animation) {
            onUpdateAnimation(animation.animationId, { delayMs: value });
            return;
          }

          onDraftChange({ delayMs: value });
        }}
      />

      <div className="animation-panel-timing-actions">
        {animation ? (
          <>
            <button
              className="animation-panel-danger-button"
              type="button"
              onClick={() => onDeleteAnimation(animation.animationId)}
            >
              <Trash2 size={14} />
              삭제
            </button>
          </>
        ) : (
          <>
            <button
              className="animation-panel-primary-button"
              disabled={!canCreateAnimation}
              type="button"
              onClick={() =>
                onAddAnimation({
                  delayMs: currentValue.delayMs,
                  durationMs: currentValue.durationMs,
                  type: selectedType
                })
              }
            >
              <Plus size={14} />
              {getAnimationTypeLabel(selectedType)} 추가
            </button>
          </>
        )}
      </div>
    </section>
  );
}
