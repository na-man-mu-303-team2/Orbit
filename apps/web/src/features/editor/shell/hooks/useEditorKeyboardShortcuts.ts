import type { DeckElement } from "@orbit/shared";
import { useEffect } from "react";

import {
  resolveEditorKeyboardCommand,
  type EditorEscapeLayer
} from "../editorKeyboardCommands";

export function useEditorKeyboardShortcuts(args: {
  canMutateDeck: boolean;
  copiedElementRef: { current: unknown };
  editingElementId: string | null;
  hasOpenMenu: boolean;
  hasOpenModal: boolean;
  insertToolActive: boolean;
  isCropEditing?: boolean;
  isCustomShapeEditingSelection: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onDismissLayer: (layer: EditorEscapeLayer) => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onMoveSelectionOrder: (direction: "backward" | "forward") => void;
  onNavigateSlide: (direction: "next" | "previous") => void;
  onNudge: (deltaX: number, deltaY: number) => void;
  onPaste: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSelectAll: () => void;
  onUngroup: () => void;
  onUndo: () => void;
  selectedElement: DeckElement | null;
  selectedElementIds: string[];
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const command = resolveEditorKeyboardCommand({
        altKey: event.altKey,
        canGroup: args.selectedElementIds.length > 1,
        canMutateDeck: args.canMutateDeck,
        canPaste: Boolean(args.copiedElementRef.current),
        canUngroup: args.selectedElement?.type === "group",
        code: event.code,
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        hasOpenMenu: args.hasOpenMenu,
        hasOpenModal: args.hasOpenModal,
        hasSelection: args.selectedElementIds.length > 0,
        hasSingleSelection: Boolean(args.selectedElement),
        isCropEditing: args.isCropEditing,
        isCustomShapeEditing: args.isCustomShapeEditingSelection,
        isInlineTextEditing: Boolean(args.editingElementId),
        isInsertToolActive: args.insertToolActive,
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
          case "dismiss-layer": args.onDismissLayer(command.layer); break;
          case "duplicate-selection": args.onDuplicate(); break;
          case "group-selection": args.onGroup(); break;
          case "move-selection-order":
            args.onMoveSelectionOrder(command.direction);
            break;
          case "navigate-slide": args.onNavigateSlide(command.direction); break;
          case "nudge-selection": args.onNudge(command.deltaX, command.deltaY); break;
          case "paste-selection": args.onPaste(); break;
          case "redo": args.onRedo(); break;
          case "save": if (command.canExecute) args.onSave(); break;
          case "select-all": args.onSelectAll(); break;
          case "ungroup-selection": args.onUngroup(); break;
          case "undo": args.onUndo(); break;
        }
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
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
