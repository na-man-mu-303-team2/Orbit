import {
  OpenAiGeneratedImageProvider,
  OpenversePublicImageSearchProvider
} from "@orbit/ai";
import type { OrbitConfig } from "@orbit/config";
import type { ImageAssetRuntime } from "./image-asset-pipeline";

export function createImageAssetRuntime(config: OrbitConfig): ImageAssetRuntime {
  return {
    generated:
      config.IMAGE_PROVIDER === "openai" && config.OPENAI_API_KEY
        ? new OpenAiGeneratedImageProvider(
            config.OPENAI_API_KEY,
            config.OPENAI_IMAGE_MODEL
          )
        : undefined,
    publicSearch:
      config.PUBLIC_IMAGE_PROVIDER === "openverse"
        ? new OpenversePublicImageSearchProvider()
        : undefined,
    maxPerDeck: config.IMAGE_MAX_PER_DECK,
    maxPerUserPerDay: config.IMAGE_MAX_PER_USER_PER_DAY,
    maxPerOrganizationPerDay: config.IMAGE_MAX_PER_ORGANIZATION_PER_DAY
  };
}
