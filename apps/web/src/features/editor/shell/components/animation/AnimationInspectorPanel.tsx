import { AnimationCreateEditor } from "./AnimationCreateEditor";
import { AnimationCreatePicker } from "./AnimationCreatePicker";
import { AnimationExistingEditor } from "./AnimationExistingEditor";
import { AnimationExistingList } from "./AnimationExistingList";
import { AnimationInspectorEmptyState } from "./AnimationInspectorEmptyState";
import { AnimationPanelComposerEmpty } from "./AnimationPanelComposerEmpty";
import { AnimationSelectionSummary } from "./AnimationSelectionSummary";
import type { AnimationEditorPanelProps } from "./types";
import { useAnimationInspectorModel } from "./useAnimationInspectorModel";

export function AnimationInspectorPanel(props: AnimationEditorPanelProps) {
  const {
    animations,
    canCreateAnimation,
    element,
    onAddAnimation,
    onDeleteAnimation,
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
  } = useAnimationInspectorModel(animations);

  if (!element) {
    return <AnimationInspectorEmptyState />;
  }

  return (
    <section className="property-panel animation-inspector-panel">
      <AnimationSelectionSummary
        element={element}
        showIds={showIds}
        summaryLabel={summary.label}
        summaryTone={summary.tone}
      />

      <AnimationExistingList
        animations={animations}
        selectedAnimationId={selectedAnimationId}
        onSelectAnimation={selectAnimation}
      />

      <AnimationCreatePicker
        creationType={creationType}
        linkedTypes={linkedTypes}
        onStartCreating={startCreating}
      />

      {mode === "editing-existing" && selectedAnimation ? (
        <AnimationExistingEditor
          animation={selectedAnimation}
          onDeleteAnimation={onDeleteAnimation}
          onUpdateAnimation={onUpdateAnimation}
        />
      ) : null}

      {mode === "creating-new" && creationType ? (
        <AnimationCreateEditor
          canCreateAnimation={canCreateAnimation}
          draft={draftByType[creationType]}
          type={creationType}
          onAddAnimation={onAddAnimation}
          onDraftChange={(patch) => updateDraft(creationType, patch)}
        />
      ) : null}

      {mode === "idle" ? (
        <AnimationPanelComposerEmpty hasAnimations={animations.length > 0} />
      ) : null}
    </section>
  );
}
