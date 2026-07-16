import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Project, demoIds } from "@orbit/shared";
import { StoragePort } from "@orbit/storage";
import { Repository } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function createStorage(overrides: Partial<StoragePort> = {}): StoragePort {
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
    headObject: vi.fn(async () => ({
      contentLength: 1024,
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    })),
    ...overrides,
  };
}

function createService(
  projectsService: Partial<ProjectsService>,
  options: {
    uploadProxyOrigin?: string | null;
    storagePatch?: Partial<StoragePort>;
  } = {},
) {
  const { assets, repository } = createAssetRepository();
  const storage = createStorage(options.storagePatch);

  return {
    assets,
    repository,
    storage,
    service: new FilesService(
      repository,
      projectsService as ProjectsService,
      storage,
      options.uploadProxyOrigin,
    ),
  };
}

describe("FilesService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("creates a pending upload URL and completes it as uploaded metadata", async () => {
    const { assets, service } = createService({
      getAccessibleProject: vi.fn(async () => demoProject),
    });

    const upload = await service.createUploadUrl(
      demoProject.projectId,
      {
        originalName: "slides.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: 1024,
        purpose: "pptx-import",
      },
      demoIds.userId,
    );

    expect(upload.fileId).toMatch(/^file_/);
    expect(upload.projectId).toBe(demoProject.projectId);
    expect(upload.method).toBe("PUT");
    expect(assets).toHaveLength(1);
    expect(assets[0].status).toBe("pending");
    expect(assets[0].createdByUserId).toBe(demoIds.userId);

    await expect(service.list(demoProject.projectId)).resolves.toEqual([]);

    const completed = await service.completeUpload(
      demoProject.projectId,
      {
        fileId: upload.fileId,
      },
      demoIds.userId,
    );

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

  it("keeps rehearsal slide snapshots private to their creator", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    } as Response);
    const { assets, service } = createService(
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      },
      {
        storagePatch: {
          headObject: vi.fn(async () => ({
            contentLength: 3,
            contentType: "image/png",
          })),
        },
      },
    );
    const upload = await service.createUploadUrl(
      demoProject.projectId,
      {
        originalName: "slide-1.png",
        mimeType: "image/png",
        size: 3,
        purpose: "rehearsal-slide-snapshot",
      },
      demoIds.userId,
    );

    await service.storeUploadContent(
      demoProject.projectId,
      upload.fileId,
      Buffer.from("png"),
      demoIds.userId,
      ["rehearsal-slide-snapshot"],
    );
    const completed = await service.completeUpload(
      demoProject.projectId,
      { fileId: upload.fileId },
      demoIds.userId,
    );

    expect(assets[0].createdByUserId).toBe(demoIds.userId);
    expect(completed.url).toBe(
      `/api/v1/projects/${demoProject.projectId}/rehearsal-slide-snapshots/${upload.fileId}/content`,
    );
    expect(assets[0].url).toBe(completed.url);
    await expect(service.list(demoProject.projectId)).resolves.toEqual([]);
    await expect(
      service.getUploadedAsset(
        demoProject.projectId,
        upload.fileId,
        "rehearsal-slide-snapshot",
        "user_other",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.readUploadedAssetContent(
        demoProject.projectId,
        upload.fileId,
        undefined,
        "user_other",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.readUploadedAssetContent(
        demoProject.projectId,
        upload.fileId,
        undefined,
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.readRehearsalSlideSnapshotContent(
        demoProject.projectId,
        upload.fileId,
        demoIds.userId,
      ),
    ).resolves.toMatchObject({ contentType: "image/png" });
  });

  it("rejects rehearsal audio through generic completion while preserving the dedicated command", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_rehearsal_audio_1",
        projectId: demoProject.projectId,
        createdByUserId: demoIds.userId,
        storageKey:
          "projects/project_demo_created/assets/file_rehearsal_audio_1/rehearsal.webm",
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        url: "internal://rehearsal-audio",
        purpose: "rehearsal-audio",
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
      createStorage({
        headObject: vi.fn(async () => ({
          contentLength: 1024,
          contentType: "audio/webm",
        })),
      }),
    );

    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_rehearsal_audio_1" },
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_rehearsal_audio_1" },
        demoIds.userId,
        "rehearsal-audio",
      ),
    ).resolves.toMatchObject({
      fileId: "file_rehearsal_audio_1",
      purpose: "rehearsal-audio",
    });
  });

  it("hides private audio from generic complete, get, list, and content boundaries", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_private_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/private/file_private_1.webm",
        originalName: "focused-attempt.webm",
        mimeType: "audio/webm",
        size: 1024,
        url: "internal://private-audio",
        purpose: "focused-practice-audio",
        status: "uploaded",
        createdAt: new Date(),
        uploadedAt: new Date(),
        deletedAt: null,
      } as ProjectAssetEntity,
    ]);
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      createStorage(),
    );

    await expect(service.list(demoProject.projectId)).resolves.toEqual([]);
    await expect(
      service.getUploadedAsset(demoProject.projectId, "file_private_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_private_1" },
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.readUploadedAssetContent(demoProject.projectId, "file_private_1"),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.getUploadedAsset(
        demoProject.projectId,
        "file_private_1",
        "focused-practice-audio",
      ),
    ).resolves.toMatchObject({ fileId: "file_private_1" });
  });

  it("uses the request origin for local upload proxy URLs", async () => {
    const { service } = createService(
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      },
      {
        uploadProxyOrigin: "http://localhost:5173",
      },
    );

    const upload = await service.createUploadUrl(
      demoProject.projectId,
      {
        originalName: "diagram.png",
        mimeType: "image/png",
        size: 1024,
        purpose: "reference-material",
      },
      demoIds.userId,
      "http://127.0.0.1:5173",
    );

    expect(upload.uploadUrl).toContain(
      "http://127.0.0.1:5173/api/v1/projects/",
    );
  });

  it("falls back to the configured web origin when the request origin is absent", async () => {
    const { service } = createService(
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      },
      {
        uploadProxyOrigin: "http://localhost:5173",
      },
    );

    const upload = await service.createUploadUrl(
      demoProject.projectId,
      {
        originalName: "diagram.png",
        mimeType: "image/png",
        size: 1024,
        purpose: "reference-material",
      },
      demoIds.userId,
    );

    expect(upload.uploadUrl).toContain(
      "http://localhost:5173/api/v1/projects/",
    );
  });

  it("rejects complete requests for an asset outside the project boundary", async () => {
    const projectId = demoProject.projectId;
    const foreignProjectId = "project_foreign";
    const { repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: foreignProjectId,
        storageKey: "projects/project_foreign/assets/file_1-report.pdf",
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
      service.completeUpload(projectId, { fileId: "file_1" }, demoIds.userId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps an asset pending when the uploaded object is missing in storage", async () => {
    const { assets, repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.pdf",
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
      createStorage({
        headObject: vi.fn(async () => null),
      }),
    );

    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_1" },
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assets[0].status).toBe("pending");
    expect(assets[0].uploadedAt).toBeNull();
  });

  it("keeps an asset pending when the uploaded object size mismatches metadata", async () => {
    const { assets, repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.pdf",
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
      createStorage({
        headObject: vi.fn(async () => ({
          contentLength: 2048,
          contentType: "application/pdf",
        })),
      }),
    );

    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_1" },
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(assets[0].status).toBe("pending");
    expect(assets[0].uploadedAt).toBeNull();
  });

  it("keeps an asset pending when the uploaded object content-type mismatches metadata", async () => {
    const { assets, repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.pdf",
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
      createStorage({
        headObject: vi.fn(async () => ({
          contentLength: 1024,
          contentType: "audio/webm",
        })),
      }),
    );

    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_1" },
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(assets[0].status).toBe("pending");
    expect(assets[0].uploadedAt).toBeNull();
  });

  it("stores uploaded proxy content in the project asset object", async () => {
    const { assets, repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.pdf",
        originalName: "report.pdf",
        mimeType: "application/pdf",
        size: 4,
        url: "http://localhost:5173/api/v1/projects/project_demo_created/assets/file_1/content",
        purpose: "reference-material",
        status: "pending",
        createdAt: new Date(),
        uploadedAt: null,
      } as ProjectAssetEntity,
    ]);
    const storage = createStorage();
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      storage,
    );

    await service.storeUploadContent(
      demoProject.projectId,
      "file_1",
      Buffer.from("%PDF"),
      demoIds.userId,
    );

    expect(storage.putObject).toHaveBeenCalledWith({
      key: "projects/project_demo_created/assets/file_1-report.pdf",
      body: Buffer.from("%PDF"),
      contentType: "application/pdf",
      purpose: "reference-material",
    });
    expect(assets[0].url).toBe(
      "http://localhost:9000/orbit-local/projects/project_demo_created/assets/file_1-report.pdf",
    );
  });

  it("rejects local upload proxy writes for completed assets", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.pdf",
        originalName: "report.pdf",
        mimeType: "application/pdf",
        size: 4,
        url: "http://localhost:9000/orbit-local/report.pdf",
        purpose: "reference-material",
        status: "uploaded",
        createdAt: new Date(),
        uploadedAt: new Date(),
      } as ProjectAssetEntity,
    ]);
    const storage = createStorage();
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      storage,
    );

    await expect(
      service.storeUploadContent(
        demoProject.projectId,
        "file_1",
        Buffer.from("%PDF"),
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("rejects local upload proxy writes when body size does not match metadata", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.pdf",
        originalName: "report.pdf",
        mimeType: "application/pdf",
        size: 4,
        url: "http://localhost:9000/orbit-local/report.pdf",
        purpose: "reference-material",
        status: "pending",
        createdAt: new Date(),
        uploadedAt: null,
      } as ProjectAssetEntity,
    ]);
    const storage = createStorage();
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      storage,
    );

    await expect(
      service.storeUploadContent(
        demoProject.projectId,
        "file_1",
        Buffer.from("too-large"),
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("stores local uploaded proxy content with a same-origin read URL", async () => {
    const { assets, repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.png",
        originalName: "report.png",
        mimeType: "image/png",
        size: 3,
        url: "http://localhost:5173/api/v1/projects/project_demo_created/assets/file_1/content",
        purpose: "reference-material",
        status: "pending",
        createdAt: new Date(),
        uploadedAt: null,
      } as ProjectAssetEntity,
    ]);
    const storage = createStorage();
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      storage,
      "http://localhost:5173",
    );

    await service.storeUploadContent(
      demoProject.projectId,
      "file_1",
      Buffer.from("png"),
      demoIds.userId,
    );

    expect(assets[0].url).toBe(
      "http://localhost:5173/api/v1/projects/project_demo_created/assets/file_1/content",
    );
  });

  it("reads uploaded asset content through the local proxy path", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    } as Response);

    const { repository } = createAssetRepository([
      {
        fileId: "file_1",
        projectId: demoProject.projectId,
        storageKey: "projects/project_demo_created/assets/file_1-report.png",
        originalName: "report.png",
        mimeType: "image/png",
        size: 3,
        url: "http://localhost:5173/api/v1/projects/project_demo_created/assets/file_1/content",
        purpose: "reference-material",
        status: "uploaded",
        createdAt: new Date(),
        uploadedAt: new Date(),
      } as ProjectAssetEntity,
    ]);
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      createStorage(),
      "http://localhost:5173",
    );

    const asset = await service.readUploadedAssetContent(
      demoProject.projectId,
      "file_1",
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:9000/orbit-local/projects/project_demo_created/assets/file_1-report.png",
    );
    expect(asset.contentType).toBe("image/png");
    expect(Array.from(asset.body)).toEqual([1, 2, 3]);
  });

  it("rejects asset content reads for non-public purposes", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_audio_1",
        projectId: demoProject.projectId,
        createdByUserId: demoIds.userId,
        storageKey:
          "projects/project_demo_created/assets/file_audio_1/rehearsal.webm",
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        url: "http://localhost:9000/orbit-local/rehearsal.webm",
        purpose: "rehearsal-audio",
        status: "uploaded",
        createdAt: new Date(),
        uploadedAt: new Date(),
      } as ProjectAssetEntity,
    ]);
    const storage = createStorage();
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      storage,
    );

    await expect(
      service.readUploadedAssetContent(demoProject.projectId, "file_audio_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getSignedReadUrl).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns not found when completing an unknown asset", async () => {
    const { service } = createService({
      getAccessibleProject: vi.fn(async () => demoProject),
    });

    await expect(
      service.completeUpload(
        demoProject.projectId,
        { fileId: "file_missing" },
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns uploaded rehearsal audio metadata for job starters", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_audio_1",
        projectId: demoProject.projectId,
        createdByUserId: demoIds.userId,
        storageKey:
          "projects/project_demo_created/assets/file_audio_1/rehearsal.webm",
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        url: "http://localhost:9000/orbit-local/rehearsal.webm",
        purpose: "rehearsal-audio",
        status: "uploaded",
        createdAt: new Date(),
        uploadedAt: new Date(),
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
      service.getUploadedAsset(
        demoProject.projectId,
        "file_audio_1",
        "rehearsal-audio",
        demoIds.userId,
      ),
    ).resolves.toMatchObject({
      fileId: "file_audio_1",
      purpose: "rehearsal-audio",
      status: "uploaded",
    });
  });

  it("deletes uploaded rehearsal audio object and marks metadata deleted", async () => {
    const { assets, repository } = createAssetRepository([
      {
        fileId: "file_audio_1",
        projectId: demoProject.projectId,
        createdByUserId: demoIds.userId,
        storageKey:
          "projects/project_demo_created/assets/file_audio_1/rehearsal.webm",
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        url: "http://localhost:9000/orbit-local/rehearsal.webm",
        purpose: "rehearsal-audio",
        status: "uploaded",
        createdAt: new Date(),
        uploadedAt: new Date(),
        deletedAt: null,
      } as ProjectAssetEntity,
    ]);
    const storage = createStorage();
    const service = new FilesService(
      repository,
      {
        getAccessibleProject: vi.fn(async () => demoProject),
      } as unknown as ProjectsService,
      storage,
    );

    const deletedAt = await service.deleteUploadedAsset(
      demoProject.projectId,
      "file_audio_1",
      "rehearsal-audio",
      demoIds.userId,
    );

    expect(storage.removeObject).toHaveBeenCalledWith(
      "projects/project_demo_created/assets/file_audio_1/rehearsal.webm",
    );
    expect(new Date(deletedAt).toISOString()).toBe(deletedAt);
    expect(assets[0]).toMatchObject({
      status: "deleted",
      deletedAt: expect.any(Date),
    });
  });

  it("rejects pending assets before starting asset-backed jobs", async () => {
    const { repository } = createAssetRepository([
      {
        fileId: "file_audio_1",
        projectId: demoProject.projectId,
        createdByUserId: demoIds.userId,
        storageKey:
          "projects/project_demo_created/assets/file_audio_1/rehearsal.webm",
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        url: "http://localhost:9000/orbit-local/rehearsal.webm",
        purpose: "rehearsal-audio",
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
      service.getUploadedAsset(
        demoProject.projectId,
        "file_audio_1",
        "rehearsal-audio",
        demoIds.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
