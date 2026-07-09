import { describe, expect, it } from "vitest";

import {
  createSemanticCueExtractionJobResponseSchema,
  semanticCueExtractionRequestSchema,
  semanticCueExtractionResultSchema
} from "./semantic-cue-extraction.schema";

describe("semanticCueExtractionRequestSchema", () => {
  it("defaults force and allows an explicit deck id", () => {
    expect(
      semanticCueExtractionRequestSchema.parse({ deckId: "deck_demo_1" })
    ).toEqual({
      deckId: "deck_demo_1",
      force: false
    });
  });
});

describe("semanticCueExtractionResultSchema", () => {
  it("accepts bounded semantic cues per slide", () => {
    const result = semanticCueExtractionResultSchema.parse({
      deckId: "deck_demo_1",
      slides: [
        {
          slideId: "slide_intro",
          semanticCues: [
            {
              cueId: "scue_intro_1",
              slideId: "slide_intro",
              meaning: "문제 정의를 설명했다",
              required: true,
              priority: 1,
              candidateKeywords: ["문제 정의"],
              aliases: { "문제 정의": ["pain point"] },
              requiredConcepts: ["문제 정의", "pain point"],
              nliHypotheses: ["문제 정의의 핵심 의미를 설명했다"]
            }
          ]
        }
      ]
    });

    expect(result.slides[0]?.semanticCues[0]?.cueId).toBe("scue_intro_1");
  });
});

describe("createSemanticCueExtractionJobResponseSchema", () => {
  it("uses the shared Job contract", () => {
    const response = createSemanticCueExtractionJobResponseSchema.parse({
      job: {
        jobId: "job_1",
        projectId: "project_demo_1",
        type: "semantic-cue-extraction",
        status: "queued",
        progress: 0,
        message: "queued",
        result: null,
        error: null,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z"
      }
    });

    expect(response.job.type).toBe("semantic-cue-extraction");
  });
});
