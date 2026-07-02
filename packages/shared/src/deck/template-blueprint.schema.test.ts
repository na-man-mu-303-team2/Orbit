import { describe, expect, it } from "vitest";

import {
  pptxOoxmlGenerationJobResultSchema,
  pptxOoxmlGenerationRequestSchema,
  pptxOoxmlSyncJobResultSchema,
  pptxImportJobResultSchema,
  qualityReportSchema,
  templateBlueprintSchema,
} from "../index";

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
  notes: ["pixel renderer unavailable"],
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
              source: {
                type: "placeholder",
                placeholderType: "title",
                slidePart: "ppt/slides/slide1.xml",
                shapeId: "2",
              },
            },
            {
              elementId: "el_logo",
              usage: "decoration",
              slotRole: "logo",
              replaceMode: "ignore",
              confidence: 0.8,
              bounds: { x: 1600, y: 40, width: 200, height: 80 },
              source: { type: "master", name: "Logo" },
            },
          ],
        },
      ],
    });

    expect(blueprint.slides[0].slots[0].usage).toBe("content-slot");
  });

  it("accepts OOXML package tracking fields", () => {
    const blueprint = templateBlueprintSchema.parse({
      templateId: "template_file_1",
      sourceFileId: "file_1",
      sourcePackageFileId: "file_1",
      currentPackageFileId: "file_current",
      ooxmlSyncedDeckVersion: 2,
      slides: [
        {
          slideIndex: 1,
          sourceSlideIndex: 1,
          renderAssetFileId: "file_slide_1",
          fallbackRenderAssetFileId: "file_fallback_1",
          elementSources: [
            {
              elementId: "el_title",
              slidePart: "ppt/slides/slide1.xml",
              shapeId: "2",
              sourceType: "placeholder",
              writable: true,
            },
          ],
          slots: [],
        },
      ],
    });

    expect(blueprint.currentPackageFileId).toBe("file_current");
    expect(blueprint.ooxmlSyncedDeckVersion).toBe(2);
    expect(blueprint.slides[0].renderAssetFileId).toBe("file_slide_1");
    expect(blueprint.slides[0].elementSources[0]?.writable).toBe(true);
  });
});

describe("qualityReportSchema", () => {
  it("allows a missing pixel similarity score", () => {
    expect(
      qualityReportSchema.parse(qualityReport).metrics.pixelSimilarity,
    ).toBeNull();
  });
});

describe("pptxImportJobResultSchema", () => {
  it("validates the saved PPTX import job result contract", () => {
    const result = pptxImportJobResultSchema.parse({
      deckId: "deck_imported_1",
      templateId: "template_file_1",
      qualityReport,
      warnings: ["Unsupported chart was skipped"],
    });

    expect(result.qualityReport.compositeScore).toBe(84);
  });
});

describe("pptxOoxmlGeneration schemas", () => {
  it("validates request and job result contracts", () => {
    expect(
      pptxOoxmlGenerationRequestSchema.parse({
        fileId: "file_1",
        topic: "Topic",
        prompt: "Prompt",
      }),
    ).toEqual({ fileId: "file_1", topic: "Topic", prompt: "Prompt" });

    const result = pptxOoxmlGenerationJobResultSchema.parse({
      deckId: "deck_ooxml_1",
      templateId: "template_file_1",
      sourceFileId: "file_1",
      currentPackageFileId: "file_current",
      qualityReport,
      warnings: ["media slot preserved"],
    });

    expect(result.currentPackageFileId).toBe("file_current");
  });

  it("validates sync job result contracts", () => {
    const result = pptxOoxmlSyncJobResultSchema.parse({
      deckId: "deck_ooxml_1",
      templateId: "template_file_1",
      currentPackageFileId: "file_current",
      renderAssetFileIds: ["file_slide_1"],
      syncedDeckVersion: 2,
      warnings: [],
    });

    expect(result.syncedDeckVersion).toBe(2);
  });
});
