import { loadOrbitConfig } from "@orbit/config";
import { config as loadDotenv } from "dotenv";
import { DataSource, DataSourceOptions } from "typeorm";
import { AiSuggestionEntity } from "../ai-suggestions/ai-suggestion.entity";
import { ProjectAssetEntity } from "../files/project-asset.entity";
import { ProjectEntity } from "../projects/project.entity";
import { ProjectMemberEntity } from "../projects/project-member.entity";
import { RehearsalRunEntity } from "../rehearsals/rehearsal-run.entity";
import { CreateDeckPersistenceTables2026062701000 } from "./migrations/2026062701000-CreateDeckPersistenceTables";
import { CreateAuthUsers2026062702000 } from "./migrations/2026062702000-CreateAuthUsers";
import { CreateMigrationCommandCheck2026062700000 } from "./migrations/2026062700000-CreateMigrationCommandCheck";
import { CreateJobs2026062700200 } from "./migrations/2026062700200-CreateJobs";
import { CreateProjectsAndProjectAssets2026062703000 } from "./migrations/2026062703000-CreateProjectsAndProjectAssets";
import { CreateReferenceChunks2026062700100 } from "./migrations/2026062700100-CreateReferenceChunks";
import { CreateRehearsalRuns2026062901000 } from "./migrations/2026062901000-CreateRehearsalRuns";
import { CreateAiSuggestions2026062902000 } from "./migrations/2026062902000-CreateAiSuggestions";
import { AddRehearsalReportColumns2026062903000 } from "./migrations/2026062903000-AddRehearsalReportColumns";
import { CreateProjectMembers2026063001000 } from "./migrations/2026063001000-CreateProjectMembers";
import { CreatePresentationSessions2026070201000 } from "./migrations/2026070201000-CreatePresentationSessions";
import { AddUniqueOpenPresentationSession2026070202000 } from "./migrations/2026070202000-AddUniqueOpenPresentationSession";
import { AddRehearsalRunMetaJson2026070301000 } from "./migrations/2026070301000-AddRehearsalRunMetaJson";
import { CreateTemplateBlueprints2026070301000 } from "./migrations/2026070301000-CreateTemplateBlueprints";
import { EnsureAudienceSessionTables2026070401000 } from "./migrations/2026070401000-EnsureAudienceSessionTables";
import { CreateAudienceInteractions2026070501000 } from "./migrations/2026070501000-CreateAudienceInteractions";
import { CreateAudienceQuestions2026070502000 } from "./migrations/2026070502000-CreateAudienceQuestions";
import { CreateAudienceQuestionAnswers2026070503000 } from "./migrations/2026070503000-CreateAudienceQuestionAnswers";
import { CreateSessionSurveys2026070504000 } from "./migrations/2026070504000-CreateSessionSurveys";
import { CreateAudienceAggregateReports2026070505000 } from "./migrations/2026070505000-CreateAudienceAggregateReports";
import { AddAudienceManualResultExposure2026070506000 } from "./migrations/2026070506000-AddAudienceManualResultExposure";
import { AddAudienceSlideSnapshots2026070507000 } from "./migrations/2026070507000-AddAudienceSlideSnapshots";
import { RepairPresentationSessionsContract2026070601000 } from "./migrations/2026070601000-RepairPresentationSessionsContract";
import { CreateProjectRehearsalSummaries2026070801000 } from "./migrations/2026070801000-CreateProjectRehearsalSummaries";
import { ReplaceRehearsalSummaryWithProjectComment2026070802000 } from "./migrations/2026070802000-ReplaceRehearsalSummaryWithProjectComment";

loadDotenv({ path: "../../.env.local" });
loadDotenv({ path: ".env.local" });
loadDotenv();

const config = loadOrbitConfig(process.env, { service: "api" });

export const databaseOptions: DataSourceOptions = {
  type: "postgres",
  url: config.DATABASE_URL,
  entities: [
    ProjectEntity,
    ProjectMemberEntity,
    ProjectAssetEntity,
    RehearsalRunEntity,
    AiSuggestionEntity
  ],
  migrations: [
    CreateMigrationCommandCheck2026062700000,
    CreateJobs2026062700200,
    CreateReferenceChunks2026062700100,
    CreateDeckPersistenceTables2026062701000,
    CreateAuthUsers2026062702000,
    CreateProjectsAndProjectAssets2026062703000,
    CreateRehearsalRuns2026062901000,
    CreateAiSuggestions2026062902000,
    AddRehearsalReportColumns2026062903000,
    CreateProjectMembers2026063001000,
    CreatePresentationSessions2026070201000,
    AddUniqueOpenPresentationSession2026070202000,
    AddRehearsalRunMetaJson2026070301000,
    CreateTemplateBlueprints2026070301000,
    EnsureAudienceSessionTables2026070401000,
    CreateAudienceInteractions2026070501000,
    CreateAudienceQuestions2026070502000,
    CreateAudienceQuestionAnswers2026070503000,
    CreateSessionSurveys2026070504000,
    CreateAudienceAggregateReports2026070505000,
    AddAudienceManualResultExposure2026070506000,
    AddAudienceSlideSnapshots2026070507000,
    RepairPresentationSessionsContract2026070601000,
    CreateProjectRehearsalSummaries2026070801000,
    ReplaceRehearsalSummaryWithProjectComment2026070802000,
  ],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: config.NODE_ENV === "development"
};

export default new DataSource(databaseOptions);
