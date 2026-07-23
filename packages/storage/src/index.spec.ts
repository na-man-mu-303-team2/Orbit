import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  LocalMinioStorage,
  PurposeRoutingStorage,
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
      purpose: "report-result",
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

  it("streams object content without buffering and preserves response metadata", async () => {
    const storage = new LocalMinioStorage({
      endpoint: "http://minio:9000",
      publicEndpoint: "http://localhost:9000",
      bucket: "orbit-local",
      region: "ap-northeast-2",
      accessKeyId: "orbit",
      secretAccessKey: "orbit-password",
      forcePathStyle: true,
    });
    const source = Readable.from([Buffer.from("slide-image")]);
    const send = vi.fn(async () => ({
      Body: source,
      ContentLength: 11,
      ContentType: "image/webp",
      ETag: '"storage-etag"',
    }));
    (
      storage as unknown as {
        internalClient: { send: typeof send };
      }
    ).internalClient.send = send;

    const result = await storage.getObjectStream(
      "projects/project_1/assets/file_1-slide.webp",
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.body) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks).toString()).toBe("slide-image");
    expect(result).toMatchObject({
      contentLength: 11,
      contentType: "image/webp",
      etag: '"storage-etag"',
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("uses the requested expiry for a signed read URL", async () => {
    const storage = new LocalMinioStorage({
      endpoint: "http://minio:9000",
      publicEndpoint: "http://localhost:9000",
      bucket: "orbit-local",
      region: "ap-northeast-2",
      accessKeyId: "orbit",
      secretAccessKey: "orbit-password",
      forcePathStyle: true,
    });

    const url = new URL(
      await storage.getSignedReadUrl(
        "projects/project_1/assets/file_audio_1/rehearsal.webm",
        300,
      ),
    );

    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("returns object integrity metadata from HEAD", async () => {
    const storage = new LocalMinioStorage({
      endpoint: "http://minio:9000",
      publicEndpoint: "http://localhost:9000",
      bucket: "orbit-local",
      region: "ap-northeast-2",
      accessKeyId: "orbit",
      secretAccessKey: "orbit-password",
      forcePathStyle: true,
    });
    const send = vi.fn(async () => ({
      ContentLength: 1_024,
      ContentType: "image/png",
      Metadata: { "orbit-sha256": "a".repeat(64) },
    }));
    (
      storage as unknown as {
        internalClient: { send: typeof send };
      }
    ).internalClient.send = send;

    await expect(storage.headObject("projects/project-1/image.png")).resolves.toEqual(
      {
        contentLength: 1_024,
        contentType: "image/png",
        metadata: { "orbit-sha256": "a".repeat(64) },
      },
    );
  });
});

describe("PurposeRoutingStorage", () => {
  const createStore = (name: string, presentKeys: string[] = []) => {
    const present = new Set(presentKeys);
    return {
      putObject: vi.fn(async (input) => ({
        key: input.key,
        url: `${name}:${input.key}`,
        contentType: input.contentType,
        purpose: input.purpose,
        size: typeof input.body === "string" ? input.body.length : input.body.byteLength,
      })),
      createUploadUrl: vi.fn(async (input) => ({
        key: input.key,
        url: `${name}:${input.key}`,
        method: "PUT" as const,
        headers: { "content-type": input.contentType },
        expiresAt: new Date(0).toISOString(),
      })),
      getObject: vi.fn(async (key) => ({
        body: new TextEncoder().encode(`${name}:${key}`),
        contentType: "application/octet-stream",
      })),
      getObjectStream: vi.fn(),
      getSignedReadUrl: vi.fn(async (key) => `${name}:${key}`),
      removeObject: vi.fn(async () => undefined),
      headObject: vi.fn(async (key) =>
        present.has(key)
          ? { contentLength: 1, contentType: "application/octet-stream" }
          : null,
      ),
    } satisfies StoragePort;
  };

  it("routes private audio writes to the private store and assets elsewhere", async () => {
    const assets = createStore("assets");
    const privateAudio = createStore("private");
    const storage = new PurposeRoutingStorage(assets, privateAudio);

    await storage.createUploadUrl({
      key: "raw/rehearsals/audio.webm",
      contentType: "audio/webm",
      expiresInSeconds: 900,
      purpose: "rehearsal-audio",
    });
    await storage.createUploadUrl({
      key: "projects/p/assets/deck.pptx",
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      expiresInSeconds: 900,
      purpose: "pptx-import",
    });

    expect(privateAudio.createUploadUrl).toHaveBeenCalledOnce();
    expect(assets.createUploadUrl).toHaveBeenCalledOnce();
  });

  it("reads private first and falls back to the legacy assets store", async () => {
    const assets = createStore("assets", ["legacy.webm"]);
    const privateAudio = createStore("private", ["new.webm"]);
    const storage = new PurposeRoutingStorage(assets, privateAudio);

    await expect(storage.getSignedReadUrl("new.webm")).resolves.toBe(
      "private:new.webm",
    );
    await expect(storage.getSignedReadUrl("legacy.webm")).resolves.toBe(
      "assets:legacy.webm",
    );
  });

  it("deletes both private and legacy copies", async () => {
    const assets = createStore("assets");
    const privateAudio = createStore("private");
    const storage = new PurposeRoutingStorage(assets, privateAudio);

    await storage.removeObject("audio.webm");

    expect(privateAudio.removeObject).toHaveBeenCalledWith("audio.webm");
    expect(assets.removeObject).toHaveBeenCalledWith("audio.webm");
  });
});
