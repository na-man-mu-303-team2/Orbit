import { loadOrbitConfig } from "@orbit/config";
import { Controller, Get, Param, Req } from "@nestjs/common";

import {
  requireAudienceIdentity,
  type SignedCookieRequest
} from "../presentation-sessions/audience-request-security";
import { ActivityResultsService } from "./activity-results.service";

@Controller("api/v1/audience-sessions/:sessionId")
export class AudienceActiveActivityController {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(private readonly activityResultsService: ActivityResultsService) {}

  @Get("active-activity")
  getActiveActivity(
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest
  ) {
    const identity = requireAudienceIdentity(this.config, request, sessionId);
    return this.activityResultsService.getAudienceActiveActivity(
      identity.projectId,
      sessionId,
      identity.audienceId
    );
  }
}
