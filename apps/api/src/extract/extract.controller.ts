import { demoIds } from "@orbit/shared";
import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ExtractService } from "./extract.service";

interface UploadedExtractFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Controller("extract")
export class ExtractController {
  constructor(private readonly extractService: ExtractService) {}

  @Post()
  @UseInterceptors(FilesInterceptor("files"))
  async extract(@UploadedFiles() files: UploadedExtractFile[] | undefined) {
    if (!files?.length) {
      throw new BadRequestException("At least one file is required.");
    }

    try {
      return await this.extractService.extract(files, demoIds.projectId);
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
