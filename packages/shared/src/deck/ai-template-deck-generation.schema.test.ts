import { describe, expect, it } from "vitest";

import { aiTemplateDeckGenerationJobResultSchema } from "../index";

const qualityReport = {
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
  notes: [],
};

describe("aiTemplateDeckGenerationJobResultSchema", () => {
  it("keeps existing job results valid without timings", () => {
    const result = aiTemplateDeckGenerationJobResultSchema.parse({
      deckId: "deck_ai_1",
      templateId: "template_file_1",
      sourceFileId: "file_design",
      currentPackageFileId: "file_current",
      contentReferenceFileIds: ["file_content"],
      qualityReport,
      warnings: [],
    });

    expect(result.timings).toEqual({});
  });

  it("accepts worker stage timings", () => {
    const result = aiTemplateDeckGenerationJobResultSchema.parse({
      deckId: "deck_ai_1",
      templateId: "template_file_1",
      sourceFileId: "file_design",
      currentPackageFileId: "file_current",
      contentReferenceFileIds: ["file_content"],
      qualityReport,
      warnings: [],
      timings: {
        "prepare.content": 1.23,
        "prepare.design": 45.6,
        total: 78.9,
      },
    });

    expect(result.timings["prepare.design"]).toBe(45.6);
  });
});
