import { describe, expect, it, vi } from "vitest";
import {
  buildAssetUploadRequest,
  getAssetValidationMessage,
  uploadProjectAsset,
} from "./ProjectAssetWorkspace";

const pptxMime =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("ORBIT-93 project asset upload helpers", () => {
  it("builds an upload request from the shared file contract", () => {
    const file = new File(["deck"], "deck.pptx", { type: pptxMime });

    expect(buildAssetUploadRequest(file, "pptx-import")).toEqual({
      originalName: "deck.pptx",
      mimeType: pptxMime,
      size: 4,
      purpose: "pptx-import",
    });
  });

  it("rejects unsupported or oversized files before API calls", () => {
    const unsupported = new File(["binary"], "setup.exe", {
      type: "application/x-msdownload",
    });
    const oversized = new File(["binary"], "large.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversized, "size", {
      value: 51 * 1024 * 1024,
    });

    expect(getAssetValidationMessage(unsupported)).toContain("PDF");
    expect(getAssetValidationMessage(oversized)).toContain("50 MB");
  });

  it("requests upload URL, uploads to storage, and completes metadata", async () => {
    const file = new File(["%PDF"], "smoke.pdf", { type: "application/pdf" });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/assets/upload-url")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          originalName: "smoke.pdf",
          mimeType: "application/pdf",
          size: 4,
          purpose: "reference-material",
        });

        return new Response(
          JSON.stringify({
            fileId: "file_smoke",
            projectId: "project_smoke",
            uploadUrl: "http://storage.local/upload",
            method: "PUT",
            headers: { "content-type": "application/pdf" },
            expiresAt: "2026-06-27T01:15:00.000Z",
            purpose: "reference-material",
          }),
        );
      }

      if (url === "http://storage.local/upload") {
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBe(file);
        return new Response(null, { status: 200 });
      }

      if (url.endsWith("/assets/complete")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ fileId: "file_smoke" });

        return new Response(
          JSON.stringify({
            fileId: "file_smoke",
            projectId: "project_smoke",
            originalName: "smoke.pdf",
            mimeType: "application/pdf",
            size: 4,
            url: "http://storage.local/file_smoke",
            purpose: "reference-material",
            createdAt: "2026-06-27T01:00:00.000Z",
          }),
        );
      }

      return new Response("unexpected request", { status: 500 });
    });

    await expect(
      uploadProjectAsset("project_smoke", file, "reference-material", fetcher),
    ).resolves.toMatchObject({
      fileId: "file_smoke",
      originalName: "smoke.pdf",
      purpose: "reference-material",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
