import { describe, expect, it } from "vitest";

import {
  createSemanticCueExtractionJobResponseSchema,
  semanticCueExtractionJobPayloadSchema,
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

  it("keeps baseVersion out of the public extraction request", () => {
    expect(
      semanticCueExtractionRequestSchema.safeParse({
        deckId: "deck_demo_1",
        force: false,
        baseVersion: 3
      }).success
    ).toBe(false);
  });
});

describe("semanticCueExtractionJobPayloadSchema", () => {
  it("requires the materialized deck baseVersion for queue work", () => {
    expect(
      semanticCueExtractionJobPayloadSchema.parse({
        jobId: "job_semantic_1",
        projectId: "project_demo_1",
        request: {
          deckId: "deck_demo_1",
          force: true,
          baseVersion: 3
        }
      }).request
    ).toEqual({
      deckId: "deck_demo_1",
      force: true,
      baseVersion: 3
    });

    expect(
      semanticCueExtractionJobPayloadSchema.safeParse({
        jobId: "job_semantic_1",
        projectId: "project_demo_1",
        request: { deckId: "deck_demo_1", force: false }
      }).success
    ).toBe(false);
  });
});

describe("semanticCueExtractionResultSchema", () => {
  it("accepts bounded semantic cues per slide", () => {
    const result = semanticCueExtractionResultSchema.parse({
      deckId: "deck_demo_1",
      sourceDeckVersion: 3,
      slides: [
        {
          slideId: "slide_intro",
          status: "succeeded",
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
    expect(result.slides[0]?.warnings).toEqual([]);
  });

  it("accepts skipped and failed slide results without deleting cues", () => {
    const result = semanticCueExtractionResultSchema.parse({
      deckId: "deck_demo_1",
      sourceDeckVersion: 3,
      slides: [
        {
          slideId: "slide_intro",
          status: "skipped",
          warnings: ["provider-omitted-slide"]
        },
        {
          slideId: "slide_detail",
          status: "failed",
          warnings: ["provider-slide-failed"]
        }
      ]
    });

    expect(result.slides.map((slide) => slide.status)).toEqual([
      "skipped",
      "failed"
    ]);
  });

  it("rejects duplicate slide results", () => {
    expect(
      semanticCueExtractionResultSchema.safeParse({
        deckId: "deck_demo_1",
        sourceDeckVersion: 3,
        slides: [
          { slideId: "slide_intro", status: "succeeded" },
          { slideId: "slide_intro", status: "skipped" }
        ]
      }).success
    ).toBe(false);
  });

  it("rejects cues assigned to another extraction slide", () => {
    expect(
      semanticCueExtractionResultSchema.safeParse({
        deckId: "deck_demo_1",
        sourceDeckVersion: 3,
        slides: [
          {
            slideId: "slide_intro",
            status: "succeeded",
            semanticCues: [
              {
                cueId: "scue_wrong_slide",
                slideId: "slide_detail",
                meaning: "발표자는 다른 슬라이드 내용을 설명했다",
                nliHypotheses: ["발표자는 다른 슬라이드 내용을 설명했다"]
              }
            ]
          }
        ]
      }).success
    ).toBe(false);
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
