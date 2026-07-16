import { describe, expect, it, vi } from "vitest";
import { LocalMinioStorage, PrefixRoutingStorage, type StoragePort } from "./index";

describe("ORBIT-93 S3-compatible storage presign", () => {
  it("creates a browser-facing MinIO PUT URL without contacting the bucket", async () => {
    const storage = new LocalMinioStorage({
      endpoint: "http://minio:9000",
      publicEndpoint: "http://localhost:9000",
      bucket: "orbit-local",
      region: "ap-northeast-2",
      accessKeyId: "orbit",
      secretAccessKey: "orbit-password",
      forcePathStyle: true,
    });

    const upload = await storage.createUploadUrl({
      key: "projects/project_1/assets/file_1/report.pdf",
      contentType: "application/pdf",
      expiresInSeconds: 900,
    });
    const url = new URL(upload.url);

    expect(upload.method).toBe("PUT");
    expect(upload.headers).toEqual({ "content-type": "application/pdf" });
    expect(url.origin).toBe("http://localhost:9000");
    expect(url.pathname).toBe(
      "/orbit-local/projects/project_1/assets/file_1/report.pdf",
    );
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

describe("PrefixRoutingStorage", () => {
  it("routes raw and evidence keys to private storage", async () => {
    const defaultStorage = createStorageStub("assets");
    const privateStorage = createStorageStub("private");
    const storage = new PrefixRoutingStorage({ defaultStorage, privateStorage });

    await storage.createUploadUrl({
      key: "raw/projects/project_1/file.webm",
      contentType: "audio/webm",
      expiresInSeconds: 900,
    });
    await storage.getSignedReadUrl("evidence/project_1/clip.webm");
    await storage.headObject("raw/projects/project_1/file.webm");

    expect(privateStorage.createUploadUrl).toHaveBeenCalledOnce();
    expect(privateStorage.getSignedReadUrl).toHaveBeenCalledOnce();
    expect(privateStorage.headObject).toHaveBeenCalledOnce();
    expect(defaultStorage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("routes all other keys to the default assets storage", async () => {
    const defaultStorage = createStorageStub("assets");
    const privateStorage = createStorageStub("private");
    const storage = new PrefixRoutingStorage({ defaultStorage, privateStorage });

    await storage.createUploadUrl({
      key: "projects/project_1/assets/file.pdf",
      contentType: "application/pdf",
      expiresInSeconds: 900,
    });
    await storage.removeObject("rehearsals/2026-07-17/run_1/transcript.json");

    expect(defaultStorage.createUploadUrl).toHaveBeenCalledOnce();
    expect(defaultStorage.removeObject).toHaveBeenCalledOnce();
    expect(privateStorage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects private audio writes outside private prefixes", async () => {
    const storage = new PrefixRoutingStorage({
      defaultStorage: createStorageStub("assets"),
      privateStorage: createStorageStub("private"),
    });

    await expect(
      storage.putObject({
        key: "projects/project_1/assets/rehearsal.webm",
        body: new Uint8Array([1]),
        contentType: "audio/webm",
        purpose: "rehearsal-audio",
      }),
    ).rejects.toThrow("Private audio storage prefix");
  });

  it("rejects non-private writes under private prefixes", async () => {
    const storage = new PrefixRoutingStorage({
      defaultStorage: createStorageStub("assets"),
      privateStorage: createStorageStub("private"),
    });

    await expect(
      storage.putObject({
        key: "raw/projects/project_1/reference.pdf",
        body: new Uint8Array([1]),
        contentType: "application/pdf",
        purpose: "reference-material",
      }),
    ).rejects.toThrow("Private audio storage prefix");
  });
});

function createStorageStub(label: string): StoragePort {
  return {
    putObject: vi.fn(async (input) => ({
      key: input.key,
      url: `${label}://${input.key}`,
      contentType: input.contentType,
      purpose: input.purpose,
      size:
        typeof input.body === "string"
          ? input.body.length
          : input.body.byteLength,
    })),
    createUploadUrl: vi.fn(async (input) => ({
      key: input.key,
      url: `${label}://${input.key}`,
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
      expiresAt: new Date(0).toISOString(),
    })),
    getSignedReadUrl: vi.fn(async (key) => `${label}://${key}`),
    removeObject: vi.fn(async () => undefined),
    headObject: vi.fn(async () => ({
      contentLength: 1,
      contentType: "application/octet-stream",
    })),
  };
}
