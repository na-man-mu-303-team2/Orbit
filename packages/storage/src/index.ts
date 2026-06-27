import { FilePurpose } from "@orbit/shared";

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

export interface StoragePort {
  putObject(input: StoragePutInput): Promise<StorageObject>;
  createUploadUrl(input: StorageUploadUrlInput): Promise<StorageUploadUrl>;
  getSignedReadUrl(key: string): Promise<string>;
  removeObject(key: string): Promise<void>;
}

export class LocalMinioStorage implements StoragePort {
  constructor(
    private readonly publicEndpoint = "http://localhost:9000",
    private readonly bucket = "orbit-local",
  ) {}

  async putObject(input: StoragePutInput): Promise<StorageObject> {
    const size =
      typeof input.body === "string"
        ? input.body.length
        : input.body.byteLength;

    return {
      key: input.key,
      url: `${this.publicEndpoint}/${input.key}`,
      contentType: input.contentType,
      purpose: input.purpose,
      size,
    };
  }

  async createUploadUrl(
    input: StorageUploadUrlInput,
  ): Promise<StorageUploadUrl> {
    const expiresAt = new Date(
      Date.now() + input.expiresInSeconds * 1000,
    ).toISOString();

    return {
      key: input.key,
      url: this.objectUrl(input.key),
      method: "PUT",
      headers: {
        "content-type": input.contentType,
      },
      expiresAt,
    };
  }

  async getSignedReadUrl(key: string): Promise<string> {
    return this.objectUrl(key);
  }

  async removeObject(_key: string): Promise<void> {
    return undefined;
  }

  private objectUrl(key: string): string {
    const normalizedEndpoint = this.publicEndpoint.replace(/\/+$/, "");
    const encodedKey = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return `${normalizedEndpoint}/${this.bucket}/${encodedKey}`;
  }
}

export class S3Storage implements StoragePort {
  async putObject(_input: StoragePutInput): Promise<StorageObject> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }

  async createUploadUrl(
    _input: StorageUploadUrlInput,
  ): Promise<StorageUploadUrl> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }

  async getSignedReadUrl(_key: string): Promise<string> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }

  async removeObject(_key: string): Promise<void> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }
}
