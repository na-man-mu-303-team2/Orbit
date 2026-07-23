import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest
} from "../auth/current-user";
import { parseRequest } from "../common/zod-request";
import { RequiresAsyncJobAdmission } from "../common/async-job-admission.guard";
import { ProjectsService } from "../projects/projects.service";
import { ExtractService } from "./extract.service";

interface UploadedExtractFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const extractRequestSchema: z.ZodType<{
  projectId: string;
  fileIds?: string[];
}, z.ZodTypeDef, unknown> = z.object({
  projectId: z.string().trim().min(1),
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
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly extractService: ExtractService
  ) {}

  @Post()
  @RequiresAsyncJobAdmission()
  @UseInterceptors(FilesInterceptor("files"))
  async extract(
    @UploadedFiles() files: UploadedExtractFile[] | undefined,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    if (!files?.length) {
      throw new BadRequestException("At least one file is required.");
    }

    const { fileIds, projectId } = parseRequest(extractRequestSchema, body ?? {});
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);

    try {
      return await this.extractService.extract(files, projectId, fileIds);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "Python worker extraction failed."
      );
    }
  }
}
