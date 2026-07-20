import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.join(process.cwd(), "src");
const practiceRoot = path.join(sourceRoot, "features", "editor", "practice");
const productionFiles = [
  "PracticeCelebrationFeedback.tsx",
  "PracticeTrendDashboard.tsx",
  "SlidePracticeHistoryPanel.tsx",
  "practiceCelebration.ts",
  "practiceTrend.ts",
  "slide-practice.css",
].map((file) => path.join(practiceRoot, file));

describe("practice growth report integration boundary", () => {
  it.each([
    "orbit-mascot-thumbs-up.webp",
    "orbit-great-stamp.webp",
  ])("ships %s as a repository WebP asset rather than a symlink", (file) => {
    const assetPath = path.join(sourceRoot, "assets", file);
    const content = fs.readFileSync(assetPath);
    expect(fs.lstatSync(assetPath).isSymbolicLink()).toBe(false);
    expect(content.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(content.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(content.length).toBeGreaterThan(1_024);
  });

  it("keeps prototype and generated-image paths out of production sources", () => {
    const source = productionFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\.codex\/visualizations|generated_images|\/Downloads\//);
    expect(source).not.toContain("prototype-final-settled");
    expect(source).not.toContain("orbit-thumbs-up.png");
    expect(source).not.toContain("orbit-great-stamp.png");
  });

  it("keeps the design-QA filler sequence out of production fallback code", () => {
    const source = productionFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).not.toContain("3.1 → 2.7 → 1.9 → 0.9 → 0.0");
  });
});
