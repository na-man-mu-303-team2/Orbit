import { loadOrbitConfig } from "@orbit/config";
import { LocalMinioStorage, S3Storage } from "@orbit/storage";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { FilesController } from "./files.controller";
import { ProjectAssetEntity } from "./project-asset.entity";
import {
  FilesService,
  STORAGE_PORT,
  UPLOAD_PROXY_ORIGIN,
} from "./files.service";

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ProjectAssetEntity]), ProjectsModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: UPLOAD_PROXY_ORIGIN,
      useFactory: () => {
        const config = loadOrbitConfig(process.env, { service: "api" });
        return config.STORAGE_DRIVER === "minio" ? config.WEB_ORIGIN : null;
      },
    },
    {
      provide: STORAGE_PORT,
      useFactory: () => {
        const config = loadOrbitConfig(process.env, { service: "api" });

        if (config.STORAGE_DRIVER === "s3") {
          return new S3Storage({
            endpoint: config.S3_ENDPOINT,
            publicEndpoint: config.S3_PUBLIC_ENDPOINT,
            bucket: config.S3_BUCKET,
            region: config.S3_REGION,
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
          });
        }

        return new LocalMinioStorage({
          endpoint: config.S3_ENDPOINT,
          publicEndpoint: config.S3_PUBLIC_ENDPOINT,
          bucket: config.S3_BUCKET,
          region: config.S3_REGION,
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        });
      },
    },
  ],
  exports: [FilesService, STORAGE_PORT],
})
export class FilesModule {}
