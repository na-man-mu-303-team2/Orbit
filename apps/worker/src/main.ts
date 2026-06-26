import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);
}

void bootstrap();

