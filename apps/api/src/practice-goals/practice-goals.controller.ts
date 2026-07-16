import { Controller, Get, Param, Query, Req } from "@nestjs/common";

import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { PracticeGoalsService } from "./practice-goals.service";

@Controller("api/v1/projects/:projectId/practice-plan")
export class PracticeGoalsController {
  constructor(
    private readonly auth: AuthService,
    private readonly practiceGoals: PracticeGoalsService,
  ) {}

  @Get()
  async getPlan(
    @Param("projectId") projectId: string,
    @Query("sourceFullRunId") sourceFullRunId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.auth, request);
    return this.practiceGoals.getPlan(projectId, sourceFullRunId, user.userId);
  }
}
