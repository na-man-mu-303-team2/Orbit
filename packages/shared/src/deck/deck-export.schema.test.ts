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

  it("accepts an all-slide PNG ZIP export", () => {
    expect(deckExportRequestSchema.parse({ format: "png" })).toEqual({
      format: "png"
    });
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

  it("identifies a PNG ZIP result by its requested format", () => {
    expect(
      deckExportJobResultSchema.parse({
        deckId: "deck_ai_1",
        fileId: "file_export_2",
        url: "/api/v1/files/file_export_2/download",
        format: "png",
        warnings: []
      }).format
    ).toBe("png");
  });
});
