import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("FocusedSlidePreview", () => {
  it("measures the observed element without dereferencing a cleared ref", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/features/coaching/FocusedSlidePreview.tsx"),
      "utf8",
    );

    expect(source).toContain("const target = shell.current");
    expect(source).toContain("target.clientWidth");
    expect(source).not.toContain("shell.current!");
  });
});
