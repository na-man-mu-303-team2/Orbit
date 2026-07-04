import { Check } from "lucide-react";

import { AnimationPanelSection } from "./AnimationPanelSection";
import { supportedAnimationCards } from "./animationUi";
import type { SupportedAnimationType } from "./types";

export function AnimationCreatePicker(props: {
  creationType: SupportedAnimationType | null;
  linkedTypes: SupportedAnimationType[];
  onStartCreating: (type: SupportedAnimationType) => void;
}) {
  const { creationType, linkedTypes, onStartCreating } = props;

  return (
    <AnimationPanelSection title="새 효과 추가">
      <div className="animation-panel-effect-grid">
        {supportedAnimationCards.map((card) => {
          const isLinked = linkedTypes.includes(card.value);
          const isSelected = creationType === card.value;

          return (
            <button
              key={card.value}
              className={`animation-panel-effect-button${isSelected ? " selected" : ""}${isLinked ? " linked" : ""}`}
              disabled={isLinked}
              type="button"
              onClick={() => onStartCreating(card.value)}
            >
              {isSelected ? (
                <span className="animation-panel-effect-check">
                  <Check size={14} />
                </span>
              ) : null}
              <span className="animation-panel-effect-icon">
                {card.label === "페이드 인" ? "IN" : "OUT"}
              </span>
              <strong>{card.label}</strong>
              <small>{isLinked ? "이미 연결됨" : card.description}</small>
            </button>
          );
        })}
      </div>
    </AnimationPanelSection>
  );
}
