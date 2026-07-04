import type { DeckAnimation } from "@orbit/shared";
import { GripVertical } from "lucide-react";

import { getAnimationTypeLabel } from "./animationUi";

export function AnimationConnectionList(props: {
  animations: DeckAnimation[];
}) {
  const { animations } = props;

  return (
    <section className="animation-panel-section">
      <div className="animation-panel-section-header">
        <strong>효과 순서</strong>
      </div>

      {animations.length > 0 ? (
        <div className="animation-panel-order-list">
          {animations.map((animation, index) => (
            <article className="animation-panel-order-item" key={animation.animationId}>
              <span className="animation-panel-order-handle" aria-hidden="true">
                <GripVertical size={16} />
              </span>
              <div className="animation-panel-order-copy">
                <strong>
                  {index + 1}. {getAnimationTypeLabel(animation.type)}
                </strong>
                <span>선택 요소 애니메이션</span>
              </div>
              <small>{animation.durationMs}ms · 지연 {animation.delayMs}ms</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="animation-panel-empty">
          <strong>연결된 애니메이션이 없습니다.</strong>
          <p>위에서 효과를 골라 바로 추가할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}
