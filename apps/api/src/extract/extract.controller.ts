import { demoIds } from "@orbit/shared";
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { parseRequest } from "../common/zod-request";
import { ExtractService } from "./extract.service";

interface UploadedExtractFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const extractRequestSchema: z.ZodType<{
  projectId?: string;
  fileIds?: string[];
}, z.ZodTypeDef, unknown> = z.object({
  projectId: z.string().trim().min(1).optional(),
  fileIds: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value
          : typeof value === "string"
            ? [value]
            : undefined,
      z.array(z.string()).optional()
    )
});

@Controller("extract")
export class ExtractController {
  constructor(private readonly extractService: ExtractService) {}

  @Post()
  @UseInterceptors(FilesInterceptor("files"))
  async extract(
    @UploadedFiles() files: UploadedExtractFile[] | undefined,
    @Body() body: unknown
  ) {
    if (!files?.length) {
      throw new BadRequestException("At least one file is required.");
    }

    const { fileIds, projectId } = parseRequest(extractRequestSchema, body ?? {});

    try {
      return await this.extractService.extract(
        files,
        projectId ?? demoIds.projectId,
        fileIds
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "Python worker extraction failed."
      );
    }
  }
}
