import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiPptCreationPage } from "./AiPptCreationPage";

describe("AI PPT creation UI", () => {
  it("does not expose the payload review step", () => {
    const html = renderToStaticMarkup(createElement(AiPptCreationPage));

    expect(html).toContain(">References<");
    expect(html).not.toContain(">Review<");
    expect(html).not.toContain("고급 설정 JSON 보기");
  });

  it("keeps production routes and mockups on separate dependency boundaries", () => {
    const appSource = fs.readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
    const mockupSource = fs.readFileSync(
      new URL("../mockups/OrbitGapMockups.tsx", import.meta.url),
      "utf8"
    );

    expect(appSource).toContain('from "./features/ai-ppt/AiPptCreationPage"');
    expect(appSource).not.toMatch(/AiPptMockupPage|features\/mockups\/.*AiPpt/);
    expect(mockupSource).not.toMatch(/AiPptCreationPage|ProjectAssetWorkspace|presentationBriefApi/);
  });
});
