import type { PointerEvent as ReactPointerEvent } from "react";

type HorizontalPaneResizeDirection = "expand-left" | "expand-right";

type BeginHorizontalPaneResizeArgs = {
  direction: HorizontalPaneResizeDirection;
  event: ReactPointerEvent<HTMLButtonElement>;
  maxWidth: number;
  minWidth: number;
  onResizeStart?: () => void;
  onWidthChange: (width: number) => void;
  startWidth: number;
};

export function beginHorizontalPaneResize(
  args: BeginHorizontalPaneResizeArgs
) {
  const {
    direction,
    event,
    maxWidth,
    minWidth,
    onResizeStart,
    onWidthChange,
    startWidth
  } = args;

  event.preventDefault();
  onResizeStart?.();

  const startX = event.clientX;

  function handlePointerMove(pointerEvent: PointerEvent) {
    const delta =
      direction === "expand-right"
        ? pointerEvent.clientX - startX
        : startX - pointerEvent.clientX;
    const nextWidth = Math.min(
      maxWidth,
      Math.max(minWidth, startWidth + delta)
    );
    onWidthChange(nextWidth);
  }

  function handlePointerUp() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}
