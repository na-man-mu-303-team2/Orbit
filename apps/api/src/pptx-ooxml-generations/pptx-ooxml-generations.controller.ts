import { Body, Controller, Param, Post } from "@nestjs/common";
import { PptxOoxmlGenerationsService } from "./pptx-ooxml-generations.service";

@Controller("api/v1/projects/:projectId/pptx-ooxml-generations")
export class PptxOoxmlGenerationsController {
  constructor(
    private readonly pptxOoxmlGenerationsService: PptxOoxmlGenerationsService
  ) {}

  @Post()
  createGeneration(
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ) {
    return this.pptxOoxmlGenerationsService.createGeneration(projectId, body);
  }
}
