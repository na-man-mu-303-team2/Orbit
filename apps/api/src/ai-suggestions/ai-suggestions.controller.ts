import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { AiSuggestionsService } from "./ai-suggestions.service";

@Controller("api/v1/projects/:projectId/ai-suggestions")
export class AiSuggestionsController {
  constructor(private readonly aiSuggestionsService: AiSuggestionsService) {}

  @Get()
  list(
    @Param("projectId") projectId: string,
    @Query() query: Record<string, unknown>
  ) {
    return this.aiSuggestionsService.list(projectId, query);
  }

  @Post()
  create(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.aiSuggestionsService.create(projectId, body);
  }

  @Post(":suggestionId/apply")
  apply(
    @Param("projectId") projectId: string,
    @Param("suggestionId") suggestionId: string
  ) {
    return this.aiSuggestionsService.apply(projectId, suggestionId);
  }

  @Post(":suggestionId/reject")
  reject(
    @Param("projectId") projectId: string,
    @Param("suggestionId") suggestionId: string,
    @Body() body: unknown
  ) {
    return this.aiSuggestionsService.reject(projectId, suggestionId, body);
  }
}
