import { config as loadDotenv } from "dotenv";
import { DataSource, DataSourceOptions } from "typeorm";
import { InitialOrbitSchema2026062700000 } from "./migrations/2026062700000-InitialOrbitSchema";

loadDotenv({ path: "../../.env.local" });
loadDotenv({ path: ".env.local" });
loadDotenv();

export const databaseOptions: DataSourceOptions = {
  type: "postgres",
  url: process.env.DATABASE_URL ?? "postgres://orbit:orbit@localhost:5432/orbit",
  entities: [],
  migrations: [InitialOrbitSchema2026062700000],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: process.env.NODE_ENV === "development"
};

export default new DataSource(databaseOptions);
