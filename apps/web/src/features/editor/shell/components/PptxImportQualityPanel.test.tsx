import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PptxImportQualityPanel } from "./PptxImportQualityPanel";

describe("PptxImportQualityPanel", () => {
  it("shows aggregate motion diagnostic counts", () => {
    const html = renderToStaticMarkup(
      <PptxImportQualityPanel
        state={{
          status: "succeeded",
          message: "가져오기 완료",
          warnings: [],
          qualityReport: {
            compositeScore: 84,
            metrics: {
              geometry: 90,
              text: 80,
              color: 85,
              layer: 90,
              editability: 70,
              pixelSimilarity: null,
            },
            weights: {
              geometry: 25,
              text: 15,
              color: 10,
              layer: 10,
              editability: 10,
              pixelSimilarity: 30,
            },
            editabilityCoverage: 0.7,
            appliedCap: null,
            slideReports: [],
            motionDiagnostics: {
              total: 20,
              unsupported: 2,
              downgraded: 15,
              unresolved: 1,
              excluded: 2,
              details: [],
            },
            notes: [],
          },
        }}
      />,
    );

    expect(html).toContain("pptx-motion-diagnostics");
    expect(html).toContain("미지원 2");
    expect(html).toContain("저하 15");
    expect(html).toContain("미해결 1");
    expect(html).toContain("제외 2");
  });
});
