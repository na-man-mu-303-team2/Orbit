import { loadOrbitConfig } from "@orbit/config";
import {
  LocalMinioStorage,
  PurposeRoutingStorage,
  S3Storage,
  type StoragePort,
} from "@orbit/storage";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { FilesController } from "./files.controller";
import { ProfileAvatarController } from "./profile-avatar.controller";
import { ProfileAvatarService } from "./profile-avatar.service";
import { ProjectAssetEntity } from "./project-asset.entity";
import {
  FilesService,
  STORAGE_PORT,
  UPLOAD_PROXY_ORIGIN,
} from "./files.service";

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ProjectAssetEntity]), ProjectsModule],
  controllers: [FilesController, ProfileAvatarController],
  providers: [
    FilesService,
    ProfileAvatarService,
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
          const createStorage = (bucket: string): StoragePort => new S3Storage({
            endpoint: config.S3_ENDPOINT,
            publicEndpoint: config.S3_PUBLIC_ENDPOINT,
            bucket,
            region: config.S3_REGION,
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
          });
          const assets = createStorage(config.S3_ASSETS_BUCKET ?? config.S3_BUCKET);
          const privateAudio = config.S3_PRIVATE_AUDIO_BUCKET
            ? createStorage(config.S3_PRIVATE_AUDIO_BUCKET)
            : assets;
          return new PurposeRoutingStorage(assets, privateAudio);
        }

        const local = new LocalMinioStorage({
          endpoint: config.S3_ENDPOINT,
          publicEndpoint: config.S3_PUBLIC_ENDPOINT,
          bucket: config.S3_BUCKET,
          region: config.S3_REGION,
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        });
        return new PurposeRoutingStorage(local, local);
      },
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
