import { AnimationPanelFooter } from "./AnimationPanelFooter";
import { AnimationInspectorPanel } from "./AnimationInspectorPanel";
import { AnimationSidePanelFrame } from "./AnimationSidePanelFrame";
import type { AnimationEditorPanelProps } from "./types";
import type { PointerEvent as ReactPointerEvent } from "react";

type AnimationSidePanelProps = AnimationEditorPanelProps & {
  onClose: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function AnimationSidePanel(props: AnimationSidePanelProps) {
  const {
    animations,
    canCreateAnimation,
    element,
    onAddAnimation,
    showIds,
    onClose,
    onResizeStart,
    onDeleteAnimation,
    onUpdateAnimation
  } = props;

  return (
    <AnimationSidePanelFrame
      footer={<AnimationPanelFooter />}
      onClose={onClose}
      onResizeStart={onResizeStart}
    >
      <AnimationInspectorPanel
        animations={animations}
        canCreateAnimation={canCreateAnimation}
        element={element}
        onAddAnimation={onAddAnimation}
        onDeleteAnimation={onDeleteAnimation}
        showIds={showIds}
        onUpdateAnimation={onUpdateAnimation}
      />
    </AnimationSidePanelFrame>
  );
}
