import { AnimationCreateFlow } from "./AnimationCreateFlow";
import { AnimationExistingEditor } from "./AnimationExistingEditor";
import { AnimationExistingList } from "./AnimationExistingList";
import { AnimationInspectorEmptyState } from "./AnimationInspectorEmptyState";
import { AnimationPanelComposerEmpty } from "./AnimationPanelComposerEmpty";
import { AnimationSelectionSummary } from "./AnimationSelectionSummary";
import { AnimationSlideOverview } from "./AnimationSlideOverview";
import {
  createAnimationTimeline,
  getAnimationTimelineRoot
} from "@orbit/editor-core";
import type { AnimationEditorPanelProps } from "../types";
import { useAnimationInspectorModel } from "../hooks/useAnimationInspectorModel";
import {
  buildSlideAnimationOrdinalLabelMap,
  formatPreviousAnimationSummary,
  getPreviousSlideAnimation
} from "../utils/animationUi";

export function AnimationInspectorPanel(props: AnimationEditorPanelProps) {
  const {
    actionAnimationIds = [],
    animations,
    canCreateAnimation,
    element,
    keywordOptions,
    keywordTriggerRestrictionMessage,
    keywordTriggerWarningMessage,
    mutationDisabledReason,
    preferredAnimationId,
    selectedKeywordId,
    selectedKeywordLabel,
    selectedKeywordOccurrenceId,
    slideAnimations,
    slideElements,
    onAddAnimation,
    onDeleteAnimation,
    onSelectKeyword,
    onSelectSlideAnimation,
    showIds,
    onUpdateAnimation,
  } = props;
  const {
    creationType,
    draftByType,
    linkedTypes,
    mode,
    selectAnimation,
    selectedAnimation,
    selectedAnimationId,
    startCreating,
    summary,
    updateDraft,
  } = useAnimationInspectorModel(animations, preferredAnimationId);
  const ordinalLabelByAnimationId =
    buildSlideAnimationOrdinalLabelMap(slideAnimations);
  const previousSelectedAnimation = selectedAnimation
    ? getPreviousSlideAnimation(slideAnimations, selectedAnimation.animationId)
    : null;
  const actionAnimationIdSet = new Set(actionAnimationIds);
  const animationTimeline = createAnimationTimeline({
    animations: slideAnimations,
    legacyOnClickAnimationIds: actionAnimationIdSet
  });
  const selectedTimelineAnimation = selectedAnimation
    ? animationTimeline.effects.find(
        (animation) => animation.animationId === selectedAnimation.animationId
      )
    : null;
  const selectedTimelineRoot = selectedAnimation
    ? getAnimationTimelineRoot(animationTimeline, selectedAnimation.animationId)
    : null;
  const selectedRootHasAction =
    selectedTimelineRoot?.effects.some((effect) =>
      actionAnimationIdSet.has(effect.animationId)
    ) ?? false;
  const actionLinkedChainReason = selectedRootHasAction
    ? "이 효과는 action과 연결된 재생 체인에 포함되어 있어 시작 방식 변경이나 제거를 할 수 없습니다."
    : null;

  if (!element) {
    return slideAnimations.length > 0 ? (
      <section className="property-panel animation-inspector-panel">
        <AnimationSlideOverview
          animations={slideAnimations}
          elements={slideElements}
          focusedAnimationId={preferredAnimationId}
          ordinalLabelByAnimationId={ordinalLabelByAnimationId}
          showIds={showIds}
          onSelectAnimation={onSelectSlideAnimation}
        />
      </section>
    ) : (
      <AnimationInspectorEmptyState />
    );
  }

  return (
    <section className="property-panel animation-inspector-panel">
      <AnimationSelectionSummary
        element={element}
        showIds={showIds}
        summaryLabel={summary.label}
        summaryTone={summary.tone}
      />

      {mutationDisabledReason ? (
        <div className="animation-editor-warning" role="status">
          {mutationDisabledReason}
        </div>
      ) : null}

      <AnimationExistingList
        animations={animations}
        ordinalLabelByAnimationId={ordinalLabelByAnimationId}
        selectedAnimationId={selectedAnimationId}
        onSelectAnimation={selectAnimation}
      />

      <AnimationCreateFlow
        canCreateAnimation={canCreateAnimation && !mutationDisabledReason}
        creationType={creationType}
        draft={creationType ? draftByType[creationType] : null}
        keywordOptions={keywordOptions}
        keywordTriggerRestrictionMessage={keywordTriggerRestrictionMessage}
        keywordTriggerWarningMessage={keywordTriggerWarningMessage}
        linkedTypes={linkedTypes}
        selectedKeywordId={selectedKeywordId}
        selectedKeywordLabel={selectedKeywordLabel}
        selectedKeywordOccurrenceId={selectedKeywordOccurrenceId}
        onAddAnimation={onAddAnimation}
        onDraftChange={(patch) => {
          if (!creationType) {
            return;
          }

          updateDraft(creationType, patch);
        }}
        onSelectKeyword={onSelectKeyword}
        onStartCreating={startCreating}
      />

      {mode === "editing-existing" && selectedAnimation ? (
        <fieldset
          disabled={Boolean(mutationDisabledReason)}
          style={{ display: "contents" }}
          title={mutationDisabledReason ?? undefined}
        >
          <AnimationExistingEditor
            animation={{
              ...selectedAnimation,
              startMode:
                selectedTimelineAnimation?.startMode ?? selectedAnimation.startMode
            }}
            previousEffectSummary={
              previousSelectedAnimation
                ? formatPreviousAnimationSummary(
                    previousSelectedAnimation,
                    ordinalLabelByAnimationId
                  )
                : null
            }
            startModeChangeDisabledReason={
              actionLinkedChainReason
            }
            deleteDisabledReason={actionLinkedChainReason}
            onDeleteAnimation={onDeleteAnimation}
            onUpdateAnimation={onUpdateAnimation}
          />
        </fieldset>
      ) : null}

      {mode === "idle" ? (
        <AnimationPanelComposerEmpty hasAnimations={animations.length > 0} />
      ) : null}
    </section>
  );
}
