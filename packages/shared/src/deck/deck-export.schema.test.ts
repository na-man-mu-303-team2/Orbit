import { describe, expect, it } from "vitest";

import {
  deckExportJobResultSchema,
  deckExportRequestSchema
} from "./deck-export.schema";

describe("deckExportRequestSchema", () => {
  it("defaults to PPTX export", () => {
    const request = deckExportRequestSchema.parse({});

    expect(request).toEqual({ format: "pptx" });
  });

  it("accepts one optional presentation session for static Activity results", () => {
    expect(
      deckExportRequestSchema.parse({ presentationSessionId: "session_1" }),
    ).toEqual({ format: "pptx", presentationSessionId: "session_1" });
    expect(
      deckExportRequestSchema.safeParse({
        presentationSessionId: "session_1",
        rawResponse: "forbidden",
      }).success,
    ).toBe(false);
  });
});

describe("deckExportJobResultSchema", () => {
  it("accepts the worker PPTX export result payload", () => {
    const result = deckExportJobResultSchema.parse({
      deckId: "deck_ai_1",
      fileId: "file_export_1",
      url: "/api/v1/files/file_export_1/download",
      format: "pptx",
      warnings: ["Skipped unsupported gradient fill."]
    });

    expect(result.format).toBe("pptx");
  });
});
