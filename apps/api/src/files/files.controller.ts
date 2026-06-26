import { filePurposeSchema } from "@orbit/shared";
import type { FilePurpose } from "@orbit/shared";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { FilesService } from "./files.service";

interface UploadedFileLike {
  originalname?: string;
  mimetype?: string;
  size?: number;
}

@Controller("projects/:projectId/files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  listFiles(@Param("projectId") projectId: string) {
    return this.filesService.list(projectId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  uploadFile(
    @Param("projectId") projectId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body("purpose") rawPurpose: string | undefined
  ) {
    const purpose: FilePurpose = filePurposeSchema.parse(
      rawPurpose ?? "reference-material"
    );

    return this.filesService.create({
      projectId,
      originalName: file?.originalname ?? "demo-upload.txt",
      mimeType: file?.mimetype ?? "text/plain",
      size: file?.size ?? 0,
      purpose
    });
  }
}
