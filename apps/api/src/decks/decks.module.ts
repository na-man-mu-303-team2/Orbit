import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { DecksController } from "./decks.controller";
import { DecksService } from "./decks.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [DecksController],
  providers: [DecksService],
  exports: [DecksService]
})
export class DecksModule {}
