import { loadOrbitConfig } from "@orbit/config";
import type { TypeOrmModuleOptions } from "@nestjs/typeorm";

export const workerDatabaseLogging: TypeOrmModuleOptions["logging"] = false;

export function workerDatabaseOptions(): TypeOrmModuleOptions {
  const config = loadOrbitConfig(process.env, { service: "worker" });

  return {
    type: "postgres",
    url: config.DATABASE_URL,
    entities: [],
    synchronize: false,
    logging: workerDatabaseLogging
  };
}
