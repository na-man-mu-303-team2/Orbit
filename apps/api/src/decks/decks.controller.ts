import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { DecksService } from "./decks.service";

@Controller("v1/projects/:projectId")
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Get("deck")
  getDeck(@Param("projectId") projectId: string) {
    return this.decksService.getDeck(projectId);
  }

  @Put("deck")
  putDeck(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.decksService.putDeck(projectId, body);
  }

  @Post("deck/patches")
  appendPatch(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.decksService.appendPatch(projectId, body);
  }

  @Get("snapshots")
  listSnapshots(@Param("projectId") projectId: string) {
    return this.decksService.listSnapshots(projectId);
  }

  @Post("snapshots/:snapshotId/restore")
  restoreSnapshot(
    @Param("projectId") projectId: string,
    @Param("snapshotId") snapshotId: string
  ) {
    return this.decksService.restoreSnapshot(projectId, snapshotId);
  }
}
