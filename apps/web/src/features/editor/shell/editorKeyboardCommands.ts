export type EditorKeyboardCommand =
  | { type: "copy-selection" }
  | { type: "delete-selection" }
  | { type: "duplicate-selection" }
  | { type: "navigate-slide"; direction: "next" | "previous" }
  | { type: "nudge-selection"; deltaX: number; deltaY: number }
  | { type: "paste-selection" }
  | { type: "redo" }
  | { type: "save"; canExecute: boolean }
  | { type: "undo" };

export type EditorKeyboardCommandInput = {
  altKey?: boolean;
  canMutateDeck: boolean;
  canPaste?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
  hasSelection?: boolean;
  hasSingleSelection?: boolean;
  isCustomShapeEditing?: boolean;
  isInlineTextEditing?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
};

export function resolveEditorKeyboardCommand(
  input: EditorKeyboardCommandInput,
): EditorKeyboardCommand | null {
  if (
    input.defaultPrevented ||
    isEditorKeyboardCommandSuppressedTarget(input.target ?? null)
  ) {
    return null;
  }

  const key = input.key.toLowerCase();
  const hasCommandModifier = Boolean(input.metaKey || input.ctrlKey);
  const hasUnsupportedNavigationModifier = Boolean(
    input.altKey || input.metaKey || input.ctrlKey,
  );

  if (!hasUnsupportedNavigationModifier && !input.shiftKey) {
    if (input.key === "PageUp") {
      return { direction: "previous", type: "navigate-slide" };
    }
    if (input.key === "PageDown") {
      return { direction: "next", type: "navigate-slide" };
    }
  }

  const isMutationEditingBlocked = Boolean(
    input.isInlineTextEditing || input.isCustomShapeEditing,
  );
  if (
    !input.altKey &&
    hasCommandModifier &&
    key === "s" &&
    !isMutationEditingBlocked
  ) {
    return { canExecute: input.canMutateDeck, type: "save" };
  }

  if (!input.canMutateDeck || isMutationEditingBlocked) {
    return null;
  }

  if (
    input.hasSelection &&
    !input.altKey &&
    !input.metaKey &&
    !input.ctrlKey
  ) {
    const distance = input.shiftKey ? 10 : 1;
    switch (input.key) {
      case "ArrowLeft":
        return { deltaX: -distance, deltaY: 0, type: "nudge-selection" };
      case "ArrowRight":
        return { deltaX: distance, deltaY: 0, type: "nudge-selection" };
      case "ArrowUp":
        return { deltaX: 0, deltaY: -distance, type: "nudge-selection" };
      case "ArrowDown":
        return { deltaX: 0, deltaY: distance, type: "nudge-selection" };
    }
  }

  if (!input.altKey && hasCommandModifier && key === "z") {
    return input.shiftKey ? { type: "redo" } : { type: "undo" };
  }

  if (
    input.hasSelection &&
    !hasCommandModifier &&
    !input.altKey &&
    (input.key === "Delete" || input.key === "Backspace")
  ) {
    return { type: "delete-selection" };
  }

  if (
    input.hasSingleSelection &&
    !input.altKey &&
    hasCommandModifier &&
    key === "d"
  ) {
    return { type: "duplicate-selection" };
  }

  if (!input.altKey && hasCommandModifier && key === "c" && input.hasSingleSelection) {
    return { type: "copy-selection" };
  }

  if (!input.altKey && hasCommandModifier && key === "v" && input.canPaste) {
    return { type: "paste-selection" };
  }

  return null;
}

export function isEditorKeyboardCommandSuppressedTarget(
  target: EventTarget | null,
) {
  const element = getClosestCapableElement(target);
  if (!element) {
    return false;
  }

  if (element.isContentEditable === true) {
    return true;
  }

  if (
    element.closest(
      "input, textarea, select, dialog, [role='dialog'], [role='menu']",
    )
  ) {
    return true;
  }

  const contentEditableAncestor = element.closest("[contenteditable]");
  if (!contentEditableAncestor) {
    return false;
  }

  return contentEditableAncestor.getAttribute?.("contenteditable") !== "false";
}

type ClosestCapableElement = {
  closest: (selector: string) => ClosestCapableElement | null;
  getAttribute?: (name: string) => string | null;
  isContentEditable?: boolean;
};

function getClosestCapableElement(
  target: EventTarget | null,
): ClosestCapableElement | null {
  if (!target || typeof target !== "object") {
    return null;
  }

  const candidate = target as unknown as {
    closest?: ClosestCapableElement["closest"];
    getAttribute?: ClosestCapableElement["getAttribute"];
    isContentEditable?: boolean;
    parentElement?: ClosestCapableElement | null;
  };
  if (typeof candidate.closest === "function") {
    return candidate as ClosestCapableElement;
  }

  return candidate.parentElement?.closest ? candidate.parentElement : null;
}
