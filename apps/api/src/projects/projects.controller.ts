import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createProjectRequestSchema } from "@orbit/shared";
import { parseRequest } from "../common/zod-request";
import { ProjectsService } from "./projects.service";

@Controller("api/v1/workspaces/:workspaceId/projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  listProjects(@Param("workspaceId") workspaceId: string) {
    return this.projectsService.list(workspaceId);
  }

  @Post()
  createProject(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.projectsService.create(
      workspaceId,
      parseRequest(createProjectRequestSchema, body ?? {}),
    );
  }
}
