import { AnimationPanelFooter } from "./AnimationPanelFooter";
import { AnimationInspectorPanel } from "./AnimationInspectorPanel";
import { AnimationSidePanelFrame } from "./AnimationSidePanelFrame";
import type { AnimationEditorPanelProps } from "../types";
import type { PointerEvent as ReactPointerEvent } from "react";

type AnimationSidePanelProps = AnimationEditorPanelProps & {
  canPlaySlideAnimations: boolean;
  isPlayingSlideAnimations: boolean;
  onClose: () => void;
  onPlaySlideAnimations: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function AnimationSidePanel(props: AnimationSidePanelProps) {
  const {
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
    onAddAnimation,
    showIds,
    onClose,
    onPlaySlideAnimations,
    onResizeStart,
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
      <AnimationInspectorPanel
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
