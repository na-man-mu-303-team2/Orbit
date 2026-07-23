import { loadOrbitConfig } from "@orbit/config";
import {
  LocalMinioStorage,
  PurposeRoutingStorage,
  S3Storage,
  type StoragePort,
} from "@orbit/storage";

export function workerStorage(): StoragePort {
  const config = loadOrbitConfig(process.env, { service: "worker" });
  const workerReadEndpoint = config.S3_ENDPOINT ?? config.S3_PUBLIC_ENDPOINT;

  if (config.STORAGE_DRIVER === "s3") {
    const createStorage = (bucket: string): StoragePort => new S3Storage({
      endpoint: config.S3_ENDPOINT,
      publicEndpoint: workerReadEndpoint,
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
    publicEndpoint: workerReadEndpoint,
    bucket: config.S3_BUCKET,
    region: config.S3_REGION,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  });
  return new PurposeRoutingStorage(local, local);
}
