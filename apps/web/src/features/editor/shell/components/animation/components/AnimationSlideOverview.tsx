import type { DeckAnimation, DeckElement } from "@orbit/shared";

import { IdBadge } from "../../EditorIdBadge";
import { AnimationPanelSection } from "./AnimationPanelSection";
import {
  formatAnimationTimingSummary,
  getAnimationElementLabel,
  getAnimationTypeLabel
} from "../utils/animationUi";

function getAnimationTargetLabel(
  animation: DeckAnimation,
  elements: DeckElement[]
) {
  const targetElement = elements.find(
    (element) => element.elementId === animation.elementId
  );

  if (!targetElement) {
    return "대상 요소 없음";
  }

  return getAnimationElementLabel(targetElement);
}

export function AnimationSlideOverview(props: {
  animations: DeckAnimation[];
  elements: DeckElement[];
  focusedAnimationId?: string | null;
  onSelectAnimation: (animation: DeckAnimation) => void;
  showIds: boolean;
}) {
  const {
    animations,
    elements,
    focusedAnimationId = null,
    onSelectAnimation,
    showIds
  } = props;

  return (
    <AnimationPanelSection
      action={
        <span className="animation-inspector-status-pill active">
          {animations.length}개
        </span>
      }
      title="이 슬라이드의 애니메이션"
    >
      {animations.length > 0 ? (
        <div className="animation-panel-existing-list">
          {animations.map((animation) => {
            const isSelected = focusedAnimationId === animation.animationId;

            return (
              <button
                key={animation.animationId}
                className={`animation-panel-existing-item${isSelected ? " selected" : ""}`}
                type="button"
                onClick={() => onSelectAnimation(animation)}
              >
                <div className="animation-panel-existing-main">
                  <strong>{getAnimationTypeLabel(animation.type)}</strong>
                  <span>
                    {getAnimationTargetLabel(animation, elements)} ·{" "}
                    {formatAnimationTimingSummary(animation)}
                  </span>
                </div>
                <div className="animation-panel-existing-side">
                  <span className="animation-panel-existing-order">
                    {animation.order}
                  </span>
                  {showIds ? <IdBadge id={animation.animationId} /> : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="animation-panel-empty">
          <strong>이 슬라이드에 연결된 애니메이션이 없습니다.</strong>
          <p>요소를 선택한 뒤 페이드 인 또는 페이드 아웃을 추가할 수 있습니다.</p>
        </div>
      )}
    </AnimationPanelSection>
  );
}
