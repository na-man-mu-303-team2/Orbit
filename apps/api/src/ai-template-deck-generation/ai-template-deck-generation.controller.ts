import { Body, Controller, Param, Post } from "@nestjs/common";
import { AiTemplateDeckGenerationService } from "./ai-template-deck-generation.service";

@Controller("api/v1/projects/:projectId/jobs")
export class AiTemplateDeckGenerationController {
  constructor(
    private readonly aiTemplateDeckGenerationService: AiTemplateDeckGenerationService,
  ) {}

  @Post("ai-template-deck-generation")
  createJob(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.aiTemplateDeckGenerationService.createJob(projectId, body);
  }
}
