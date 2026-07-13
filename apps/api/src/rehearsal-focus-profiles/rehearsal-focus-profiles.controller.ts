import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";

import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { RehearsalFocusProfilesService } from "./rehearsal-focus-profiles.service";

@Controller("api/v1/projects/:projectId/rehearsal-focus-profile")
export class RehearsalFocusProfilesController {
  constructor(
    private readonly auth: AuthService,
    private readonly focusProfiles: RehearsalFocusProfilesService,
  ) {}

  @Get()
  async get(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.auth, request);
    return this.focusProfiles.get(projectId, user.userId);
  }

  @Put()
  async put(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.auth, request);
    return this.focusProfiles.put(projectId, user.userId, body);
  }
}
