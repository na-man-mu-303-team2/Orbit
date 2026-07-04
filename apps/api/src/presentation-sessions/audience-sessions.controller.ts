import { Controller, Get, Param } from "@nestjs/common";
import {
  audienceJoinCodeParamsSchema,
  audienceSessionLookupResponseSchema,
} from "@orbit/shared";
import { PresentationSessionsService } from "./presentation-sessions.service";

@Controller("api/v1/presentation-sessions")
export class AudienceSessionsController {
  constructor(
    private readonly presentationSessionsService: PresentationSessionsService,
  ) {}

  @Get("join/:joinCode")
  async getJoinSession(@Param("joinCode") joinCode: string) {
    const params = audienceJoinCodeParamsSchema.parse({ joinCode });
    const session =
      await this.presentationSessionsService.getActiveSessionByJoinCode(
        params.joinCode,
      );

    return audienceSessionLookupResponseSchema.parse({ session });
  }
}
