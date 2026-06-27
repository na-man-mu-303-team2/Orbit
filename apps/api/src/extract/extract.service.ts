import type { ReferenceExtractResponse } from "@orbit/shared";
import { referenceExtractResponseSchema } from "@orbit/shared";
import { Injectable } from "@nestjs/common";
import { JobsService } from "../jobs/jobs.service";

interface UploadedExtractFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class ExtractService {
  constructor(private readonly jobsService: JobsService) {}

  async extract(
    files: UploadedExtractFile[],
    projectId: string
  ): Promise<ReferenceExtractResponse> {
    // ponytail: DB payload keeps MVP simple; move upload bytes to object storage when size matters.
    const queuedJob = await this.jobsService.create({
      projectId,
      type: "reference-extract",
      payload: {
        files: files.map((file) => ({
          originalName: file.originalname || "upload",
          mimeType: file.mimetype || "application/octet-stream",
          contentBase64: file.buffer.toString("base64")
        }))
      }
    });

    return referenceExtractResponseSchema.parse({
      files: [],
      job: queuedJob
    });
  }
}
