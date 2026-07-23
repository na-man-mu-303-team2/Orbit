import type {
  CompanionDeckSnapshot,
  PresentationCompanionOutputState,
} from "@orbit/shared";
import { useEffect, useMemo, useState } from "react";
import { AudienceOutputRenderer } from "../rehearsal/presenter/AudienceOutputRenderer";
import type { PresenterSlideshowState } from "../rehearsal/presenter/presenterStateStore";
import { materializeCompanionDeck } from "./companionDeckAdapter";

export function CompanionAudienceRenderer(props: {
  deck: CompanionDeckSnapshot;
  output: PresentationCompanionOutputState | null;
}) {
  const deck = useMemo(
    () => materializeCompanionDeck(props.deck),
    [props.deck],
  );
  const scale = useCompanionRendererScale(deck.canvas);

  if (!props.output) {
    return (
      <section className="presenter-companion-waiting" role="status">
        <h1>발표 자료</h1>
        <p>발표자 화면 연결을 기다리고 있습니다.</p>
      </section>
    );
  }

  const state: PresenterSlideshowState = {
    audienceOutputMode: props.output.outputMode,
    highlights: [],
    slideId: props.output.slideId,
    slideIndex: props.output.slideIndex,
    stepIndex: props.output.animationStep,
  };

  return (
    <section
      aria-label="iPad 청중 출력"
      className="presenter-companion-output"
      data-output-mode={props.output.outputMode}
      data-output-obscured={
        props.output.outputMode === "black" ? "true" : "false"
      }
      data-output-revision={props.output.outputRevision}
    >
      <AudienceOutputRenderer
        deck={deck}
        scale={scale}
        state={state}
        triggerAnimationIds={[]}
      />
    </section>
  );
}

function useCompanionRendererScale(canvas: {
  height: number;
  width: number;
}) {
  const getScale = () => {
    if (typeof window === "undefined") return 1;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight - 72);
    return Math.min(width / canvas.width, height / canvas.height);
  };
  const [scale, setScale] = useState(getScale);

  useEffect(() => {
    const handleResize = () => setScale(getScale());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [canvas.height, canvas.width]);

  return scale;
}
