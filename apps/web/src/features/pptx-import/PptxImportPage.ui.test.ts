import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("PPTX import production boundary", () => {
  it("creates a new project and stores a PPTX-origin Brief before queuing import", () => {
    const source = fs.readFileSync(
      new URL("./PptxImportPage.tsx", import.meta.url),
      "utf8",
    );

    expect(source.indexOf("await createProject(")).toBeLessThan(
      source.indexOf("await createPptxImportJob("),
    );
    expect(source).toContain('origin: "pptx-import"');
    expect(source).toContain('"pptx-import",');
    expect(source).not.toMatch(/OrbitGapMockups|AiPptMockupPage/);
  });

  it("routes editor imports to the isolated new-project flow", () => {
    const editorSource = fs.readFileSync(
      new URL("../editor/shell/EditorShell.tsx", import.meta.url),
      "utf8",
    );

    expect(editorSource).toContain("/importdeck?returnTo=");
    expect(editorSource).not.toContain("function openPptxFilePicker");
  });
});
