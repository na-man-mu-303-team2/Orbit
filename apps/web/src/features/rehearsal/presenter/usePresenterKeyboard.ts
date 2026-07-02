import { useEffect } from "react";

export type PresenterKeyboardCommand = "next-step" | "previous-slide";

export function usePresenterKeyboard(args: {
  enabled?: boolean;
  onNextStep: () => void;
  onPreviousSlide: () => void;
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
}) {
  const {
    enabled = true,
    onNextStep,
    onPreviousSlide,
    target = typeof window === "undefined" ? undefined : window
  } = args;

  useEffect(() => {
    if (!enabled || !target) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const command = getPresenterKeyboardCommand(event);

      if (!command) {
        return;
      }

      event.preventDefault();
      if (command === "next-step") {
        onNextStep();
      } else {
        onPreviousSlide();
      }
    };

    target.addEventListener("keydown", handleKeyDown);

    return () => {
      target.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onNextStep, onPreviousSlide, target]);
}

export function getPresenterKeyboardCommand(
  event: Pick<KeyboardEvent, "key" | "target">
): PresenterKeyboardCommand | null {
  if (isPresenterKeyboardEditableTarget(event.target)) {
    return null;
  }

  if (
    event.key === " " ||
    event.key === "ArrowRight" ||
    event.key === "PageDown" ||
    event.key === "Enter"
  ) {
    return "next-step";
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    return "previous-slide";
  }

  return null;
}

export function isPresenterKeyboardEditableTarget(target: EventTarget | null) {
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target.closest("[contenteditable='true'], input, textarea, select"))
    );
  }

  if (typeof Node !== "undefined" && target instanceof Node) {
    return Boolean(
      target.parentElement?.closest("[contenteditable='true'], input, textarea, select")
    );
  }

  return false;
}
