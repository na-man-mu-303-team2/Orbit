import { Module } from "@nestjs/common";
import {
  enqueueDesignImageGenerationJob,
  enqueueSlideRedesignJob,
} from "@orbit/job-queue";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { FilesModule } from "../files/files.module";
import { ProjectsModule } from "../projects/projects.module";
import { JobsModule } from "../jobs/jobs.module";
import { SmartArtLayoutsModule } from "../smart-art-layouts/smart-art-layouts.module";
import { DesignAgentController } from "./design-agent.controller";
import { DesignAgentMessageEntity } from "./design-agent-message.entity";
import { DesignAgentProposalEntity } from "./design-agent-proposal.entity";
import { DesignAgentPythonClient } from "./design-agent-python.client";
import { DesignAgentService } from "./design-agent.service";
import {
  DESIGN_IMAGE_GENERATION_ENQUEUE_JOB,
  DesignImageGenerationService,
} from "./design-image-generation.service";
import {
  SLIDE_REDESIGN_ENQUEUE_JOB,
  SlideRedesignJobService,
} from "./slide-redesign-job.service";

@Module({
  imports: [
    AuthModule,
    DecksModule,
    FilesModule,
    ProjectsModule,
    JobsModule,
    SmartArtLayoutsModule,
    TypeOrmModule.forFeature([
      DesignAgentMessageEntity,
      DesignAgentProposalEntity,
    ]),
  ],
  controllers: [DesignAgentController],
  providers: [
    DesignAgentService,
    DesignAgentPythonClient,
    DesignImageGenerationService,
    SlideRedesignJobService,
    {
      provide: DESIGN_IMAGE_GENERATION_ENQUEUE_JOB,
      useValue: enqueueDesignImageGenerationJob,
    },
    {
      provide: SLIDE_REDESIGN_ENQUEUE_JOB,
      useValue: enqueueSlideRedesignJob,
    },
  ],
  exports: [DesignAgentService],
})
export class DesignAgentModule {}
