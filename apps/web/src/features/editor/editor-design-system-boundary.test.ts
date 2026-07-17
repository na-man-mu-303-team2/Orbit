import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const productionRoots = [
  path.join(webRoot, "src/features/editor"),
  path.join(webRoot, "src/components/ui"),
  path.join(webRoot, "src/styles")
];
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);
const mockupImportSegment = ["features", "mockups"].join("/");
const legacyIconPackage = ["lucide", "react"].join("-");

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

describe("ORBIT production editor design boundary", () => {
  it("does not depend on design-reference mockup code", () => {
    const violations = productionRoots.flatMap(collectSourceFiles).filter((file) =>
      fs.readFileSync(file, "utf8").includes(mockupImportSegment)
    );

    expect(violations).toEqual([]);
  });

  it("uses the canonical Tabler icon family", () => {
    const violations = productionRoots.flatMap(collectSourceFiles).filter((file) =>
      fs.readFileSync(file, "utf8").includes(legacyIconPackage)
    );

    expect(violations).toEqual([]);
  });
});
