import { describe, expect, it } from "vitest";

import { resolveEditorPasteAction } from "./useEditorKeyboardShortcuts";

describe("editor paste precedence", () => {
  it("prioritizes image Files over the copied element clipboard", () => {
    const image = new File([new Uint8Array([1])], "clipboard.png", {
      type: "image/png"
    });

    expect(
      resolveEditorPasteAction(
        pasteInput({ clipboardData: clipboardWithFiles([image]) })
      )
    ).toEqual({ files: [image], type: "paste-image" });
  });

  it("uses the copied element clipboard when there is no image File", () => {
    expect(resolveEditorPasteAction(pasteInput())).toEqual({
      type: "paste-element"
    });
  });

  it("keeps native paste for editable and dialog targets", () => {
    const image = new File([new Uint8Array([1])], "clipboard.png", {
      type: "image/png"
    });
    const clipboardData = clipboardWithFiles([image]);
    const editableTarget = {
      closest: (selector: string) =>
        selector.includes("input") ? editableTarget : null,
      isContentEditable: false
    } as unknown as EventTarget;

    expect(
      resolveEditorPasteAction(
        pasteInput({ clipboardData, target: editableTarget })
      )
    ).toEqual({ type: "native" });
    expect(
      resolveEditorPasteAction(
        pasteInput({ clipboardData, hasOpenModal: true })
      )
    ).toEqual({ type: "native" });
  });

  it("does not fall back to element paste when image insertion is blocked", () => {
    const image = new File([new Uint8Array([1])], "clipboard.png", {
      type: "image/png"
    });

    expect(
      resolveEditorPasteAction(
        pasteInput({
          canPasteImage: false,
          clipboardData: clipboardWithFiles([image])
        })
      )
    ).toEqual({ type: "native" });
  });
});

function pasteInput(
  override: Partial<Parameters<typeof resolveEditorPasteAction>[0]> = {}
): Parameters<typeof resolveEditorPasteAction>[0] {
  return {
    canMutateDeck: true,
    canPasteImage: true,
    clipboardData: clipboardWithFiles([]),
    defaultPrevented: false,
    editingElementId: null,
    hasCopiedElement: true,
    hasOpenMenu: false,
    hasOpenModal: false,
    isCropEditing: false,
    isCustomShapeEditingSelection: false,
    target: null,
    ...override
  };
}

function clipboardWithFiles(
  files: File[]
): Pick<DataTransfer, "files" | "items"> {
  return {
    files: files as unknown as FileList,
    items: [] as unknown as DataTransferItemList
  };
}
