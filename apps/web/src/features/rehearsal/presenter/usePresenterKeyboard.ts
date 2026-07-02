import { useEffect } from "react";

export type PresenterKeyboardCommand = "next-step" | "previous-slide";

const presenterKeyboardIgnoredTargetSelector = [
  "[contenteditable='true']",
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='textbox']"
].join(", ");

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
  if (isPresenterKeyboardIgnoredTarget(event.target)) {
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

export function isPresenterKeyboardIgnoredTarget(target: EventTarget | null) {
  if (isElementLike(target)) {
    return (
      Boolean(target.isContentEditable) ||
      Boolean(target.closest(presenterKeyboardIgnoredTargetSelector))
    );
  }

  if (typeof Node !== "undefined" && target instanceof Node) {
    return Boolean(
      target.parentElement?.closest(presenterKeyboardIgnoredTargetSelector)
    );
  }

  return false;
}

export function isPresenterKeyboardEditableTarget(target: EventTarget | null) {
  return isPresenterKeyboardIgnoredTarget(target);
}

function isElementLike(
  target: EventTarget | null
): target is EventTarget & {
  closest: (selector: string) => unknown;
  isContentEditable?: boolean;
} {
  return (
    typeof target === "object" &&
    target !== null &&
    "closest" in target &&
    typeof target.closest === "function"
  );
}
