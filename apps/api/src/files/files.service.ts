import {
  assetUploadUrlResponseSchema,
  uploadedFileSchema,
} from "@orbit/shared";
import type {
  AssetUploadUrlRequest,
  AssetUploadUrlResponse,
  CompleteAssetUploadRequest,
  UploadedFile,
} from "@orbit/shared";
import { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProjectsService } from "../projects/projects.service";
import { ProjectAssetEntity } from "./project-asset.entity";

export const STORAGE_PORT = Symbol("STORAGE_PORT");

const uploadUrlExpiresInSeconds = 15 * 60;

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(ProjectAssetEntity)
    private readonly assetsRepository: Repository<ProjectAssetEntity>,
    private readonly projectsService: ProjectsService,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
  ) {}

  async createUploadUrl(
    projectId: string,
    input: AssetUploadUrlRequest,
  ): Promise<AssetUploadUrlResponse> {
    const project = await this.projectsService.getAccessibleProject(projectId);
    const fileId = `file_${randomUUID()}`;
    const storageKey = this.createStorageKey(
      project.projectId,
      fileId,
      input.originalName,
    );
    const uploadUrl = await this.storage.createUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      expiresInSeconds: uploadUrlExpiresInSeconds,
    });

    const asset = this.assetsRepository.create({
      fileId,
      projectId: project.projectId,
      storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      url: uploadUrl.url,
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

    if (asset.status !== "uploaded") {
      asset.status = "uploaded";
      asset.uploadedAt = new Date();
      await this.assetsRepository.save(asset);
    }

    return this.toUploadedFile(asset);
  }

  async list(projectId: string): Promise<UploadedFile[]> {
    await this.projectsService.getAccessibleProject(projectId);

    const assets = await this.assetsRepository.find({
      where: { projectId, status: "uploaded" },
      order: { createdAt: "ASC" },
    });

    return assets.map((asset) => this.toUploadedFile(asset));
  }

  private createStorageKey(
    projectId: string,
    fileId: string,
    originalName: string,
  ): string {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `projects/${projectId}/assets/${fileId}/${safeName}`;
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
