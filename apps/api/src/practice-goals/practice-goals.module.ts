import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { PracticeGoalsController } from "./practice-goals.controller";
import { PracticeGoalsService } from "./practice-goals.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [PracticeGoalsController],
  providers: [PracticeGoalsService],
  exports: [PracticeGoalsService],
})
export class PracticeGoalsModule {}
