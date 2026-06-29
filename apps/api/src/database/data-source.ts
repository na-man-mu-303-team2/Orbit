import { loadOrbitConfig } from "@orbit/config";
import { config as loadDotenv } from "dotenv";
import { DataSource, DataSourceOptions } from "typeorm";
import { AiSuggestionEntity } from "../ai-suggestions/ai-suggestion.entity";
import { ProjectAssetEntity } from "../files/project-asset.entity";
import { ProjectMemberEntity } from "../projects/project-member.entity";
import { ProjectEntity } from "../projects/project.entity";
import { RehearsalRunEntity } from "../rehearsals/rehearsal-run.entity";
import { CreateDeckPersistenceTables2026062701000 } from "./migrations/2026062701000-CreateDeckPersistenceTables";
import { CreateAuthUsers2026062702000 } from "./migrations/2026062702000-CreateAuthUsers";
import { CreateMigrationCommandCheck2026062700000 } from "./migrations/2026062700000-CreateMigrationCommandCheck";
import { CreateJobs2026062700200 } from "./migrations/2026062700200-CreateJobs";
import { CreateProjectsAndProjectAssets2026062703000 } from "./migrations/2026062703000-CreateProjectsAndProjectAssets";
import { CreateReferenceChunks2026062700100 } from "./migrations/2026062700100-CreateReferenceChunks";
import { CreateRehearsalRuns2026062901000 } from "./migrations/2026062901000-CreateRehearsalRuns";
import { CreateAiSuggestions2026062902000 } from "./migrations/2026062902000-CreateAiSuggestions";
import { CreateProjectMembers2026062902000 } from "./migrations/2026062902000-CreateProjectMembers";
import { AddProjectMemberStatus2026062903000 } from "./migrations/2026062903000-AddProjectMemberStatus";
import { AddUniqueAcceptedProjectOwner2026062904000 } from "./migrations/2026062904000-AddUniqueAcceptedProjectOwner";

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
    CreateProjectMembers2026062902000,
    AddProjectMemberStatus2026062903000,
    AddUniqueAcceptedProjectOwner2026062904000,
  ],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: config.NODE_ENV === "development"
};

export default new DataSource(databaseOptions);
