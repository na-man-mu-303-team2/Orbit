import { loadOrbitConfig } from "@orbit/config";
import type { TypeOrmModuleOptions } from "@nestjs/typeorm";

export function workerDatabaseOptions(): TypeOrmModuleOptions {
  const config = loadOrbitConfig(process.env, { service: "worker" });

  return {
    type: "postgres",
    url: config.DATABASE_URL,
    entities: [],
    synchronize: false,
    logging: config.NODE_ENV === "development"
  };
}
