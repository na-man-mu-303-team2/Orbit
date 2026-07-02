import {
  assetUploadUrlResponseSchema,
  filePurposeSchema,
  uploadedFileSchema,
} from "@orbit/shared";
import type {
  AssetUploadUrlRequest,
  AssetUploadUrlResponse,
  CompleteAssetUploadRequest,
  FilePurpose,
  UploadedFile,
} from "@orbit/shared";
import { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProjectsService } from "../projects/projects.service";
import { ProjectAssetEntity } from "./project-asset.entity";

export const STORAGE_PORT = Symbol("STORAGE_PORT");
export const UPLOAD_PROXY_ORIGIN = Symbol("UPLOAD_PROXY_ORIGIN");

const uploadUrlExpiresInSeconds = 15 * 60;
const publicAssetContentPurposes = new Set<FilePurpose>([
  "thumbnail",
  "pptx-import",
  "reference-material",
  "export-result",
  "report-result",
  "design-asset",
]);

@Injectable()
export class FilesService {
  private readonly localStorageEndpoint = (
    process.env.S3_ENDPOINT ?? "http://localhost:9000"
  ).replace(/\/+$/, "");
  private readonly localStorageBucket = process.env.S3_BUCKET ?? "orbit-local";

  constructor(
    @InjectRepository(ProjectAssetEntity)
    private readonly assetsRepository: Repository<ProjectAssetEntity>,
    private readonly projectsService: ProjectsService,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
    @Optional()
    @Inject(UPLOAD_PROXY_ORIGIN)
    private readonly uploadProxyOrigin: string | null = null,
  ) {}

  async createUploadUrl(
    projectId: string,
    input: AssetUploadUrlRequest,
    requestOrigin?: string | null,
  ): Promise<AssetUploadUrlResponse> {
    const project = await this.projectsService.getAccessibleProject(projectId);
    const fileId = `file_${randomUUID()}`;
    const storageKey = this.createStorageKey(
      project.projectId,
      fileId,
      input.originalName,
    );
    const uploadUrl = await this.createUploadTarget({
      projectId: project.projectId,
      fileId,
      key: storageKey,
      contentType: input.mimeType,
      expiresInSeconds: uploadUrlExpiresInSeconds,
      requestOrigin,
    });

    const asset = this.assetsRepository.create({
      fileId,
      projectId: project.projectId,
      storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      url: this.uploadProxyOrigin
        ? this.createAssetAccessUrl(project.projectId, fileId, requestOrigin)
        : uploadUrl.url,
      purpose: input.purpose,
      status: "pending",
      createdAt: new Date(),
      uploadedAt: null,
    });

    await this.assetsRepository.save(asset);

    return assetUploadUrlResponseSchema.parse({
      fileId,
      projectId: project.projectId,
      uploadUrl: uploadUrl.url,
      method: uploadUrl.method,
      headers: uploadUrl.headers,
      expiresAt: uploadUrl.expiresAt,
      purpose: input.purpose,
    });
  }

