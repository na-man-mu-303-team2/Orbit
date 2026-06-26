import {
  FilePurpose,
  UploadedFile,
  filePurposeSchema,
  nowIso,
  uploadedFileSchema
} from "@orbit/shared";
import { Injectable } from "@nestjs/common";

@Injectable()
export class FilesService {
  private readonly files = new Map<string, UploadedFile>();

  create(input: {
    projectId: string;
    originalName: string;
    mimeType: string;
    size: number;
    purpose: FilePurpose;
  }): UploadedFile {
    const fileId = `file_${Date.now()}`;
    const file = uploadedFileSchema.parse({
      fileId,
      projectId: input.projectId,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      url: `/uploads/${fileId}`,
      purpose: filePurposeSchema.parse(input.purpose),
      createdAt: nowIso()
    });

    this.files.set(file.fileId, file);
    return file;
  }

  list(projectId: string): UploadedFile[] {
    return [...this.files.values()].filter((file) => file.projectId === projectId);
  }
}

