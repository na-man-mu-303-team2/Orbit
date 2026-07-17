import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.join(process.cwd(), "src");
const tokenPath = path.join(sourceRoot, "styles", "tokens.css");
const boundaryTestPath = path.join(sourceRoot, "styles", "design-system-boundary.test.ts");

function collectFiles(directory: string, extensions: ReadonlySet<string>): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath, extensions);
    return extensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

describe("Redesign System boundary", () => {
  const cssFiles = collectFiles(sourceRoot, new Set([".css"]));
  const sourceFiles = collectFiles(sourceRoot, new Set([".css", ".ts", ".tsx"]));

  it("keeps literal product UI colors in tokens.css", () => {
    const violations = cssFiles
      .filter((file) => file !== tokenPath)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        const hasLiteralColor = /#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\(/i.test(source);
        const hasNamedColor = /(?<![\w-])(white|black)(?![\w-])/i.test(source);
        return hasLiteralColor || hasNamedColor ? [path.relative(sourceRoot, file)] : [];
      });

    expect(violations).toEqual([]);
  });

  it("does not reference the replaced design system", () => {
    const violations = sourceFiles.filter((file) => file !== boundaryTestPath).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /orbit-ds-|--orbit-ds-|(?:^|\/)design-system\/(?:components|tokens)/m.test(source)
        ? [path.relative(sourceRoot, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps product corner radii in tokens.css", () => {
    const violations = cssFiles
      .filter((file) => file !== tokenPath)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        return /border-radius\s*:[^;]*\d+(?:\.\d+)?(?:px|rem)\b/i.test(source)
          ? [path.relative(sourceRoot, file)]
          : [];
      });

    expect(violations).toEqual([]);
  });

  it("keeps product typography sizes in tokens.css", () => {
    const violations = cssFiles
      .filter((file) => file !== tokenPath)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        const literalSizes = Array.from(
          source.matchAll(/font-size\s*:\s*(-?\d*\.?\d+)(px|rem)\b/gim),
          (match) => {
            const numericValue = Number(match[1]);
            return match[2]?.toLowerCase() === "rem" ? numericValue * 16 : numericValue;
          }
        );
        return literalSizes.some((size) => size > 1)
          ? [path.relative(sourceRoot, file)]
          : [];
      });

    expect(violations).toEqual([]);
  });

  it("keeps reusable spacing values on the 4px token scale", () => {
    const spacingDeclaration =
      /(?:^|[;{])\s*(?:margin|padding|gap|row-gap|column-gap|margin-(?:top|right|bottom|left|block|inline)(?:-start|-end)?|padding-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)\s*:\s*([^;}]+)/gim;
    const violations = cssFiles
      .filter((file) => file !== tokenPath)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        const hasReusableLiteral = Array.from(source.matchAll(spacingDeclaration)).some(
          (declaration) =>
            Array.from(declaration[1]?.matchAll(/(-?\d*\.?\d+)px\b/gim) ?? []).some(
              (value) => {
                const size = Math.abs(Number(value[1]));
                return size >= 4 && size <= 128;
              }
            )
        );
        return hasReusableLiteral ? [path.relative(sourceRoot, file)] : [];
      });

    expect(violations).toEqual([]);
  });

  it("keeps reusable shadows in tokens.css", () => {
    const violations = cssFiles
      .filter((file) => file !== tokenPath)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        const hasLiteralShadow = Array.from(
          source.matchAll(/box-shadow\s*:\s*([^;}]+)/gim),
          (match) => match[1]?.trim() ?? ""
        ).some((value) => !value.startsWith("var(--redesign-"));
        return hasLiteralShadow ? [path.relative(sourceRoot, file)] : [];
      });

    expect(violations).toEqual([]);
  });

  it("keeps motion durations in tokens.css", () => {
    const violations = cssFiles
      .filter((file) => file !== tokenPath)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        return /(?:^|[ ;:,(])(?:\d+ms|\d*\.\d+s)\b/im.test(source)
          ? [path.relative(sourceRoot, file)]
          : [];
      });

    expect(violations).toEqual([]);
  });

  it("defines every consumed Redesign custom property", () => {
    const definitions = new Set<string>();
    const usages = new Set<string>();

    for (const file of cssFiles) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/^\s*(--redesign-[a-z0-9-]+)\s*:/gim)) {
        if (match[1]) definitions.add(match[1]);
      }
      for (const match of source.matchAll(/var\((--redesign-[a-z0-9-]+)/gim)) {
        if (match[1]) usages.add(match[1]);
      }
    }

    expect([...usages].filter((token) => !definitions.has(token)).sort()).toEqual([]);
  });
});
