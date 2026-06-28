import { loadOrbitConfig } from "@orbit/config";
import { LocalMinioStorage, S3Storage, type StoragePort } from "@orbit/storage";

export function workerStorage(): StoragePort {
  const config = loadOrbitConfig(process.env, { service: "worker" });

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
}
