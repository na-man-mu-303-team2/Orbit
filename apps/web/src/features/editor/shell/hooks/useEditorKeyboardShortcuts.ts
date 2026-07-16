import type { DeckElement } from "@orbit/shared";
import { useEffect } from "react";

import { resolveEditorKeyboardCommand } from "../editorKeyboardCommands";

export function useEditorKeyboardShortcuts(args: {
  canMutateDeck: boolean;
  copiedElementRef: { current: unknown };
  editingElementId: string | null;
  isCustomShapeEditingSelection: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onNavigateSlide: (direction: "next" | "previous") => void;
  onNudge: (deltaX: number, deltaY: number) => void;
  onPaste: () => void;
  onRedo: () => void;
  onSave: () => void;
  onUndo: () => void;
  selectedElement: DeckElement | null;
  selectedElementId: string | null;
  selectedElementIds: string[];
  setCustomShapeEditElementId: (elementId: string | null) => void;
  setSelectedElementIds: (elementIds: string[]) => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const command = resolveEditorKeyboardCommand({
        altKey: event.altKey,
        canMutateDeck: args.canMutateDeck,
        canPaste: Boolean(args.copiedElementRef.current),
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        hasSelection: args.selectedElementIds.length > 0,
        hasSingleSelection: Boolean(args.selectedElement),
        isCustomShapeEditing: args.isCustomShapeEditingSelection,
        isInlineTextEditing: Boolean(args.editingElementId),
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: event.target,
      });

      if (command) {
        event.preventDefault();
        switch (command.type) {
          case "copy-selection": args.onCopy(); break;
          case "delete-selection": args.onDelete(); break;
          case "duplicate-selection": args.onDuplicate(); break;
          case "navigate-slide": args.onNavigateSlide(command.direction); break;
          case "nudge-selection": args.onNudge(command.deltaX, command.deltaY); break;
          case "paste-selection": args.onPaste(); break;
          case "redo": args.onRedo(); break;
          case "save": if (command.canExecute) args.onSave(); break;
          case "undo": args.onUndo(); break;
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
