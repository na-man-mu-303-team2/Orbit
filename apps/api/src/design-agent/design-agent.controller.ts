import {
  createDesignAgentMessageRequestSchema,
  type CreateDesignAgentMessageRequest,
} from "@orbit/shared";
import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { parseRequest } from "../common/zod-request";
import { ProjectsService } from "../projects/projects.service";
import { DesignAgentService } from "./design-agent.service";

@Controller("api/v1/projects/:projectId/design-agent")
export class DesignAgentController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly designAgentService: DesignAgentService,
  ) {}

  @Post("messages")
  async createMessage(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    const input = parseRequest<CreateDesignAgentMessageRequest>(
      createDesignAgentMessageRequestSchema,
      body,
    );
    return this.designAgentService.createMessage(projectId, user.userId, input);
  }
}
