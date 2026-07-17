import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { ProjectsModule } from "../projects/projects.module";
import { FilesModule } from "../files/files.module";
import { SmartArtLayoutsModule } from "../smart-art-layouts/smart-art-layouts.module";
import { DesignAgentController } from "./design-agent.controller";
import { DesignAgentMessageEntity } from "./design-agent-message.entity";
import { DesignAgentProposalEntity } from "./design-agent-proposal.entity";
import { DesignAgentPythonClient } from "./design-agent-python.client";
import { DesignAgentService } from "./design-agent.service";

@Module({
  imports: [
    AuthModule,
    DecksModule,
    ProjectsModule,
    FilesModule,
    SmartArtLayoutsModule,
    TypeOrmModule.forFeature([
      DesignAgentMessageEntity,
      DesignAgentProposalEntity,
    ]),
  ],
  controllers: [DesignAgentController],
  providers: [DesignAgentService, DesignAgentPythonClient],
  exports: [DesignAgentService],
})
export class DesignAgentModule {}
