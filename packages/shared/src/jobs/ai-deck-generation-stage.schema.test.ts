import { describe, expect, it } from "vitest";

import {
  aiDeckGenerationStageInputReferenceSchema,
  aiDeckGenerationStageReferenceSchema,
  aiDeckGenerationStageResultReferenceSchema,
  aiDeckGenerationStageMessageSchema,
  aiDeckGenerationStageSchema,
} from "./ai-deck-generation-stage.schema";

const expectedStages = [
  "reference-extract-file",
  "source-grounding",
  "content-planning",
  "design-planning",
  "layout-compile",
  "image-slide",
  "semantic-quality",
  "rendered-visual-quality",
  "publication",
] as const;

describe("aiDeckGenerationStageSchema", () => {
  it("keeps the nine program-v2 pipeline stages exact", () => {
    expect(aiDeckGenerationStageSchema.options).toEqual(expectedStages);
  });
});

describe("aiDeckGenerationStageReferenceSchema", () => {
  it("allows only the declared OCR and planning artifact locators", () => {
    const ocrLocator = {
      referenceExtractionArtifactId: "8fa123d8-2869-4ca0-b9b5-fbb365b57625",
    };
    const planningLocator = {
      planningArtifactId: "1d31f722-90b9-44c1-9697-8c26d91ef543",
    };

    expect(aiDeckGenerationStageReferenceSchema.parse({})).toEqual({});
    expect(aiDeckGenerationStageReferenceSchema.parse(ocrLocator)).toEqual(
      ocrLocator,
    );
    expect(aiDeckGenerationStageReferenceSchema.parse(planningLocator)).toEqual(
      planningLocator,
    );
    expect(
      aiDeckGenerationStageResultReferenceSchema.parse({
        stage: "reference-extract-file",
        reference: ocrLocator,
      }),
    ).toEqual({ stage: "reference-extract-file", reference: ocrLocator });
    expect(
      aiDeckGenerationStageResultReferenceSchema.safeParse({
        stage: "content-planning",
        reference: ocrLocator,
      }).success,
    ).toBe(false);
    expect(
      aiDeckGenerationStageInputReferenceSchema.safeParse({
        stage: "reference-extract-file",
        reference: ocrLocator,
      }).success,
    ).toBe(false);

    for (const stage of [
      "source-grounding",
      "content-planning",
      "design-planning",
      "layout-compile",
    ] as const) {
      expect(
        aiDeckGenerationStageResultReferenceSchema.safeParse({
          stage,
          reference: planningLocator,
        }).success,
      ).toBe(true);
    }
    for (const stage of [
      "content-planning",
      "design-planning",
      "layout-compile",
    ] as const) {
      expect(
        aiDeckGenerationStageInputReferenceSchema.safeParse({
          stage,
          reference: planningLocator,
        }).success,
      ).toBe(true);
    }
    expect(
      aiDeckGenerationStageInputReferenceSchema.safeParse({
        stage: "source-grounding",
        reference: planningLocator,
      }).success,
    ).toBe(false);
    expect(
      aiDeckGenerationStageResultReferenceSchema.safeParse({
        stage: "image-slide",
        reference: planningLocator,
      }).success,
    ).toBe(false);

    for (const nonEmptyReference of [
      { artifactKey: "ai-deck/job-1/content-plan.json" },
      { referenceExtractionArtifactId: "not-a-uuid" },
      { planningArtifactId: "not-a-uuid" },
      {
        planningArtifactId: "1d31f722-90b9-44c1-9697-8c26d91ef543",
        stage: "content-planning",
      },
      {
        referenceExtractionArtifactId:
          "8fa123d8-2869-4ca0-b9b5-fbb365b57625",
        fileId: "file-1",
      },
      { content_base64: "ZmFrZQ==" },
      { provider_response: { output: "raw" } },
      { sourceText: "full user content" },
      { blob: "ZmFrZQ==" },
    ]) {
      expect(
        aiDeckGenerationStageReferenceSchema.safeParse(nonEmptyReference)
          .success,
      ).toBe(false);
    }
  });
});

describe("aiDeckGenerationStageMessageSchema", () => {
  it("accepts singleton and fan-out stage identities", () => {
    expect(
      aiDeckGenerationStageMessageSchema.parse({
        pipelineJobId: "job-1",
        projectId: "project-1",
        stage: "content-planning",
        shardKey: "",
      }),
    ).toEqual({
      pipelineJobId: "job-1",
      projectId: "project-1",
      stage: "content-planning",
      shardKey: "",
    });

    expect(
      aiDeckGenerationStageMessageSchema.parse({
        pipelineJobId: "job-1",
        projectId: "project-1",
        stage: "image-slide",
        shardKey: "slide-1",
      }).shardKey,
    ).toBe("slide-1");
  });

  it("rejects heavy payloads and undeclared message fields", () => {
    expect(
      aiDeckGenerationStageMessageSchema.safeParse({
        pipelineJobId: "job-1",
        projectId: "project-1",
        stage: "publication",
        shardKey: "",
        deck: { slides: [] },
      }).success,
    ).toBe(false);
  });

  it("requires shard keys only for file and slide fan-out stages", () => {
    for (const stage of ["reference-extract-file", "image-slide"] as const) {
      for (const shardKey of ["", "   "]) {
        expect(
          aiDeckGenerationStageMessageSchema.safeParse({
            pipelineJobId: "job-1",
            projectId: "project-1",
            stage,
            shardKey,
          }).success,
        ).toBe(false);
      }
    }

    for (const stage of expectedStages.filter(
      (candidate) =>
        candidate !== "reference-extract-file" && candidate !== "image-slide",
    )) {
      expect(
        aiDeckGenerationStageMessageSchema.safeParse({
          pipelineJobId: "job-1",
          projectId: "project-1",
          stage,
          shardKey: "unexpected-shard",
        }).success,
      ).toBe(false);
    }
  });

  it("reserves colons for the deterministic transport ID separators", () => {
    for (const invalid of [
      {
        pipelineJobId: "job:1",
        projectId: "project-1",
        stage: "publication",
        shardKey: "",
      },
      {
        pipelineJobId: "job-1",
        projectId: "project-1",
        stage: "image-slide",
        shardKey: "slide:1",
      },
      {
        pipelineJobId: "   ",
        projectId: "project-1",
        stage: "publication",
        shardKey: "",
      },
    ]) {
      expect(
        aiDeckGenerationStageMessageSchema.safeParse(invalid).success,
      ).toBe(false);
    }
  });

  it("requires the shardKey key even for singleton stages", () => {
    expect(
      aiDeckGenerationStageMessageSchema.safeParse({
        pipelineJobId: "job-1",
        projectId: "project-1",
        stage: "publication",
      }).success,
    ).toBe(false);
  });
});
