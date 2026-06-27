import { loadOrbitConfig } from "@orbit/config";
import { config as loadDotenv } from "dotenv";
import { DataSource, DataSourceOptions } from "typeorm";
import { InitialOrbitSchema2026062700000 } from "./migrations/2026062700000-InitialOrbitSchema";

loadDotenv({ path: "../../.env.local" });
loadDotenv({ path: ".env.local" });
loadDotenv();

const config = loadOrbitConfig(process.env, { service: "api" });

export const databaseOptions: DataSourceOptions = {
  type: "postgres",
  url: config.DATABASE_URL,
  entities: [],
  migrations: [InitialOrbitSchema2026062700000],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: config.NODE_ENV === "development"
};

export default new DataSource(databaseOptions);
