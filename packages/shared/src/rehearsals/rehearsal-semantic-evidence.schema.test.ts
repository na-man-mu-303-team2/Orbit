import { describe, expect, it } from "vitest";
import {
  rehearsalSemanticEvaluationJobPayloadSchema,
  rehearsalSemanticEvidenceCacheKey,
  rehearsalSemanticEvidenceSchema
} from "./rehearsal-semantic-evidence.schema";

describe("rehearsalSemanticEvidenceSchema", () => {
  it("accepts bounded timestamped transcript segments", () => {
    expect(
      rehearsalSemanticEvidenceSchema.parse({
        segments: [{ startMs: 0, endMs: 1_500, text: "핵심 의미를 설명했습니다" }]
      })
    ).toEqual({
      segments: [{ startMs: 0, endMs: 1_500, text: "핵심 의미를 설명했습니다" }]
    });
  });

  it("rejects reversed timestamps, empty text, and unknown fields", () => {
    expect(() =>
      rehearsalSemanticEvidenceSchema.parse({
        segments: [{ startMs: 2_000, endMs: 1_000, text: "역전 구간" }]
      })
    ).toThrow();
    expect(() =>
      rehearsalSemanticEvidenceSchema.parse({
        segments: [{ startMs: 0, endMs: 1_000, text: "" }]
      })
    ).toThrow();
    expect(() =>
      rehearsalSemanticEvidenceSchema.parse({
        segments: [{ startMs: 0, endMs: 1_000, text: "   " }]
      })
    ).toThrow();
    expect(() =>
      rehearsalSemanticEvidenceSchema.parse({ segments: [], transcript: "원문" })
    ).toThrow();
  });

  it("bounds total cached transcript evidence without truncating valid segments", () => {
    expect(() =>
      rehearsalSemanticEvidenceSchema.parse({
        segments: Array.from({ length: 11 }, (_, index) => ({
          startMs: index * 1_000,
          endMs: (index + 1) * 1_000,
          text: "가".repeat(100_000)
        }))
      })
    ).toThrow(/cache limit/);
  });

  it("uses a run-scoped key without transcript content", () => {
    expect(rehearsalSemanticEvidenceCacheKey("run-1")).toBe(
      "rehearsal:semantic-evidence:run-1"
    );
  });
});

describe("rehearsalSemanticEvaluationJobPayloadSchema", () => {
  it("allows identifiers only", () => {
    expect(
      rehearsalSemanticEvaluationJobPayloadSchema.parse({
        jobId: "job-1",
        projectId: "project-a",
        runId: "run-1"
      })
    ).toEqual({ jobId: "job-1", projectId: "project-a", runId: "run-1" });

    expect(() =>
      rehearsalSemanticEvaluationJobPayloadSchema.parse({
        jobId: "job-1",
        projectId: "project-a",
        runId: "run-1",
        transcript: "민감한 전사 원문"
      })
    ).toThrow();
  });
});
