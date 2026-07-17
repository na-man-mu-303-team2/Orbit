import { describe, expect, it } from "vitest";

import { isEditorSaveShortcut } from "./useEditorKeyboardShortcuts";

describe("isEditorSaveShortcut", () => {
  it("accepts Ctrl+S and Cmd+S", () => {
    expect(
      isEditorSaveShortcut({
        ctrlKey: true,
        key: "s",
        metaKey: false,
        repeat: false,
      }),
    ).toBe(true);
    expect(
      isEditorSaveShortcut({
        ctrlKey: false,
        key: "S",
        metaKey: true,
        repeat: false,
      }),
    ).toBe(true);
  });

  it("ignores unrelated and repeated shortcuts", () => {
    expect(
      isEditorSaveShortcut({
        ctrlKey: true,
        key: "p",
        metaKey: false,
        repeat: false,
      }),
    ).toBe(false);
    expect(
      isEditorSaveShortcut({
        ctrlKey: true,
        key: "s",
        metaKey: false,
        repeat: true,
      }),
    ).toBe(false);
  });
});
