import { Check, CircleDotDashed, CircleOff } from "lucide-react";

import { supportedAnimationCards } from "./animationUi";
import type { SupportedAnimationType } from "./types";

export function AnimationEffectPicker(props: {
  animationsCount: number;
  selectedType: SupportedAnimationType;
  onSelectType: (type: SupportedAnimationType) => void;
}) {
  const { animationsCount, selectedType, onSelectType } = props;

  return (
    <section className="animation-panel-section">
      <div className="animation-panel-section-header">
        <strong>효과 추가</strong>
      </div>

      <div className="animation-panel-effect-grid">
        {supportedAnimationCards.map((card) => {
          const isSelected = selectedType === card.value;
          const Icon = card.value === "fade-in" ? CircleDotDashed : CircleOff;

          return (
            <button
              key={card.value}
              className={`animation-panel-effect-button ${isSelected ? "selected" : ""}`}
              type="button"
              onClick={() => onSelectType(card.value)}
            >
              <span className="animation-panel-effect-icon">
                <Icon size={22} />
              </span>
              <strong>{card.label}</strong>
              <small>{card.description}</small>
              {isSelected ? (
                <span className="animation-panel-effect-check" aria-hidden="true">
                  <Check size={14} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="animation-panel-section-note">
        연결된 효과 {animationsCount}개
      </p>
    </section>
  );
}
