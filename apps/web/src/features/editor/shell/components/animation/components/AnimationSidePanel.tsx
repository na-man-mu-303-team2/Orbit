import { AnimationPanelFooter } from "./AnimationPanelFooter";
import { AnimationInspectorPanel } from "./AnimationInspectorPanel";
import { AnimationSidePanelFrame } from "./AnimationSidePanelFrame";
import { AnimationSlideTransitionEditor } from "./AnimationSlideTransitionEditor";
import type { AnimationEditorPanelProps } from "../types";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SlideTransition } from "@orbit/shared";

type AnimationSidePanelProps = AnimationEditorPanelProps & {
  canPlaySlideAnimations: boolean;
  isPlayingSlideAnimations: boolean;
  slideTransition?: SlideTransition;
  transitionMutationDisabledReason?: string | null;
  onClose: () => void;
  onPlaySlideAnimations: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onUpdateSlideTransition: (transition: SlideTransition | null) => void;
};

export function AnimationSidePanel(props: AnimationSidePanelProps) {
  const {
    actionAnimationIds,
    animations,
    canPlaySlideAnimations,
    canCreateAnimation,
    element,
    isPlayingSlideAnimations,
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
    slideTransition,
    transitionMutationDisabledReason,
    onAddAnimation,
    showIds,
    onClose,
    onPlaySlideAnimations,
    onResizeStart,
    onUpdateSlideTransition,
    onDeleteAnimation,
    onSelectKeyword,
    onSelectSlideAnimation,
    onUpdateAnimation,
  } = props;

  return (
    <AnimationSidePanelFrame
      footer={
        <AnimationPanelFooter
          canPlay={canPlaySlideAnimations}
          isPlaying={isPlayingSlideAnimations}
          onPlay={onPlaySlideAnimations}
        />
      }
      onClose={onClose}
      onResizeStart={onResizeStart}
    >
      <AnimationSlideTransitionEditor
        mutationDisabledReason={transitionMutationDisabledReason}
        transition={slideTransition}
        onUpdateTransition={onUpdateSlideTransition}
      />
      <AnimationInspectorPanel
        actionAnimationIds={actionAnimationIds}
        animations={animations}
        canCreateAnimation={canCreateAnimation}
        element={element}
        keywordOptions={keywordOptions}
        keywordTriggerRestrictionMessage={keywordTriggerRestrictionMessage}
        keywordTriggerWarningMessage={keywordTriggerWarningMessage}
        mutationDisabledReason={mutationDisabledReason}
        preferredAnimationId={preferredAnimationId}
        selectedKeywordId={selectedKeywordId}
        selectedKeywordLabel={selectedKeywordLabel}
        selectedKeywordOccurrenceId={selectedKeywordOccurrenceId}
        slideAnimations={slideAnimations}
        slideElements={slideElements}
        onAddAnimation={onAddAnimation}
        onDeleteAnimation={onDeleteAnimation}
        onSelectKeyword={onSelectKeyword}
        onSelectSlideAnimation={onSelectSlideAnimation}
        showIds={showIds}
        onUpdateAnimation={onUpdateAnimation}
      />
    </AnimationSidePanelFrame>
  );
}
