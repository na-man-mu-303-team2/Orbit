import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RehearsalsService } from "./rehearsals.service";

@Controller()
export class RehearsalsController {
  constructor(private readonly rehearsalsService: RehearsalsService) {}

  @Post("api/v1/projects/:projectId/rehearsals")
  createRun(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.rehearsalsService.createRun(projectId, body);
  }

  @Post("api/v1/rehearsals/:runId/audio/upload-url")
  createAudioUploadUrl(
    @Param("runId") runId: string,
    @Body() body: unknown
  ) {
    return this.rehearsalsService.createAudioUploadUrl(runId, body);
  }

  @Post("api/v1/rehearsals/:runId/audio/complete")
  completeAudioUpload(@Param("runId") runId: string, @Body() body: unknown) {
    return this.rehearsalsService.completeAudioUpload(runId, body);
  }

  @Get("api/v1/rehearsals/:runId")
  getRun(@Param("runId") runId: string) {
    return this.rehearsalsService.getRun(runId);
  }
}
