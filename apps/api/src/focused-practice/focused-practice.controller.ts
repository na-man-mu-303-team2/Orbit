import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { RequiresAsyncJobAdmission } from "../common/async-job-admission.guard";
import { FocusedPracticeService } from "./focused-practice.service";

@Controller()
export class FocusedPracticeController {
  constructor(private readonly auth: AuthService, private readonly focused: FocusedPracticeService) {}

  @Post("api/v1/projects/:projectId/focused-practice-sessions")
  async create(@Param("projectId") projectId: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req);
    return this.focused.createSession(projectId, user.userId, body);
  }
  @Get("api/v1/projects/:projectId/focused-practice-summary")
  async summary(
    @Param("projectId") projectId: string,
    @Query("sourceFullRunId") sourceFullRunId: string,
    @Req() req: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.auth, req);
    return this.focused.getAttemptSummary(projectId, sourceFullRunId, user.userId);
  }
  @Get("api/v1/focused-practice-sessions/:sessionId")
  async get(@Param("sessionId") id: string, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.focused.getSession(id, user.userId);
  }
  @Post("api/v1/focused-practice-sessions/:sessionId/attempts")
  async attempt(@Param("sessionId") id: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.focused.createAttempt(id, user.userId, body);
  }
  @Post("api/v1/focused-practice-attempts/:attemptId/audio/complete")
  @RequiresAsyncJobAdmission()
  async completeAttempt(@Param("attemptId") id: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.focused.completeAttempt(id, user.userId, body);
  }
  @Post("api/v1/focused-practice-sessions/:sessionId/complete")
  async complete(@Param("sessionId") id: string, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.focused.finishSession(id, user.userId, "completed");
  }
  @Post("api/v1/focused-practice-sessions/:sessionId/cancel")
  async cancel(@Param("sessionId") id: string, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.focused.finishSession(id, user.userId, "cancelled");
  }
}
