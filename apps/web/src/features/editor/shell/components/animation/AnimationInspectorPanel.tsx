import {
  buildAnimationSummary
} from "./animationUi";
import { AnimationConnectionList } from "./AnimationConnectionList";
import { AnimationEffectPicker } from "./AnimationEffectPicker";
import { AnimationInspectorEmptyState } from "./AnimationInspectorEmptyState";
import { AnimationSelectionSummary } from "./AnimationSelectionSummary";
import { AnimationTimingSection } from "./AnimationTimingSection";
import type { AnimationEditorPanelProps } from "./types";
import { useAnimationDrafts } from "./useAnimationDrafts";
import { useEffect, useState } from "react";

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
  const { draftByType, updateDraft } = useAnimationDrafts();
  const [selectedType, setSelectedType] = useState<"fade-in" | "fade-out">("fade-in");

  useEffect(() => {
    if (animations.some((animation) => animation.type === selectedType)) {
      return;
    }

    if (animations.some((animation) => animation.type === "fade-in")) {
      setSelectedType("fade-in");
      return;
    }

    if (animations.some((animation) => animation.type === "fade-out")) {
      setSelectedType("fade-out");
    }
  }, [animations, selectedType]);

  if (!element) {
    return <AnimationInspectorEmptyState />;
  }

  const animationSummary = buildAnimationSummary(animations, {
    emptyLabel: "미설정",
    multiDetail: (primaryLabel, count) =>
      `${primaryLabel} 포함 ${count}개의 애니메이션이 연결되어 있습니다.`,
    multiLabel: (count) => `${count}개 연결`
  });
  const selectedAnimation = animations.find((animation) => animation.type === selectedType);

  return (
    <section className="property-panel animation-inspector-panel">
      <AnimationSelectionSummary
        element={element}
        showIds={showIds}
        summaryLabel={animationSummary.label}
        summaryTone={animationSummary.tone}
      />

      <AnimationEffectPicker
        animationsCount={animations.length}
        selectedType={selectedType}
        onSelectType={setSelectedType}
      />

      <AnimationTimingSection
        animation={selectedAnimation}
        canCreateAnimation={canCreateAnimation}
        draft={draftByType[selectedType]}
        selectedType={selectedType}
        onAddAnimation={onAddAnimation}
        onDeleteAnimation={onDeleteAnimation}
        onDraftChange={(patch) => updateDraft(selectedType, patch)}
        onUpdateAnimation={onUpdateAnimation}
      />

      <AnimationConnectionList animations={animations} />
    </section>
  );
}
