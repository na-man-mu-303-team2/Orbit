import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(
  path.join(process.cwd(), "src/features/editor/practice/slide-practice.css"),
  "utf8",
);

describe("practice growth report responsive layout", () => {
  it("keeps the exact 1280, 1279, 960, and 959px layout boundaries", () => {
    expect(css).toContain("@media (min-width: 1280px)");
    expect(css).toContain('grid-template-areas: "trend metrics context"');
    expect(css).toContain("@media (min-width: 960px) and (max-width: 1279px)");
    expect(css).toContain('"trend metrics"\n      "trend context"');
    expect(css).toContain("grid-template-columns: minmax(0, 2fr) minmax(0, 1fr)");
    expect(css).toContain("@media (min-width: 960px) and (max-width: 1099px)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("uses a single min-width-zero column below 960px", () => {
    expect(css).toContain('grid-template-areas:\n    "trend"\n    "metrics"\n    "context"');
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
