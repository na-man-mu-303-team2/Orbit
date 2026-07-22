import { describe, expect, it } from "vitest";

import {
  PPTX_OOXML_ASSET_TRANSPORT_VERSION,
  pptxOoxmlAssetTransportVersionSchema,
  pptxOoxmlStoredAssetSchema,
} from "./pptx-ooxml-storage.schema";

const validAsset = {
  assetId: "package",
  fileName: "generated.pptx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  storageKey: "projects/project-1/jobs/job-1/pptx-ooxml/asset.pptx",
  size: 1_024,
  sha256: "a".repeat(64),
};

describe("PPTX OOXML storage manifest schema", () => {
  it("accepts the versioned storage asset contract", () => {
    expect(
      pptxOoxmlAssetTransportVersionSchema.parse(
        PPTX_OOXML_ASSET_TRANSPORT_VERSION,
      ),
    ).toBe("storage-manifest-v1");
    expect(pptxOoxmlStoredAssetSchema.parse(validAsset)).toEqual(validAsset);
  });

  it("rejects base64 payloads and non-normalized storage keys", () => {
    expect(
      pptxOoxmlStoredAssetSchema.safeParse({
        ...validAsset,
        contentBase64: "cGRmeA==",
      }).success,
    ).toBe(false);
    expect(
      pptxOoxmlStoredAssetSchema.safeParse({
        ...validAsset,
        storageKey: "projects/project-1/../other-project/asset.pptx",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid size and digest metadata", () => {
    expect(
      pptxOoxmlStoredAssetSchema.safeParse({
        ...validAsset,
        size: 0,
      }).success,
    ).toBe(false);
    expect(
      pptxOoxmlStoredAssetSchema.safeParse({
        ...validAsset,
        sha256: "not-a-digest",
      }).success,
    ).toBe(false);
  });
});
