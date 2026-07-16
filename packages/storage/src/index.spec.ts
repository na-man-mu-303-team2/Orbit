import { describe, expect, it, vi } from "vitest";
import {
  LocalMinioStorage,
  PurposeRoutedStorage,
  type StoragePort,
} from "./index";

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

describe("purpose-routed storage", () => {
  it("keeps private-audio writes in project assets while the rollout flag is disabled", async () => {
    const projectAssets = storageStub();
    const privateAudio = storageStub();
    const storage = new PurposeRoutedStorage({
      projectAssets,
      privateAudio,
      privateAudioWritesEnabled: false,
    });

    await storage.createUploadUrl({
      key: "raw/rehearsals/project-a/run-a/audio.ogg",
      contentType: "audio/ogg",
      expiresInSeconds: 900,
      purpose: "rehearsal-audio",
    });

    expect(projectAssets.createUploadUrl).toHaveBeenCalledOnce();
    expect(privateAudio.createUploadUrl).not.toHaveBeenCalled();
  });

  it("routes enabled private-audio writes to the private bucket", async () => {
    const projectAssets = storageStub();
    const privateAudio = storageStub();
    const storage = new PurposeRoutedStorage({
      projectAssets,
      privateAudio,
      privateAudioWritesEnabled: true,
    });

    await storage.putObject({
      key: "raw/qna/project-a/file-a/answer.webm",
      body: "audio",
      contentType: "audio/webm",
      purpose: "qna-answer-audio",
    });

    expect(privateAudio.putObject).toHaveBeenCalledOnce();
    expect(projectAssets.putObject).not.toHaveBeenCalled();
  });

  it("reads legacy private audio from project assets without probing the private bucket", async () => {
    const projectAssets = storageStub();
    const privateAudio = storageStub();
    const storage = new PurposeRoutedStorage({
      projectAssets,
      privateAudio,
      privateAudioWritesEnabled: true,
    });

    await storage.getSignedReadUrl(
      "projects/project-a/assets/file-audio/rehearsal.webm",
      "rehearsal-audio",
    );

    expect(privateAudio.headObject).not.toHaveBeenCalled();
    expect(projectAssets.getSignedReadUrl).toHaveBeenCalledWith(
      "projects/project-a/assets/file-audio/rehearsal.webm",
      "rehearsal-audio",
    );
  });

  it("reads raw private-audio keys from the private bucket", async () => {
    const projectAssets = storageStub();
    const privateAudio = storageStub();
    const storage = new PurposeRoutedStorage({
      projectAssets,
      privateAudio,
      privateAudioWritesEnabled: true,
    });

    await storage.getSignedReadUrl(
      "raw/rehearsals/project-a/run-a/audio.ogg",
      "rehearsal-audio",
    );

    expect(privateAudio.getSignedReadUrl).toHaveBeenCalledOnce();
    expect(projectAssets.getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("deletes private audio from the bucket that currently owns the object", async () => {
    const projectAssets = storageStub();
    const privateAudio = storageStub();
    const storage = new PurposeRoutedStorage({
      projectAssets,
      privateAudio,
      privateAudioWritesEnabled: true,
    });

    await storage.removeObject(
      "raw/rehearsals/project-a/run-a/audio.ogg",
      "rehearsal-audio",
    );

    expect(privateAudio.removeObject).toHaveBeenCalledOnce();
    expect(projectAssets.removeObject).not.toHaveBeenCalled();
  });
});

function storageStub(): StoragePort {
  return {
    putObject: vi.fn(async (input) => ({
      key: input.key,
      url: `https://storage.test/${input.key}`,
      contentType: input.contentType,
      purpose: input.purpose,
      size: typeof input.body === "string" ? input.body.length : input.body.byteLength,
    })),
    createUploadUrl: vi.fn(async (input) => ({
      key: input.key,
      url: `https://storage.test/${input.key}`,
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    })),
    getSignedReadUrl: vi.fn(async (key) => `https://storage.test/${key}`),
    removeObject: vi.fn(async () => undefined),
    headObject: vi.fn(async () => ({
      contentLength: 5,
      contentType: "application/octet-stream",
    })),
  };
}
