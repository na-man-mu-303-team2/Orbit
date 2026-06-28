import { Body, Controller, Param, Post } from "@nestjs/common";
import { GenerateDeckService } from "./generate-deck.service";

@Controller("api/v1/projects/:projectId/jobs")
export class GenerateDeckController {
  constructor(private readonly generateDeckService: GenerateDeckService) {}

  @Post("generate-deck")
  createJob(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.generateDeckService.createJob(projectId, body);
  }
}
