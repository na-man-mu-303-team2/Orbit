import type { DeckElement } from "@orbit/shared";
import { useEffect } from "react";

export function useEditorKeyboardShortcuts(args: {
  copiedElementRef: { current: unknown };
  editingElementId: string | null;
  isCustomShapeEditingSelection: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onUndo: () => void;
  selectedElement: DeckElement | null;
  selectedElementId: string | null;
  selectedElementIds: string[];
  setCustomShapeEditElementId: (elementId: string | null) => void;
  setSelectedElementIds: (elementIds: string[]) => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isEditableTarget = isKeyboardEditableTarget(event.target);

      if (
        !isEditableTarget &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) args.onRedo();
        else args.onUndo();
      }

      if (
        !isEditableTarget &&
        !args.isCustomShapeEditingSelection &&
        (event.key === "Delete" || event.key === "Backspace") &&
        args.selectedElementIds.length > 0 &&
        (!args.editingElementId ||
          args.selectedElementIds.length > 1 ||
          args.editingElementId !== args.selectedElementId)
      ) {
        event.preventDefault();
        args.onDelete();
      }

      if (
        !isEditableTarget &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "d" &&
        args.selectedElementIds.length === 1
      ) {
        event.preventDefault();
        args.onDuplicate();
      }

      if (!isEditableTarget && (event.metaKey || event.ctrlKey)) {
        const normalizedKey = event.key.toLowerCase();

        if (normalizedKey === "c" && args.selectedElement) {
          event.preventDefault();
          args.onCopy();
        }

        if (normalizedKey === "v" && args.copiedElementRef.current) {
          event.preventDefault();
          args.onPaste();
        }
      }

      if (event.key === "Escape") {
        if (args.isCustomShapeEditingSelection) {
          args.setCustomShapeEditElementId(null);
          return;
        }

        if (
          args.selectedElementIds.length > 0 &&
          (args.selectedElementIds.length > 1 ||
            args.editingElementId !== args.selectedElementId)
        ) {
          args.setSelectedElementIds([]);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [args]);
}

export function isKeyboardEditableTarget(target: EventTarget | null) {
  if (target instanceof HTMLElement) {
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target.closest("[contenteditable='true'], input, textarea, select"))
    );
  }

  if (target instanceof Node) {
    return Boolean(
      target.parentElement?.closest(
        "[contenteditable='true'], input, textarea, select"
      )
    );
  }

  return false;
}
