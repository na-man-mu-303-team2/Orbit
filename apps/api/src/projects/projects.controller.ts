import { Body, Controller, Get, Post } from "@nestjs/common";
import { z } from "zod";
import { ProjectsService } from "./projects.service";

const createProjectSchema = z.object({
  title: z.string().min(1).optional()
});

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  listProjects() {
    return this.projectsService.list();
  }

  @Post()
  createProject(@Body() body: unknown) {
    return this.projectsService.create(createProjectSchema.parse(body ?? {}));
  }
}

