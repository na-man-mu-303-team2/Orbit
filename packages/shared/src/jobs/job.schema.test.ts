import { describe, expect, it } from "vitest";
import { jobTypeSchema } from "./job.schema";

describe("jobTypeSchema", () => {
  it("accepts worker health check jobs", () => {
    expect(jobTypeSchema.parse("worker-health-check")).toBe(
      "worker-health-check"
    );
  });

  it("accepts PPTX OOXML generation jobs", () => {
    expect(jobTypeSchema.parse("pptx-ooxml-generation")).toBe(
      "pptx-ooxml-generation"
    );
  });
});
