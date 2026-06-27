import { loadOrbitConfig } from "@orbit/config";
import { LocalMinioStorage, S3Storage } from "@orbit/storage";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProjectsModule } from "../projects/projects.module";
import { FilesController } from "./files.controller";
import { ProjectAssetEntity } from "./project-asset.entity";
import { FilesService, STORAGE_PORT } from "./files.service";

@Module({
  imports: [TypeOrmModule.forFeature([ProjectAssetEntity]), ProjectsModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: STORAGE_PORT,
      useFactory: () => {
        const config = loadOrbitConfig(process.env, { service: "api" });

        if (config.STORAGE_DRIVER === "s3") {
          return new S3Storage();
        }

        return new LocalMinioStorage(
          config.S3_PUBLIC_ENDPOINT,
          config.S3_BUCKET,
        );
      },
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
