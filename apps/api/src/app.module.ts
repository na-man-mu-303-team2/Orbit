import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { AiTemplateDeckGenerationModule } from "./ai-template-deck-generation/ai-template-deck-generation.module";
import { DecksModule } from "./decks/decks.module";
import { DesignAgentModule } from "./design-agent/design-agent.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { createApiLoggerParams } from "./logging";
import { databaseOptions } from "./database/data-source";
import { ExtractModule } from "./extract/extract.module";
import { GenerateDeckModule } from "./generate-deck/generate-deck.module";
import { PptxOoxmlGenerationsModule } from "./pptx-ooxml-generations/pptx-ooxml-generations.module";
import { PptxImportsModule } from "./pptx-imports/pptx-imports.module";
import { ProjectsModule } from "./projects/projects.module";
import { PresentationSessionsModule } from "./presentation-sessions/presentation-sessions.module";
import { PptAdvisorModule } from "./ppt-advisor/ppt-advisor.module";
import { ReferencesModule } from "./references/references.module";
import { RealtimeGateway } from "./realtime/realtime.gateway";
import { RealtimeTranscriptionModule } from "./realtime-transcription/realtime-transcription.module";
import { RehearsalsModule } from "./rehearsals/rehearsals.module";
import { RuntimeConfigModule } from "./runtime-config/runtime-config.module";
import { EvaluatorLensesModule } from "./evaluator-lenses/evaluator-lenses.module";
import { PresentationBriefsModule } from "./presentation-briefs/presentation-briefs.module";

@Module({
  imports: [
    LoggerModule.forRoot(createApiLoggerParams()),
    TypeOrmModule.forRoot(databaseOptions),
    AiTemplateDeckGenerationModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    DecksModule,
    DesignAgentModule,
    FilesModule,
    ExtractModule,
    GenerateDeckModule,
    PptxOoxmlGenerationsModule,
    PptxImportsModule,
    JobsModule,
    PresentationSessionsModule,
    PptAdvisorModule,
    ReferencesModule,
    RuntimeConfigModule,
    RealtimeTranscriptionModule,
    RehearsalsModule,
    EvaluatorLensesModule,
    PresentationBriefsModule
  ],
  providers: [RealtimeGateway]
})
export class AppModule {}
