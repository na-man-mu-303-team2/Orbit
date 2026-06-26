import { loadOrbitConfig } from "@orbit/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import "reflect-metadata";
import { AppModule } from "./app.module";

async function bootstrap() {
  const config = loadOrbitConfig();
  const app = await NestFactory.create(AppModule);

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

  await app.listen(Number(process.env.API_PORT ?? 3000), "0.0.0.0");
}

void bootstrap();

