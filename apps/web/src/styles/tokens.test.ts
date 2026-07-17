import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tokenSource = fs.readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");

describe("Redesign System tokens", () => {
  it("defines every required design-system category", () => {
    for (const token of [
      "--redesign-color-primary",
      "--redesign-type-display-sm-size",
      "--redesign-type-body-md-size",
      "--redesign-space-4",
      "--redesign-size-control-md",
      "--redesign-radius-lg",
      "--redesign-border-subtle",
      "--redesign-shadow-overlay",
      "--redesign-z-modal",
      "--redesign-duration-normal",
      "--redesign-breakpoint-tablet",
      "--redesign-focus-ring"
    ]) {
      expect(tokenSource).toContain(token);
    }
  });

  it("keeps the documented control, container, and panel radii", () => {
    expect(tokenSource).toContain("--redesign-radius: 0.25rem");
    expect(tokenSource).toContain("--redesign-radius-lg: 0.5rem");
    expect(tokenSource).toContain("--redesign-radius-xl: 0.75rem");
  });

  it("keeps the DESIGN.md brand palette as the light-scheme source", () => {
    expect(tokenSource).toContain("--redesign-color-primary: #0090ff");
    expect(tokenSource).toContain("--redesign-color-secondary: #8b3dff");
    expect(tokenSource).toContain("--redesign-color-tertiary: #ff2d9e");
    expect(tokenSource).toContain("--redesign-color-light-surface: #ffffff");
  });

  it("does not define a token in terms of itself", () => {
    const selfReferences = Array.from(
      tokenSource.matchAll(/^\s*(--redesign-[a-z0-9-]+):\s*var\(\1\)/gim),
      (match) => match[1]
    );

    expect(selfReferences).toEqual([]);
  });
});
