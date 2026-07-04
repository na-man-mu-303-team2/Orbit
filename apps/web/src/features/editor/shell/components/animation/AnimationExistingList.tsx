import type { DeckAnimation } from "@orbit/shared";

import { AnimationPanelSection } from "./AnimationPanelSection";
import {
  formatAnimationTimingSummary,
  getAnimationTypeLabel
} from "./animationUi";

export function AnimationExistingList(props: {
  animations: DeckAnimation[];
  selectedAnimationId: string | null;
  onSelectAnimation: (animationId: string) => void;
}) {
  const { animations, selectedAnimationId, onSelectAnimation } = props;

  return (
    <AnimationPanelSection
      action={
        <span className="animation-inspector-status-pill active">
          {animations.length}개
        </span>
      }
      title="연결된 애니메이션"
    >
      <div className="animation-panel-existing-list">
        {animations.map((animation) => {
          const isSelected = animation.animationId === selectedAnimationId;

          return (
            <button
              key={animation.animationId}
              className={`animation-panel-existing-item${isSelected ? " selected" : ""}`}
              type="button"
              onClick={() => onSelectAnimation(animation.animationId)}
            >
              <div className="animation-panel-existing-main">
                <strong>{getAnimationTypeLabel(animation.type)}</strong>
                <span>{formatAnimationTimingSummary(animation)}</span>
              </div>
              <span className="animation-panel-existing-order">
                {animation.order}
              </span>
            </button>
          );
        })}
      </div>
    </AnimationPanelSection>
  );
}
