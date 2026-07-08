import { loadOrbitConfig } from "@orbit/config";
import { runtimeConfigResponseSchema } from "@orbit/shared";
import { Controller, Get } from "@nestjs/common";

@Controller("api/v1/runtime-config")
export class RuntimeConfigController {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  @Get()
  getRuntimeConfig() {
    return runtimeConfigResponseSchema.parse({
      liveSttEngine: this.config.LIVE_STT_ENGINE
    });
  }
}
