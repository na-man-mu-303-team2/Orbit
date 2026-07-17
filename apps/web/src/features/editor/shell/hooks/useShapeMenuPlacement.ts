import { useEffect, useRef } from "react";

import type {
  EditorShellUiUpdater,
  ShapeMenuPosition
} from "../editorShellUiStore";

export function useShapeMenuPlacement(args: {
  isOpen: boolean;
  setIsOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setPosition: (
    updater: EditorShellUiUpdater<ShapeMenuPosition | null>
  ) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!args.isOpen) {
      args.setPosition(null);
      return;
    }

    function updatePosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      if (!buttonRect) {
        args.setPosition(null);
        return;
      }
      const viewportPadding = 12;
      const popoverWidth = 196;
      args.setPosition({
        left: Math.min(
          Math.max(viewportPadding, buttonRect.left),
          Math.max(viewportPadding, window.innerWidth - popoverWidth - viewportPadding)
        ),
        top: buttonRect.bottom + 10
      });
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") args.setIsOpen(false);
    }

    updatePosition();
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [args.isOpen, args.setIsOpen, args.setPosition]);

  return buttonRef;
}
