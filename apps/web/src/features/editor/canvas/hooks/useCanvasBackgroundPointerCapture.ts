import type Konva from "konva";
import { useEffect } from "react";

export function cancelCanvasMarqueeFromKeyboardEvent(args: {
  event: Pick<
    KeyboardEvent,
    "key" | "preventDefault" | "stopImmediatePropagation" | "target"
  >;
  onCancelMarquee: () => boolean;
}): boolean {
  if (
    args.event.key !== "Escape" ||
    !args.onCancelMarquee()
  ) {
    return false;
  }

  args.event.preventDefault();
  args.event.stopImmediatePropagation();
  return true;
}

export function useCanvasBackgroundPointerCapture(args: {
  enabled?: boolean;
  onCancelMarquee: () => boolean;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
}) {
  const {
    enabled = true,
    onCancelMarquee,
    stageRef
  } = args;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const stageContainer = stageRef.current?.container();

    if (!stageContainer) {
      return;
    }

    function handlePointerCancel() {
      onCancelMarquee();
    }

    function handleKeyDown(event: KeyboardEvent) {
      cancelCanvasMarqueeFromKeyboardEvent({
        event,
        onCancelMarquee
      });
    }

    stageContainer.addEventListener("pointercancel", handlePointerCancel, true);
    stageContainer.addEventListener("lostpointercapture", handlePointerCancel, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      stageContainer.removeEventListener("pointercancel", handlePointerCancel, true);
      stageContainer.removeEventListener(
        "lostpointercapture",
        handlePointerCancel,
        true
      );
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, onCancelMarquee, stageRef]);
}
