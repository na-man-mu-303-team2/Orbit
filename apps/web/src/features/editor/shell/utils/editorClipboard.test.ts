import { describe, expect, it, vi } from "vitest";

import { getEditorClipboardImageFiles } from "./editorClipboard";

describe("editor clipboard image adapter", () => {
  it.each([
    ["image/jpeg", "clipboard-image.jpg"],
    ["image/png", "clipboard-image.png"],
    ["image/webp", "clipboard-image.webp"]
  ])("gives an unnamed %s File a MIME-safe name", (type, expectedName) => {
    const source = new File([new Uint8Array([1, 2, 3])], "", { type });

    const [file] = getEditorClipboardImageFiles({
      files: [source] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    });

    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({
      name: expectedName,
      size: source.size,
      type
    });
  });

  it("reads only image File items and never reads URL, HTML, or text", () => {
    const image = new File([new Uint8Array([1])], "capture.png", {
      type: "image/png"
    });
    const getData = vi.fn(() => "https://example.com/remote.png");
    const stringItemGetAsFile = vi.fn(() => null);
    const clipboardData: Pick<DataTransfer, "files" | "items" | "getData"> = {
      files: [] as unknown as FileList,
      getData,
      items: [
        {
          getAsFile: stringItemGetAsFile,
          kind: "string",
          type: "text/html"
        },
        {
          getAsFile: () => image,
          kind: "file",
          type: "image/png"
        }
      ] as unknown as DataTransferItemList
    };

    expect(getEditorClipboardImageFiles(clipboardData)).toEqual([image]);
    expect(getData).not.toHaveBeenCalled();
    expect(stringItemGetAsFile).not.toHaveBeenCalled();
  });

  it("ignores URL, HTML, text, and unsupported image payloads", () => {
    const getData = vi.fn(() => "<img src='https://example.com/image.png'>");
    const gif = new File([new Uint8Array([1])], "capture.gif", {
      type: "image/gif"
    });
    const clipboardData: Pick<DataTransfer, "files" | "items" | "getData"> = {
      files: [] as unknown as FileList,
      getData,
      items: [
        { kind: "string", type: "text/html" },
        { kind: "string", type: "text/plain" },
        { getAsFile: () => gif, kind: "file", type: "image/gif" }
      ] as unknown as DataTransferItemList
    };

    expect(getEditorClipboardImageFiles(clipboardData)).toEqual([]);
    expect(getData).not.toHaveBeenCalled();
  });
});
