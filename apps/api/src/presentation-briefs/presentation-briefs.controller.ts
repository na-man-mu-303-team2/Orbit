import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";

import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { PresentationBriefsService } from "./presentation-briefs.service";

@Controller("api/v1/projects/:projectId/presentation-brief")
export class PresentationBriefsController {
  constructor(
    private readonly auth: AuthService,
    private readonly briefs: PresentationBriefsService,
  ) {}

  @Get()
  async get(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.auth, request);
    return this.briefs.get(projectId, user.userId);
  }

  @Put()
  async put(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.auth, request);
    return this.briefs.put(projectId, user.userId, body);
  }
}

