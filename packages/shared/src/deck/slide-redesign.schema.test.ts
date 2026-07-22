import { describe, expect, it } from "vitest";

import {
  slideRedesignInterpretArtifactSchema,
  slideRedesignPaletteOptionsSchema,
  slideRedesignStageArtifactSchema,
} from "./slide-redesign.schema";

const options = [
  {
    optionId: "current-theme",
    name: "현재 테마 유지",
    isCurrentTheme: true,
    palette: {
      dominant: "#FFFFFF",
      surface: "#F8FAFC",
      text: "#111827",
      focal: "#2563EB",
      secondary: "#7C3AED",
    },
    rationale: "현재 테마를 유지합니다.",
  },
  {
    optionId: "calm-blue",
    name: "차분한 블루",
    isCurrentTheme: false,
    palette: {
      dominant: "#EFF6FF",
      surface: "#FFFFFF",
      text: "#172554",
      focal: "#2563EB",
      secondary: "#0F766E",
    },
    rationale: "차분한 인상을 줍니다.",
  },
  {
    optionId: "vivid-coral",
    name: "선명한 코럴",
    isCurrentTheme: false,
    palette: {
      dominant: "#FFF7ED",
      surface: "#FFFFFF",
      text: "#431407",
      focal: "#EA580C",
      secondary: "#DB2777",
    },
    rationale: "강한 인상을 줍니다.",
  },
];

describe("slide redesign palette schema", () => {
  it("accepts exactly three options with the current theme first", () => {
    const parsed = slideRedesignPaletteOptionsSchema.parse(options);

    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.isCurrentTheme).toBe(true);
  });

  it("rejects duplicate option IDs", () => {
    const result = slideRedesignPaletteOptionsSchema.safeParse([
      options[0],
      options[1],
      { ...options[2], optionId: options[1]!.optionId },
    ]);

    expect(result.success).toBe(false);
  });
});

describe("slide redesign stage artifact schema", () => {
  const interpretArtifact = {
    stage: "interpret",
    outcome: "applicable",
    slideTypeSource: "heuristic",
    summary: {
      title: "프로젝트 단계",
      message: "",
      contentItems: [{ contentItemId: "body::segment::1", text: "준비" }],
      slideType: "process",
      visualIntent: {},
      mediaIntent: { alt: "" },
    },
    provenance: { "body::segment::1": "body" },
    constraints: {
      referencedElementIds: [],
      lockedElementIds: [],
      groupedElementIds: [],
      ooxmlElementIds: [],
    },
  };

  it("parses an applicable interpret artifact", () => {
    const parsed = slideRedesignStageArtifactSchema.parse(interpretArtifact);

    expect(parsed.stage).toBe("interpret");
    expect(parsed.outcome).toBe("applicable");
  });

  it("rejects incomplete or unknown stage artifacts", () => {
    expect(
      slideRedesignInterpretArtifactSchema.safeParse({
        stage: "interpret",
        outcome: "applicable",
        provenance: {},
      }).success,
    ).toBe(false);
    expect(
      slideRedesignStageArtifactSchema.safeParse({
        ...interpretArtifact,
        stage: "illustrate",
      }).success,
    ).toBe(false);
    expect(
      slideRedesignInterpretArtifactSchema.safeParse({
        ...interpretArtifact,
        rawSlideText: "민감 원문",
      }).success,
    ).toBe(false);
  });

  it("parses compose and verify response artifacts", () => {
    const response = {
      message: "리디자인에 사용할 배색을 골라주세요.",
      interpretedIntent: {
        target: "current-slide",
        action: "select-redesign-palette",
        alignment: null,
      },
      operations: [],
      affectedElementIds: [],
      warnings: [],
      paletteOptions: options,
    };

    const composed = slideRedesignStageArtifactSchema.parse({
      stage: "compose",
      outcome: "applicable",
      response,
      candidateCount: 0,
      safeCandidateCount: 0,
      irreversibleCount: 0,
      ornamentApplied: false,
      imageRequests: [
        {
          placeholderElementId: "el_media_placeholder",
          assetRole: "atmosphere",
          needsGeneration: true,
          prompt: "Calm abstract collaboration",
          alt: "Abstract collaboration visual",
        },
      ],
    });
    expect(composed.stage).toBe("compose");
    expect(
      composed.stage === "compose" ? composed.imageRequests : [],
    ).toHaveLength(1);
    expect(
      slideRedesignStageArtifactSchema.parse({
        stage: "verify",
        outcome: "applicable",
        response,
      }).stage,
    ).toBe("verify");
  });
});