  // local MinIO 모드에서 브라우저가 보낸 binary를 실제 storage object로 저장한다.
  async storeUploadContent(
    projectId: string,
    fileId: string,
    body: Uint8Array,
  ): Promise<void> {
    await this.projectsService.getAccessibleProject(projectId);

    const asset = await this.assetsRepository.findOne({
      where: { fileId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset not found: ${fileId}`);
    }

    if (asset.projectId !== projectId) {
      throw new ForbiddenException("Project asset access denied");
    }

    const object = await this.storage.putObject({
      key: asset.storageKey,
      body,
      contentType: asset.mimeType,
      purpose: filePurposeSchema.parse(asset.purpose),
    });

    asset.url = this.uploadProxyOrigin
      ? this.createAssetAccessUrl(asset.projectId, asset.fileId)
      : object.url;
    await this.assetsRepository.save(asset);
  }

  async completeUpload(
    projectId: string,
    input: CompleteAssetUploadRequest,
  ): Promise<UploadedFile> {
    await this.projectsService.getAccessibleProject(projectId);

    const asset = await this.assetsRepository.findOne({
      where: { fileId: input.fileId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset not found: ${input.fileId}`);
    }

    if (asset.projectId !== projectId) {
      throw new ForbiddenException("Project asset access denied");
    }

    if (asset.status === "deleted") {
      throw new NotFoundException(`Asset is deleted: ${input.fileId}`);
    }

    if (asset.status !== "uploaded") {
      asset.status = "uploaded";
      asset.uploadedAt = new Date();
      await this.assetsRepository.save(asset);
    }

    return this.toUploadedFile(asset);
  }

  async getUploadedAsset(
    projectId: string,
    fileId: string,
    purpose?: FilePurpose,
  ): Promise<ProjectAssetEntity> {
    await this.projectsService.getAccessibleProject(projectId);

    const asset = await this.assetsRepository.findOne({
      where: { fileId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset not found: ${fileId}`);
    }

    if (asset.projectId !== projectId) {
      throw new ForbiddenException("Project asset access denied");
    }

    if (asset.status !== "uploaded") {
      throw new NotFoundException(`Asset is not uploaded: ${fileId}`);
    }

    if (purpose && asset.purpose !== purpose) {
      throw new ForbiddenException(`Asset purpose must be ${purpose}`);
    }

    return asset;
  }

  async deleteUploadedAsset(
    projectId: string,
    fileId: string,
    purpose?: FilePurpose,
  ): Promise<string> {
    await this.projectsService.getAccessibleProject(projectId);

    const asset = await this.assetsRepository.findOne({
      where: { fileId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset not found: ${fileId}`);
    }

    if (asset.projectId !== projectId) {
      throw new ForbiddenException("Project asset access denied");
    }

    if (purpose && asset.purpose !== purpose) {
      throw new ForbiddenException(`Asset purpose must be ${purpose}`);
    }

    if (asset.status === "deleted") {
      if (!asset.deletedAt) {
        throw new NotFoundException(`Asset is deleted without deletion time: ${fileId}`);
      }

      return asset.deletedAt.toISOString();
    }

    if (asset.status !== "uploaded") {
      throw new NotFoundException(`Asset is not uploaded: ${fileId}`);
    }

    await this.storage.removeObject(asset.storageKey);

    const deletedAt = new Date();
    asset.status = "deleted";
    asset.deletedAt = deletedAt;
    await this.assetsRepository.save(asset);

    return deletedAt.toISOString();
  }

  async list(projectId: string): Promise<UploadedFile[]> {
    await this.projectsService.getAccessibleProject(projectId);

    const assets = await this.assetsRepository.find({
      where: { projectId, status: "uploaded" },
      order: { createdAt: "ASC" },
    });

    return assets.map((asset) => this.toUploadedFile(asset));
  }

  async readUploadedAssetContent(
    projectId: string,
    fileId: string,
    purpose?: FilePurpose,
  ): Promise<{ body: Buffer; contentType: string }> {
    const asset = await this.getUploadedAsset(projectId, fileId, purpose);
    const assetPurpose = filePurposeSchema.parse(asset.purpose);

    if (!publicAssetContentPurposes.has(assetPurpose)) {
      throw new NotFoundException(`Asset content unavailable: ${fileId}`);
    }

    const readUrl = this.uploadProxyOrigin
      ? this.createInternalObjectUrl(asset.storageKey)
      : await this.storage.getSignedReadUrl(asset.storageKey);

    const response = await fetch(readUrl);

    if (!response.ok) {
      throw new NotFoundException(`Asset content unavailable: ${fileId}`);
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: asset.mimeType,
    };
  }

  private createStorageKey(
    projectId: string,
    fileId: string,
    originalName: string,
  ): string {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `projects/${projectId}/assets/${fileId}-${safeName}`;
  }

  // 환경에 따라 local API proxy URL 또는 S3 presigned URL을 선택한다.
  private async createUploadTarget(input: {
    projectId: string;
    fileId: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    requestOrigin?: string | null;
  }) {
    if (this.uploadProxyOrigin) {
      return {
        key: input.key,
        url: this.createUploadProxyUrl(
          input.projectId,
          input.fileId,
          input.requestOrigin,
        ),
        method: "PUT" as const,
        headers: {
          "content-type": input.contentType,
        },
        expiresAt: new Date(
          Date.now() + input.expiresInSeconds * 1000,
        ).toISOString(),
      };
    }

    return this.storage.createUploadUrl(input);
  }

  // 브라우저 origin과 같은 host를 쓰는 API upload proxy URL을 만든다.
  private createUploadProxyUrl(
    projectId: string,
    fileId: string,
    requestOrigin?: string | null,
  ): string {
    const origin = (requestOrigin ?? this.uploadProxyOrigin ?? "").replace(/\/+$/, "");
    return `${origin}/api/v1/projects/${encodeURIComponent(
      projectId,
    )}/assets/${encodeURIComponent(fileId)}/content`;
  }

  private createAssetAccessUrl(
    projectId: string,
    fileId: string,
    requestOrigin?: string | null,
  ) {
    return this.createUploadProxyUrl(projectId, fileId, requestOrigin);
  }

  private createInternalObjectUrl(storageKey: string) {
    const encodedKey = storageKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return `${this.localStorageEndpoint}/${this.localStorageBucket}/${encodedKey}`;
  }

  private toUploadedFile(asset: ProjectAssetEntity): UploadedFile {
    return uploadedFileSchema.parse({
      fileId: asset.fileId,
      projectId: asset.projectId,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      url: asset.url,
      purpose: asset.purpose,
      createdAt: asset.createdAt.toISOString(),
    });
  }
}
