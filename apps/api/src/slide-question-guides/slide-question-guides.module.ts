import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { SlideQuestionGuidesController } from "./slide-question-guides.controller";
import { SlideQuestionGuidesService } from "./slide-question-guides.service";

@Module({
  imports: [AuthModule, ProjectsModule, DecksModule, JobsModule],
  controllers: [SlideQuestionGuidesController],
  providers: [SlideQuestionGuidesService],
})
export class SlideQuestionGuidesModule {}
