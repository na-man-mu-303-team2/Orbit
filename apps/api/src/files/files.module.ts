import { loadOrbitConfig } from "@orbit/config";
import {
  LocalMinioStorage,
  PurposeRoutedStorage,
  S3Storage,
  type StoragePort,
} from "@orbit/storage";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { FilesController } from "./files.controller";
import { ProjectAssetEntity } from "./project-asset.entity";
import {
  FilesService,
  PRIVATE_AUDIO_STORAGE_ENABLED,
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
      provide: PRIVATE_AUDIO_STORAGE_ENABLED,
      useFactory: () =>
        loadOrbitConfig(process.env, { service: "api" })
          .PRIVATE_AUDIO_STORAGE_ENABLED,
    },
    {
      provide: STORAGE_PORT,
      useFactory: () => {
        const config = loadOrbitConfig(process.env, { service: "api" });
        const storageForBucket = (bucket: string): StoragePort => {
          if (config.STORAGE_DRIVER === "s3") {
            return new S3Storage({
              endpoint: config.S3_ENDPOINT,
              publicEndpoint: config.S3_PUBLIC_ENDPOINT,
              bucket,
              region: config.S3_REGION,
              accessKeyId: config.AWS_ACCESS_KEY_ID,
              secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
              forcePathStyle: config.S3_FORCE_PATH_STYLE,
            });
          }

          return new LocalMinioStorage({
            endpoint: config.S3_ENDPOINT,
            publicEndpoint: config.S3_PUBLIC_ENDPOINT,
            bucket,
            region: config.S3_REGION,
            accessKeyId: config.S3_ACCESS_KEY_ID,
            secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
          });
        };

        const projectAssets = storageForBucket(config.S3_BUCKET);
        const privateAudio = config.S3_PRIVATE_AUDIO_BUCKET
          ? storageForBucket(config.S3_PRIVATE_AUDIO_BUCKET)
          : projectAssets;

        return new PurposeRoutedStorage({
          projectAssets,
          privateAudio,
          privateAudioWritesEnabled: config.PRIVATE_AUDIO_STORAGE_ENABLED,
        });
      },
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
