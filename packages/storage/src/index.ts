import { FilePurpose } from "@orbit/shared";

export interface StoragePutInput {
  key: string;
  body: Uint8Array | string;
  contentType: string;
  purpose: FilePurpose;
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
  getSignedReadUrl(key: string): Promise<string>;
  removeObject(key: string): Promise<void>;
}

export class LocalMinioStorage implements StoragePort {
  constructor(private readonly publicEndpoint = "http://localhost:9000") {}

  async putObject(input: StoragePutInput): Promise<StorageObject> {
    const size = typeof input.body === "string" ? input.body.length : input.body.byteLength;

    return {
      key: input.key,
      url: `${this.publicEndpoint}/${input.key}`,
      contentType: input.contentType,
      purpose: input.purpose,
      size
    };
  }

  async getSignedReadUrl(key: string): Promise<string> {
    return `${this.publicEndpoint}/${key}`;
  }

  async removeObject(_key: string): Promise<void> {
    return undefined;
  }
}

export class S3Storage implements StoragePort {
  async putObject(_input: StoragePutInput): Promise<StorageObject> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }

  async getSignedReadUrl(_key: string): Promise<string> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }

  async removeObject(_key: string): Promise<void> {
    throw new Error("S3Storage adapter is not implemented yet.");
  }
}
