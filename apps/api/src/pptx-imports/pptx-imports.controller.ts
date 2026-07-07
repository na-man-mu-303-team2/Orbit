import { Body, Controller, Param, Post } from "@nestjs/common";
import { PptxImportsService } from "./pptx-imports.service";

@Controller("api/v1/projects/:projectId/pptx-imports")
export class PptxImportsController {
  constructor(private readonly pptxImportsService: PptxImportsService) {}

  @Post()
  createImport(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.pptxImportsService.createImport(projectId, body);
  }
}
