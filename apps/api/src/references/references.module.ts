import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { ReferencesController } from "./references.controller";
import { ReferencesService } from "./references.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ReferencesController],
  providers: [ReferencesService],
  exports: [ReferencesService]
})
export class ReferencesModule {}
