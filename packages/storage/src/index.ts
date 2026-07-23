import { FilePurpose, privateAudioPurposes } from "@orbit/shared";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoragePutInput {
  key: string;
  body: Uint8Array | string;
  contentType: string;
  purpose: FilePurpose;
  metadata?: Record<string, string>;
}

export interface StorageUploadUrlInput {
  key: string;
  contentType: string;
  expiresInSeconds: number;
  purpose: FilePurpose;
}

export interface StorageUploadUrl {
  key: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StorageObject {
  key: string;
  url: string;
  contentType: string;
  purpose: FilePurpose;
  size: number;
}

export interface StorageHeadResult {
  contentLength: number;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageReadResult {
  body: Uint8Array;
  contentType: string;
}

export interface StorageStreamReadResult {
  body: Readable;
  contentLength: number;
  contentType: string;
  etag?: string;
}

export interface StoragePort {
  putObject(input: StoragePutInput): Promise<StorageObject>;
  createUploadUrl(input: StorageUploadUrlInput): Promise<StorageUploadUrl>;
  getObject(key: string): Promise<StorageReadResult>;
  getObjectStream(key: string): Promise<StorageStreamReadResult>;
  getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  removeObject(key: string): Promise<void>;
  headObject(key: string): Promise<StorageHeadResult | null>;
}

export interface S3CompatibleStorageOptions {
  endpoint?: string;
  publicEndpoint?: string;
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export class S3CompatibleStorage implements StoragePort {
  private readonly bucket: string;
  private readonly forcePathStyle: boolean;
  private readonly region: string;
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;

  constructor(private readonly options: S3CompatibleStorageOptions) {
    this.bucket = options.bucket;
    this.region = options.region;
    this.forcePathStyle = options.forcePathStyle ?? false;
    this.internalClient = this.createClient(options.endpoint);
    this.publicClient = this.createClient(
      options.publicEndpoint ?? options.endpoint,
    );
  }

  // API 서버가 직접 object를 저장해야 할 때 S3-compatible bucket에 PUT한다.
  async putObject(input: StoragePutInput): Promise<StorageObject> {
    const size =
      typeof input.body === "string"
        ? input.body.length
        : input.body.byteLength;

    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );

    return {
      key: input.key,
      url: this.objectUrl(input.key),
      contentType: input.contentType,
      purpose: input.purpose,
      size,
    };
  }

  // 브라우저가 직접 PUT할 수 있는 짧은 수명의 presigned URL을 만든다.
  async createUploadUrl(
    input: StorageUploadUrlInput,
  ): Promise<StorageUploadUrl> {
    const expiresAt = new Date(
      Date.now() + input.expiresInSeconds * 1000,
    ).toISOString();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });

    return {
      key: input.key,
      url: await getSignedUrl(this.publicClient, command, {
        expiresIn: input.expiresInSeconds,
      }),
      method: "PUT",
      headers: {
        "content-type": input.contentType,
      },
      expiresAt,
    };
  }

  async getObject(key: string): Promise<StorageReadResult> {
    const result = await this.internalClient.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) {
      throw new Error(`Storage object body is empty: ${key}`);
    }
    return {
      body: await result.Body.transformToByteArray(),
      contentType: result.ContentType ?? "application/octet-stream",
    };
  }

  async getObjectStream(key: string): Promise<StorageStreamReadResult> {
    const result = await this.internalClient.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) {
      throw new Error(`Storage object body is empty: ${key}`);
    }

    return {
      body: Readable.from(result.Body as AsyncIterable<Uint8Array>),
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "application/octet-stream",
      etag: result.ETag,
    };
  }
  // 저장된 object를 읽기 위한 presigned GET URL을 만든다.
  async getSignedReadUrl(
    key: string,
    expiresInSeconds = 15 * 60,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  // object 존재 여부와 메타데이터를 확인한다. 없으면 null을 반환한다.
  async headObject(key: string): Promise<StorageHeadResult | null> {
    try {
      const result = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? "",
        metadata: result.Metadata ?? {},
      };
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  // cleanup이 필요할 때 S3-compatible bucket에서 object를 삭제한다.
  async removeObject(key: string): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  // endpoint와 credentials를 주입해 MinIO와 AWS S3를 같은 인터페이스로 다룬다.
  private createClient(endpoint?: string): S3Client {
    const hasStaticCredentials =
      Boolean(this.options.accessKeyId) &&
      Boolean(this.options.secretAccessKey);

    return new S3Client({
      region: this.region,
      endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: hasStaticCredentials
        ? {
            accessKeyId: this.options.accessKeyId ?? "",
            secretAccessKey: this.options.secretAccessKey ?? "",
          }
        : undefined,
    });
  }

  // metadata 응답에 넣을 공개 object URL을 endpoint 형태에 맞춰 만든다.
  private objectUrl(key: string): string {
    const encodedKey = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    if (this.options.publicEndpoint) {
      const normalizedEndpoint = this.options.publicEndpoint.replace(
        /\/+$/,
        "",
      );
      return `${normalizedEndpoint}/${this.bucket}/${encodedKey}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }
}

export class LocalMinioStorage extends S3CompatibleStorage {
  constructor(options: S3CompatibleStorageOptions) {
    super({
      ...options,
      endpoint: options.endpoint ?? "http://localhost:9000",
      publicEndpoint: options.publicEndpoint ?? "http://localhost:9000",
      bucket: options.bucket || "orbit-local",
      forcePathStyle: options.forcePathStyle ?? true,
    });
  }
}

export class S3Storage extends S3CompatibleStorage {
  constructor(options: S3CompatibleStorageOptions) {
    super(options);
  }
}

/**
 * Routes new private-audio writes to their dedicated store while keeping
 * read/delete compatibility with objects written to the legacy assets store.
 */
export class PurposeRoutingStorage implements StoragePort {
  constructor(
    private readonly assets: StoragePort,
    private readonly privateAudio: StoragePort,
  ) {}

  putObject(input: StoragePutInput): Promise<StorageObject> {
    return this.writeTarget(input.purpose).putObject(input);
  }

  createUploadUrl(input: StorageUploadUrlInput): Promise<StorageUploadUrl> {
    return this.writeTarget(input.purpose).createUploadUrl(input);
  }

  async getObject(key: string): Promise<StorageReadResult> {
    return (await this.readTarget(key)).getObject(key);
  }

  async getObjectStream(key: string): Promise<StorageStreamReadResult> {
    return (await this.readTarget(key)).getObjectStream(key);
  }

  async getSignedReadUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string> {
    return (await this.readTarget(key)).getSignedReadUrl(
      key,
      expiresInSeconds,
    );
  }

  async removeObject(key: string): Promise<void> {
    if (this.assets === this.privateAudio) {
      await this.assets.removeObject(key);
      return;
    }

    await Promise.all([
      this.privateAudio.removeObject(key),
      this.assets.removeObject(key),
    ]);
  }

  async headObject(key: string): Promise<StorageHeadResult | null> {
    return (
      (await this.privateAudio.headObject(key)) ??
      (await this.assets.headObject(key))
    );
  }

  private writeTarget(purpose: FilePurpose): StoragePort {
    return privateAudioPurposes.has(purpose) ? this.privateAudio : this.assets;
  }

  private async readTarget(key: string): Promise<StoragePort> {
    if (this.assets === this.privateAudio) {
      return this.assets;
    }

    return (await this.privateAudio.headObject(key))
      ? this.privateAudio
      : this.assets;
  }
}
