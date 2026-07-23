import { buildSlidePresentationSequence } from "@orbit/editor-core";
import type { Slide } from "@orbit/shared";
import {
  IconGripVertical as GripVertical,
  IconLock as LockKeyhole,
} from "@tabler/icons-react";
import { useState } from "react";

import { AnimationPanelSection } from "./AnimationPanelSection";
import { getAnimationTypeLabel } from "../utils/animationUi";

export function AnimationSequencePanel(props: {
  slide: Slide;
  disabled?: boolean;
  onReorder: (animationIds: string[]) => void;
}) {
  const [draggingRootId, setDraggingRootId] = useState<string | null>(null);
  const sequence = buildSlidePresentationSequence(props.slide);
  const keywordByOccurrenceId = new Map(
    props.slide.actions.flatMap((action) =>
      action.trigger.kind === "keyword-occurrence"
        ? [[action.trigger.occurrenceId, action.trigger.keywordId] as const]
        : []
    )
  );

  const moveRoot = (targetRootId: string, placeAfter: boolean) => {
    if (!draggingRootId || draggingRootId === targetRootId) return;
    const source = sequence.steps.find((step) => step.rootAnimationId === draggingRootId);
    if (!source || source.kind !== "manual") return;
    const steps = [...sequence.steps];
    const sourceIndex = steps.findIndex((step) => step.rootAnimationId === draggingRootId);
    if (sourceIndex < 0) return;
    const [moved] = steps.splice(sourceIndex, 1);
    if (!moved) return;
    const targetIndex = steps.findIndex((step) => step.rootAnimationId === targetRootId);
    if (targetIndex < 0) return;
    steps.splice(targetIndex + (placeAfter ? 1 : 0), 0, moved);
    props.onReorder(steps.flatMap((step) => step.animationIds));
  };

  return (
    <AnimationPanelSection
      action={<span className="animation-inspector-status-pill active">{sequence.steps.length}단계</span>}
      title="발표 순서"
    >
      {!sequence.keywordOrderMatchesTimeline ? (
        <div className="animation-sequence-review" role="status">
          <p className="animation-editor-warning">
            대본 키워드 순서가 바뀌었습니다. 수동 효과 위치를 검토해 순서를 저장하세요.
          </p>
          <button
            className="animation-sequence-review-save"
            disabled={props.disabled}
            type="button"
            onClick={() => props.onReorder(sequence.steps.flatMap((step) => step.animationIds))}
          >
            현재 순서 저장
          </button>
        </div>
      ) : null}
      <div className="animation-sequence-list">
        {sequence.steps.map((step) => {
          const keywordId = step.occurrenceId
            ? keywordByOccurrenceId.get(step.occurrenceId)
            : null;
          const keyword = keywordId
            ? props.slide.keywords.find((candidate) => candidate.keywordId === keywordId)
            : null;
          const locked = step.kind !== "manual";
          return (
            <div
              className={`animation-sequence-step ${locked ? "locked" : "manual"}`}
              draggable={!locked && !props.disabled}
              key={step.rootAnimationId}
              onDragEnd={() => setDraggingRootId(null)}
              onDragOver={(event) => {
                if (!draggingRootId) return;
                event.preventDefault();
              }}
              onDragStart={() => setDraggingRootId(step.rootAnimationId)}
              onDrop={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                moveRoot(
                  step.rootAnimationId,
                  event.clientY >= bounds.top + bounds.height / 2,
                );
              }}
            >
              <div className="animation-sequence-step-header">
                <span className="animation-sequence-step-index">{step.stepIndex}</span>
                {locked ? <LockKeyhole aria-label="대본 순서 고정" size={14} /> : <GripVertical aria-hidden="true" size={16} />}
                <strong>
                  {step.kind === "keyword-occurrence"
                    ? `“${keyword?.text ?? "키워드"}” 발화`
                    : step.kind === "legacy-keyword"
                      ? "대본 위치 재연결 필요"
                      : step.kind === "slide-enter"
                        ? "슬라이드 시작"
                      : "클릭 진행"}
                </strong>
              </div>
              {step.animationIds.map((animationId) => {
                const animation = props.slide.animations.find(
                  (candidate) => candidate.animationId === animationId
                );
                if (!animation) return null;
                return (
                  <span className="animation-sequence-effect" key={animationId}>
                    {getAnimationTypeLabel(animation.type)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </AnimationPanelSection>
  );
}
