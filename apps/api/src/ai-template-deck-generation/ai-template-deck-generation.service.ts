import { GoneException, Injectable } from "@nestjs/common";

@Injectable()
export class AiTemplateDeckGenerationService {
  async createJob(
    _projectId: string,
    _body: unknown,
  ): Promise<never> {
    throw new GoneException(
      "Legacy AI template deck generation is disabled. Use generate-deck."
    );
  }
}
