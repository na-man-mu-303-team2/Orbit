import type { DeckElement } from "@orbit/shared";
import { useEffect } from "react";

import {
  resolveEditorKeyboardCommand,
  type EditorEscapeLayer,
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
  onNavigateSlide: (direction: "next" | "previous") => void;
  onNudge: (deltaX: number, deltaY: number) => void;
  onPaste: () => void;
  onRedo: () => void;
  onSave: () => void;
  onUndo: () => void;
  selectedElement: DeckElement | null;
  selectedElementIds: string[];
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const command = resolveEditorKeyboardCommand({
        altKey: event.altKey,
        canMutateDeck: args.canMutateDeck,
        canPaste: Boolean(args.copiedElementRef.current),
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

      if (!command) return;

      event.preventDefault();
      switch (command.type) {
        case "copy-selection": args.onCopy(); break;
        case "delete-selection": args.onDelete(); break;
        case "dismiss-layer": args.onDismissLayer(command.layer); break;
        case "duplicate-selection": args.onDuplicate(); break;
        case "navigate-slide": args.onNavigateSlide(command.direction); break;
        case "nudge-selection": args.onNudge(command.deltaX, command.deltaY); break;
        case "paste-selection": args.onPaste(); break;
        case "redo": args.onRedo(); break;
        case "save": if (command.canExecute) args.onSave(); break;
        case "undo": args.onUndo(); break;
      }
      event.stopImmediatePropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [args]);
}
