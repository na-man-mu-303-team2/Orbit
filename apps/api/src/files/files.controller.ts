import {
  assetUploadUrlRequestSchema,
  completeAssetUploadRequestSchema,
} from "@orbit/shared";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { parseRequest } from "../common/zod-request";
import { FilesService } from "./files.service";

@Controller("api/v1/projects/:projectId/assets")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  listFiles(@Param("projectId") projectId: string) {
    return this.filesService.list(projectId);
  }

  @Post("upload-url")
  createUploadUrl(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.filesService.createUploadUrl(
      projectId,
      parseRequest(assetUploadUrlRequestSchema, body ?? {}),
    );
  }

  @Post("complete")
  completeUpload(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.filesService.completeUpload(
      projectId,
      parseRequest(completeAssetUploadRequestSchema, body ?? {}),
    );
  }
}
