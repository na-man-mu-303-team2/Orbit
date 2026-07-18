import { AnimationCreateFlow } from "./AnimationCreateFlow";
import { AnimationExistingEditor } from "./AnimationExistingEditor";
import { AnimationExistingList } from "./AnimationExistingList";
import { AnimationInspectorEmptyState } from "./AnimationInspectorEmptyState";
import { AnimationPanelComposerEmpty } from "./AnimationPanelComposerEmpty";
import { AnimationSelectionSummary } from "./AnimationSelectionSummary";
import { AnimationSlideOverview } from "./AnimationSlideOverview";
import type { AnimationEditorPanelProps } from "../types";
import { useAnimationInspectorModel } from "../hooks/useAnimationInspectorModel";
import { buildSlideAnimationOrdinalLabelMap } from "../utils/animationUi";

export function AnimationInspectorPanel(props: AnimationEditorPanelProps) {
  const {
    animations,
    canCreateAnimation,
    element,
    keywordOptions,
    keywordTriggerRestrictionMessage,
    keywordTriggerWarningMessage,
    mutationDisabledReason = null,
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
    onUpdateAnimation
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
    updateDraft
  } = useAnimationInspectorModel(animations, preferredAnimationId);
  const ordinalLabelByAnimationId =
    buildSlideAnimationOrdinalLabelMap(slideAnimations);

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
      {mutationDisabledReason ? (
        <div className="animation-editor-warning" role="status">
          {mutationDisabledReason}
        </div>
      ) : null}
      <AnimationSelectionSummary
        element={element}
        showIds={showIds}
        summaryLabel={summary.label}
        summaryTone={summary.tone}
      />

      <AnimationExistingList
        animations={animations}
        ordinalLabelByAnimationId={ordinalLabelByAnimationId}
        selectedAnimationId={selectedAnimationId}
        onSelectAnimation={selectAnimation}
      />

      <AnimationCreateFlow
        canCreateAnimation={canCreateAnimation}
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
        >
          <AnimationExistingEditor
            animation={selectedAnimation}
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
