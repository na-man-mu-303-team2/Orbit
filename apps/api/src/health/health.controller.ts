import { demoIds } from "@orbit/shared";
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      status: "ok",
      app: "orbit-api",
      demo: demoIds
    };
  }

  @Get("readiness")
  readiness() {
    return {
      status: "ready",
      dependencies: {
        postgres: "configured",
        redis: "configured",
        minio: "configured"
      }
    };
  }
}

