import type { StoragePort } from "@orbit/storage";
import { describe, expect, it, vi } from "vitest";
import {
  createPptxOoxmlStoragePrefix,
  pptxOoxmlAssetFileId,
  verifyPptxOoxmlStoredAssets,
} from "./pptx-ooxml-stored-assets";

const asset = {
  assetId: "current_package",
  fileName: "deck.pptx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  storageKey:
    "projects/project-a/jobs/job-a/pptx-ooxml/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-deck.pptx",
  size: 1_024,
  sha256: "a".repeat(64),
};

describe("PPTX OOXML stored asset verification", () => {
  it("accepts an object whose HEAD metadata matches the manifest", async () => {
    const storage = {
      headObject: vi.fn(async () => ({
        contentLength: asset.size,
        contentType: asset.mimeType,
        metadata: { "orbit-sha256": asset.sha256 },
      })),
    } satisfies Pick<StoragePort, "headObject">;

    await expect(
      verifyPptxOoxmlStoredAssets(
        storage,
        createPptxOoxmlStoragePrefix("project-a", "job-a"),
        [asset],
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects cross-job keys before reading storage", async () => {
    const storage = {
      headObject: vi.fn(async () => null),
    } satisfies Pick<StoragePort, "headObject">;

    await expect(
      verifyPptxOoxmlStoredAssets(
        storage,
        createPptxOoxmlStoragePrefix("project-a", "job-b"),
        [asset],
      ),
    ).rejects.toThrow("storage prefix mismatch");
    expect(storage.headObject).not.toHaveBeenCalled();
  });

  it("rejects missing digest metadata", async () => {
    const storage = {
      headObject: vi.fn(async () => ({
        contentLength: asset.size,
        contentType: asset.mimeType,
        metadata: {},
      })),
    } satisfies Pick<StoragePort, "headObject">;

    await expect(
      verifyPptxOoxmlStoredAssets(
        storage,
        createPptxOoxmlStoragePrefix("project-a", "job-a"),
        [asset],
      ),
    ).rejects.toThrow("digest mismatch");
  });

  it("creates stable project-scoped file ids", () => {
    expect(pptxOoxmlAssetFileId("project-a", asset.storageKey)).toBe(
      pptxOoxmlAssetFileId("project-a", asset.storageKey),
    );
    expect(pptxOoxmlAssetFileId("project-a", asset.storageKey)).not.toBe(
      pptxOoxmlAssetFileId("project-b", asset.storageKey),
    );
  });
});
