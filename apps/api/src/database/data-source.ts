import { loadOrbitConfig } from "@orbit/config";
import { config as loadDotenv } from "dotenv";
import { DataSource, DataSourceOptions } from "typeorm";
import { ProjectAssetEntity } from "../files/project-asset.entity";
import { ProjectEntity } from "../projects/project.entity";
import { RehearsalRunEntity } from "../rehearsals/rehearsal-run.entity";
import { WorkspaceEntity } from "../workspaces/workspace.entity";
import { WorkspaceInviteEntity } from "../workspaces/workspace-invite.entity";
import { WorkspaceMemberEntity } from "../workspaces/workspace-member.entity";
import { CreateDeckPersistenceTables2026062701000 } from "./migrations/2026062701000-CreateDeckPersistenceTables";
import { CreateAuthUsers2026062702000 } from "./migrations/2026062702000-CreateAuthUsers";
import { CreateMigrationCommandCheck2026062700000 } from "./migrations/2026062700000-CreateMigrationCommandCheck";
import { CreateJobs2026062700200 } from "./migrations/2026062700200-CreateJobs";
import { CreateProjectsAndProjectAssets2026062703000 } from "./migrations/2026062703000-CreateProjectsAndProjectAssets";
import { CreateReferenceChunks2026062700100 } from "./migrations/2026062700100-CreateReferenceChunks";
import { CreateRehearsalRuns2026062901000 } from "./migrations/2026062901000-CreateRehearsalRuns";
import { CreateWorkspaceInvites2026062902000 } from "./migrations/2026062902000-CreateWorkspaceInvites";

loadDotenv({ path: "../../.env.local" });
loadDotenv({ path: ".env.local" });
loadDotenv();

const config = loadOrbitConfig(process.env, { service: "api" });

export const databaseOptions: DataSourceOptions = {
  type: "postgres",
  url: config.DATABASE_URL,
  entities: [
    ProjectEntity,
    ProjectAssetEntity,
    RehearsalRunEntity,
    WorkspaceEntity,
    WorkspaceMemberEntity,
    WorkspaceInviteEntity,
  ],
  migrations: [
    CreateMigrationCommandCheck2026062700000,
    CreateJobs2026062700200,
    CreateReferenceChunks2026062700100,
    CreateDeckPersistenceTables2026062701000,
    CreateAuthUsers2026062702000,
    CreateProjectsAndProjectAssets2026062703000,
    CreateRehearsalRuns2026062901000,
    CreateWorkspaceInvites2026062902000,
  ],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: config.NODE_ENV === "development",
};

export default new DataSource(databaseOptions);
