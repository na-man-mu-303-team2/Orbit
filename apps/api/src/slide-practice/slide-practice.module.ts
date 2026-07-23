import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { SlidePracticeController } from "./slide-practice.controller";
import { SlidePracticeService } from "./slide-practice.service";

@Module({
  imports: [AuthModule, DecksModule, FilesModule, JobsModule, ProjectsModule],
  controllers: [SlidePracticeController],
  providers: [SlidePracticeService],
  exports: [SlidePracticeService],
})
export class SlidePracticeModule {}
