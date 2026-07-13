import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { ChallengeQnaService } from "./challenge-qna.service";

@Controller()
export class ChallengeQnaController {
  constructor(private readonly auth: AuthService, private readonly qna: ChallengeQnaService) {}

  @Post("api/v1/projects/:projectId/challenge-qna-sessions")
  async create(@Param("projectId") projectId: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.createSession(projectId, user.userId, body);
  }
  @Get("api/v1/challenge-qna-sessions/:sessionId")
  async get(@Param("sessionId") id: string, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.getSession(id, user.userId);
  }
  @Post("api/v1/challenge-qna-sessions/:sessionId/retry")
  async retry(@Param("sessionId") id: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.retryGeneration(id, user.userId, body);
  }
  @Post("api/v1/challenge-qna-sessions/:sessionId/questions/:questionId/assistance")
  async reveal(@Param("sessionId") sessionId: string, @Param("questionId") questionId: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.revealAssistance(sessionId, questionId, user.userId, body);
  }
  @Post("api/v1/challenge-qna-sessions/:sessionId/questions/:questionId/answers")
  async answer(@Param("sessionId") sessionId: string, @Param("questionId") questionId: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.createAnswer(sessionId, questionId, user.userId, body);
  }
  @Post("api/v1/challenge-qna-answer-attempts/:attemptId/audio/complete")
  async completeAudio(@Param("attemptId") attemptId: string, @Body() body: unknown, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.completeAudio(attemptId, user.userId, body);
  }
  @Post("api/v1/challenge-qna-sessions/:sessionId/advance")
  async advance(@Param("sessionId") id: string, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.advance(id, user.userId);
  }
  @Post("api/v1/challenge-qna-sessions/:sessionId/cancel")
  async cancel(@Param("sessionId") id: string, @Req() req: SignedCookieRequest) {
    const user = await getCurrentUser(this.auth, req); return this.qna.cancel(id, user.userId);
  }
}
