import { describe, expect, it } from "vitest";

import {
  referenceExtractionRequestSchema,
  referenceExtractionResultSchema
} from "./reference-extraction.schema";

describe("referenceExtractionRequestSchema", () => {
  it("accepts up to ten unique project file IDs", () => {
    const request = referenceExtractionRequestSchema.parse({
      fileIds: Array.from({ length: 10 }, (_, index) => `file_${index + 1}`)
    });

    expect(request.fileIds).toHaveLength(10);
  });

  it("rejects duplicate or excessive file IDs", () => {
    expect(
      referenceExtractionRequestSchema.safeParse({
        fileIds: ["file_1", "file_1"]
      }).success
    ).toBe(false);
    expect(
      referenceExtractionRequestSchema.safeParse({
        fileIds: Array.from({ length: 11 }, (_, index) => `file_${index + 1}`)
      }).success
    ).toBe(false);
  });
});

describe("referenceExtractionResultSchema", () => {
  it("keeps direct extracted text usable when indexing is unavailable", () => {
    const result = referenceExtractionResultSchema.parse({
      files: [
        {
          projectId: "project_1",
          referenceDocumentId: "file_1",
          fileName: "brief.pdf",
          kind: "pdf",
          status: "succeeded",
          rawText: "raw evidence",
          cleanedText: "clean evidence",
          indexingStatus: "unavailable"
        }
      ]
    });

    expect(result.files[0]).toMatchObject({
      fileId: "file_1",
      usable: true,
      indexingStatus: "unavailable"
    });
  });

  it("marks empty extraction output unusable", () => {
    const result = referenceExtractionResultSchema.parse({
      files: [
        {
          projectId: "project_1",
          referenceDocumentId: "file_1",
          fileName: "blank.pdf",
          kind: "pdf",
          status: "succeeded"
        }
      ]
    });

    expect(result.files[0]?.usable).toBe(false);
  });
});
