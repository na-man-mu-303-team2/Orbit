import { Body, Controller, Param, Post } from "@nestjs/common";
import { ImportPptxService } from "./import-pptx.service";

@Controller("api/v1/projects/:projectId/jobs")
export class ImportPptxController {
  constructor(private readonly importPptxService: ImportPptxService) {}

  @Post("import-pptx")
  createJob(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.importPptxService.createJob(projectId, body);
  }
}
