import { loadOrbitConfig } from "@orbit/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { writeBootstrapError } from "./logging";

async function bootstrap() {
  const config = loadOrbitConfig(process.env, { service: "api" });
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());
  app.use(cookieParser(config.COOKIE_SECRET));

  app.enableCors({
    credentials: true,
    origin: config.WEB_ORIGIN
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("ORBIT API")
    .setDescription("ORBIT local-first platform API")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen(config.API_PORT, "0.0.0.0");
  logger.log(
    {
      event: "api.ready",
      port: config.API_PORT,
      webOrigin: config.WEB_ORIGIN
    },
    "API ready."
  );
}

void bootstrap().catch((error: unknown) => {
  writeBootstrapError("api", error);
  process.exit(1);
});
