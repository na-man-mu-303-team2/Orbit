import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ImportPptxController } from "./import-pptx.controller";
import {
  ImportPptxService,
  PPTX_IMPORT_ENQUEUE_JOB
} from "./import-pptx.service";
import { enqueuePptxImportJob } from "@orbit/job-queue";

@Module({
  imports: [FilesModule, JobsModule],
  controllers: [ImportPptxController],
  providers: [
    ImportPptxService,
    {
      provide: PPTX_IMPORT_ENQUEUE_JOB,
      useValue: enqueuePptxImportJob
    }
  ]
})
export class ImportPptxModule {}
