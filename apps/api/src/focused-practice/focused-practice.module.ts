import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { FocusedPracticeController } from "./focused-practice.controller";
import { FocusedPracticeService } from "./focused-practice.service";

@Module({ imports: [AuthModule, FilesModule, JobsModule, ProjectsModule], controllers: [FocusedPracticeController], providers: [FocusedPracticeService] })
export class FocusedPracticeModule {}
