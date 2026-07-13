import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { CoachingCapabilitiesController } from "./coaching-capabilities.controller";

import { RuntimeConfigController } from "./runtime-config.controller";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [RuntimeConfigController, CoachingCapabilitiesController]
})
export class RuntimeConfigModule {}
