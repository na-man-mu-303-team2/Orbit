import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { DecksModule } from "./decks/decks.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { databaseOptions } from "./database/data-source";
import { ProjectsModule } from "./projects/projects.module";
import { RealtimeGateway } from "./realtime/realtime.gateway";

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions),
    AuthModule,
    HealthModule,
    ProjectsModule,
    DecksModule,
    FilesModule,
    JobsModule
  ],
  providers: [RealtimeGateway]
})
export class AppModule {}
