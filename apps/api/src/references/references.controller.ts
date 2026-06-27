import { Body, Controller, Param, Post } from "@nestjs/common";
import { referenceSearchRequestSchema } from "./references.schema";
import { ReferencesService } from "./references.service";

@Controller("projects/:projectId/references")
export class ReferencesController {
  constructor(private readonly referencesService: ReferencesService) {}

  @Post("search")
  searchReferences(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.referencesService.search(
      projectId,
      referenceSearchRequestSchema.parse(body)
    );
  }
}
