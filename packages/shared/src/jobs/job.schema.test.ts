import { describe, expect, it } from "vitest";
import { jobTypeSchema } from "./job.schema";

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

  it("accepts AI template deck generation jobs", () => {
    expect(jobTypeSchema.parse("ai-template-deck-generation")).toBe(
      "ai-template-deck-generation",
    );
  });

  it("accepts PPTX OOXML sync jobs", () => {
    expect(jobTypeSchema.parse("pptx-ooxml-sync")).toBe("pptx-ooxml-sync");
  });

  it("accepts rehearsal semantic evaluation retry jobs", () => {
    expect(jobTypeSchema.parse("rehearsal-semantic-evaluation")).toBe(
      "rehearsal-semantic-evaluation"
    );
  });
});
