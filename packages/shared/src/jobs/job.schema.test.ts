import { describe, expect, it } from "vitest";
import {
  activeJobTypeSchema,
  historicalJobTypeSchema,
  internalCoachingJobTypeSchema,
  jobSchema,
  jobTypeSchema,
  publicCreatableJobTypeSchema,
} from "./job.schema";

describe("jobTypeSchema", () => {
  it("accepts worker health check jobs", () => {
    expect(jobTypeSchema.parse("worker-health-check")).toBe(
      "worker-health-check",
    );
  });

  it("accepts PPTX OOXML generation jobs", () => {
    expect(jobTypeSchema.parse("pptx-ooxml-generation")).toBe(
      "pptx-ooxml-generation",
    );
  });

  it("keeps legacy job types readable but blocks active and public creation", () => {
    for (const type of ["pptx-import", "ai-template-deck-generation"] as const) {
      expect(historicalJobTypeSchema.parse(type)).toBe(type);
      expect(jobTypeSchema.parse(type)).toBe(type);
      expect(activeJobTypeSchema.safeParse(type).success).toBe(false);
      expect(publicCreatableJobTypeSchema.safeParse(type).success).toBe(false);
      expect(
        jobSchema.parse({
          jobId: `job-${type}`,
          projectId: "project-a",
          type,
          status: "succeeded",
          progress: 100,
          message: "done",
          result: null,
          error: null,
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z",
        }).type
      ).toBe(type);
    }
  });

  it("accepts PPTX OOXML sync jobs", () => {
    expect(jobTypeSchema.parse("pptx-ooxml-sync")).toBe("pptx-ooxml-sync");
  });

  it("accepts rehearsal semantic evaluation retry jobs", () => {
    expect(jobTypeSchema.parse("rehearsal-semantic-evaluation")).toBe(
      "rehearsal-semantic-evaluation"
    );
  });

  it("accepts speaker notes suggestions without exposing generic creation", () => {
    expect(activeJobTypeSchema.parse("speaker-notes-suggestion")).toBe(
      "speaker-notes-suggestion"
    );
    expect(
      publicCreatableJobTypeSchema.safeParse("speaker-notes-suggestion").success
    ).toBe(false);
  });

  it("accepts internal coaching jobs but never exposes them as public create types", () => {
    for (const type of internalCoachingJobTypeSchema.options) {
      expect(jobTypeSchema.parse(type)).toBe(type);
      expect(activeJobTypeSchema.parse(type)).toBe(type);
      expect(publicCreatableJobTypeSchema.safeParse(type).success).toBe(false);
    }
  });
});
