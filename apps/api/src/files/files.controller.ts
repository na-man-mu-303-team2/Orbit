import {
  assetUploadUrlRequestSchema,
  completeAssetUploadRequestSchema,
} from "@orbit/shared";
import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
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

  // local upload proxy가 받은 파일 binary를 서비스 계층 저장 흐름으로 넘긴다.
  @Put(":fileId/content")
  @HttpCode(204)
  async uploadContent(
    @Param("projectId") projectId: string,
    @Param("fileId") fileId: string,
    @Req() request: Request,
  ) {
    await this.filesService.storeUploadContent(
      projectId,
      fileId,
      await readRequestBody(request),
    );
  }
}

// Express request stream에서 파일 binary를 하나의 Buffer로 모은다.
async function readRequestBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
