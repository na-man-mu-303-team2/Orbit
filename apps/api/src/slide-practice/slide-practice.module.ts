import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { SlidePracticeController } from "./slide-practice.controller";
import { SlidePracticeService } from "./slide-practice.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [SlidePracticeController],
  providers: [SlidePracticeService],
  exports: [SlidePracticeService],
})
export class SlidePracticeModule {}
