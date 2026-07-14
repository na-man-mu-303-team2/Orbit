import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiPptCreationPage } from "./AiPptCreationPage";

describe("AI PPT creation UI", () => {
  it("presents a three-step user-facing creation flow", () => {
    const html = renderToStaticMarkup(createElement(AiPptCreationPage));

    expect(html).toContain(">발표 내용<");
    expect(html).toContain(">구성 확인<");
    expect(html).toContain(">생성<");
    expect(html).not.toContain(">References<");
    expect(html).not.toContain(">Deck<");
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

  it("persists both custom and general generation modes as production Briefs", () => {
    const source = fs.readFileSync(
      new URL("./AiPptCreationPage.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('origin: "ai-generation"');
    expect(source).toContain('briefRef: {\n          mode: "briefed"');
    expect(source).not.toContain('briefRef: { mode: "generic" }');
  });
});
