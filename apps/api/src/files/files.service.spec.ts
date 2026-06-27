import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Project, demoIds } from "@orbit/shared";
import { StoragePort } from "@orbit/storage";
import { Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { ProjectsService } from "../projects/projects.service";
import { FilesService } from "./files.service";
import { ProjectAssetEntity } from "./project-asset.entity";

type AssetFindOptions = {
  where: Partial<ProjectAssetEntity>;
};

const demoProject: Project = {
  projectId: "project_demo_created",
  workspaceId: demoIds.workspaceId,
  title: "Demo",
  createdBy: demoIds.userId,
  createdAt: "2026-06-27T01:00:00.000Z",
};

function createAssetRepository(initialAssets: ProjectAssetEntity[] = []) {
  const assets = [...initialAssets];

  const repository = {
    create(input: Partial<ProjectAssetEntity>): ProjectAssetEntity {
      return input as ProjectAssetEntity;
    },
    async save(asset: ProjectAssetEntity): Promise<ProjectAssetEntity> {
      const index = assets.findIndex((item) => item.fileId === asset.fileId);
      if (index >= 0) {
        assets[index] = asset;
      } else {
        assets.push(asset);
      }

      return asset;
    },
    async find(options: AssetFindOptions): Promise<ProjectAssetEntity[]> {
      return assets.filter(
        (asset) =>
          asset.projectId === options.where.projectId &&
          asset.status === options.where.status,
      );
    },
    async findOne(
      options: AssetFindOptions,
    ): Promise<ProjectAssetEntity | null> {
      return (
        assets.find((asset) => asset.fileId === options.where.fileId) ?? null
      );
    },
  };

  return {
    assets,
    repository: repository as unknown as Repository<ProjectAssetEntity>,
  };
}

function createStorage(): StoragePort {
  return {
    putObject: vi.fn(async (input) => ({
      key: input.key,
      url: `http://localhost:9000/orbit-local/${input.key}`,
      contentType: input.contentType,
      purpose: input.purpose,
      size:
        typeof input.body === "string"
          ? input.body.length
          : input.body.byteLength,
    })),
    createUploadUrl: vi.fn(async (input) => ({
      key: input.key,
      url: `http://localhost:9000/orbit-local/${input.key}`,
      method: "PUT" as const,
      headers: {
        "content-type": input.contentType,
      },
      expiresAt: "2026-06-27T01:15:00.000Z",
    })),
    getSignedReadUrl: vi.fn(
      async (key) => `http://localhost:9000/orbit-local/${key}`,
    ),
    removeObject: vi.fn(async () => undefined),
  };
}

function createService(projectsService: Partial<ProjectsService>) {
  const { assets, repository } = createAssetRepository();

  return {
    assets,
    service: new FilesService(
      repository,
      projectsService as ProjectsService,
      createStorage(),
    ),
  };
}

describe("FilesService", () => {
  it("creates a pending upload URL and completes it as uploaded metadata", async () => {
    const { assets, service } = createService({
      getAccessibleProject: vi.fn(async () => demoProject),
    });

    const upload = await service.createUploadUrl(demoProject.projectId, {
      originalName: "slides.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 1024,
      purpose: "pptx-import",
    });

    expect(upload.fileId).toMatch(/^file_/);
    expect(upload.projectId).toBe(demoProject.projectId);
    expect(upload.method).toBe("PUT");
    expect(assets).toHaveLength(1);
    expect(assets[0].status).toBe("pending");

    await expect(service.list(demoProject.projectId)).resolves.toEqual([]);

    const completed = await service.completeUpload(demoProject.projectId, {
      fileId: upload.fileId,
    });

    expect(completed).toMatchObject({
      fileId: upload.fileId,
      projectId: demoProject.projectId,
      originalName: "slides.pptx",
      purpose: "pptx-import",
    });
    expect(assets[0].status).toBe("uploaded");
    await expect(service.list(demoProject.projectId)).resolves.toEqual([
      completed,
    ]);
  });

  it("rejects complete requests for an asset outside the project boundary", async () => {
    const projectId = demoProject.projectId;
    const foreignProjectId = "project_foreign";
    const { repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: foreignProjectId,
        storageKey: "projects/project_foreign/assets/file_1/report.pdf",
        originalName: "report.pdf",
        mimeType: "application/pdf",
        size: 1024,
        url: "http://localhost:9000/orbit-local/report.pdf",
        purpose: "reference-material",
        status: "pending",
        createdAt: new Date(),
        uploadedAt: null,
      } as ProjectAssetEntity,
    ]);
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      createStorage(),
    );

    await expect(
      service.completeUpload(projectId, { fileId: "file_1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found when completing an unknown asset", async () => {
    const { service } = createService({
      getAccessibleProject: vi.fn(async () => demoProject),
    });

    await expect(
      service.completeUpload(demoProject.projectId, { fileId: "file_missing" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
