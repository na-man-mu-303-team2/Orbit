import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { SlideContextController } from "./slide-context.controller";
import { SlideContextService } from "./slide-context.service";

@Module({
  imports: [TypeOrmModule.forFeature([]), AuthModule, ProjectsModule],
  controllers: [SlideContextController],
  providers: [SlideContextService]
})
export class SlideContextModule {}
