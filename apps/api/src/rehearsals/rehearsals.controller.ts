import { Body, Controller, Param, Post } from "@nestjs/common";
import { RehearsalsService } from "./rehearsals.service";

@Controller("api/v1/projects/:projectId/rehearsals")
export class RehearsalsController {
  constructor(private readonly rehearsalsService: RehearsalsService) {}

  @Post("stt")
  startStt(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.rehearsalsService.startStt(projectId, body);
  }
}
