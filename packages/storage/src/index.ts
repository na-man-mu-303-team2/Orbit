import { privateAudioPurposes, type FilePurpose } from "@orbit/shared";
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
}

export interface StorageUploadUrlInput {
  key: string;
  contentType: string;
  expiresInSeconds: number;
  purpose?: FilePurpose;
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
}

export interface StoragePort {
  putObject(input: StoragePutInput): Promise<StorageObject>;
  createUploadUrl(input: StorageUploadUrlInput): Promise<StorageUploadUrl>;
  getSignedReadUrl(key: string, purpose?: FilePurpose): Promise<string>;
  removeObject(key: string, purpose?: FilePurpose): Promise<void>;
  headObject(key: string, purpose?: FilePurpose): Promise<StorageHeadResult | null>;
}

export interface PurposeRoutedStorageOptions {
  projectAssets: StoragePort;
  privateAudio: StoragePort;
  privateAudioWritesEnabled: boolean;
}

export class PurposeRoutedStorage implements StoragePort {
  constructor(private readonly options: PurposeRoutedStorageOptions) {}

  async putObject(input: StoragePutInput): Promise<StorageObject> {
    return this.writeTarget(input.purpose).putObject(input);
  }

  async createUploadUrl(input: StorageUploadUrlInput): Promise<StorageUploadUrl> {
    return this.writeTarget(input.purpose).createUploadUrl(input);
  }

  async getSignedReadUrl(key: string, purpose?: FilePurpose): Promise<string> {
    return this.readTarget(key, purpose).getSignedReadUrl(key, purpose);
  }

  async headObject(
    key: string,
    purpose?: FilePurpose,
  ): Promise<StorageHeadResult | null> {
    return this.readTarget(key, purpose).headObject(key, purpose);
  }

  async removeObject(key: string, purpose?: FilePurpose): Promise<void> {
    const target = this.readTarget(key, purpose);
    await target.removeObject(key, purpose);
  }

  private writeTarget(purpose?: FilePurpose): StoragePort {
    if (
      isPrivateAudioPurpose(purpose) &&
      this.options.privateAudioWritesEnabled
    ) {
      return this.options.privateAudio;
    }

    return this.options.projectAssets;
  }

  private readTarget(key: string, purpose?: FilePurpose): StoragePort {
    if (!isPrivateAudioPurpose(purpose) || this.usesOnePhysicalBucket()) {
      return this.options.projectAssets;
    }

    return isPrivateAudioKey(key)
      ? this.options.privateAudio
      : this.options.projectAssets;
  }

  private usesOnePhysicalBucket(): boolean {
    return this.options.projectAssets === this.options.privateAudio;
  }
}

function isPrivateAudioPurpose(purpose?: FilePurpose): boolean {
  return purpose !== undefined && privateAudioPurposes.has(purpose);
}

function isPrivateAudioKey(key: string): boolean {
  return key.startsWith("raw/") || key.startsWith("evidence/");
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
    this.publicClient = this.createClient(options.publicEndpoint ?? options.endpoint);
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

  // 저장된 object를 읽기 위한 presigned GET URL을 만든다.
  async getSignedReadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: 15 * 60 },
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
      };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
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
      Boolean(this.options.accessKeyId) && Boolean(this.options.secretAccessKey);

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
      const normalizedEndpoint = this.options.publicEndpoint.replace(/\/+$/, "");
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
