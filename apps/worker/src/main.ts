import { loadOrbitConfig } from "@orbit/config";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  loadOrbitConfig(process.env, { service: "worker" });
  await NestFactory.createApplicationContext(WorkerModule);
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
