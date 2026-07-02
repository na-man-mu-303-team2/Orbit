import { describe, expect, it } from "vitest";

import {
  pptxImportJobResultSchema,
  qualityReportSchema,
  templateBlueprintSchema
} from "./template-blueprint.schema";

const qualityReport = {
  compositeScore: 84,
  metrics: {
    geometry: 90,
    text: 80,
    color: 85,
    layer: 90,
    editability: 70,
    pixelSimilarity: null
  },
  weights: {
    geometry: 25,
    text: 15,
    color: 10,
    layer: 10,
    editability: 10,
    pixelSimilarity: 30
  },
  editabilityCoverage: 0.7,
  appliedCap: null,
  notes: ["pixel renderer unavailable"]
};

describe("templateBlueprintSchema", () => {
  it("accepts replaceable content and media slots without changing deck elements", () => {
    const blueprint = templateBlueprintSchema.parse({
      templateId: "template_file_1",
      sourceFileId: "file_1",
      slides: [
        {
          slideIndex: 1,
          sourceSlideIndex: 1,
          slots: [
            {
              elementId: "el_title",
              usage: "content-slot",
              slotRole: "title",
              replaceMode: "replace",
              confidence: 0.95,
              bounds: { x: 120, y: 80, width: 800, height: 120 },
              source: { type: "placeholder", placeholderType: "title" }
            },
            {
              elementId: "el_logo",
              usage: "decoration",
              slotRole: "logo",
              replaceMode: "ignore",
              confidence: 0.8,
              bounds: { x: 1600, y: 40, width: 200, height: 80 },
              source: { type: "master", name: "Logo" }
            }
          ]
        }
      ]
    });

    expect(blueprint.slides[0].slots[0].usage).toBe("content-slot");
  });
});

describe("qualityReportSchema", () => {
  it("allows a missing pixel similarity score", () => {
    expect(qualityReportSchema.parse(qualityReport).metrics.pixelSimilarity).toBeNull();
  });
});

describe("pptxImportJobResultSchema", () => {
  it("validates the saved PPTX import job result contract", () => {
    const result = pptxImportJobResultSchema.parse({
      deckId: "deck_imported_1",
      templateId: "template_file_1",
      qualityReport,
      warnings: ["Unsupported chart was skipped"]
    });

    expect(result.qualityReport.compositeScore).toBe(84);
  });
});
