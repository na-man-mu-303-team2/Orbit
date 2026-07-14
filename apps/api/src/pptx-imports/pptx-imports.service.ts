import { GoneException, Injectable } from "@nestjs/common";

@Injectable()
export class PptxImportsService {
  async createImport(
    _projectId: string,
    _body: unknown
  ): Promise<never> {
    throw new GoneException(
      "Legacy PPTX import creation is disabled. Use pptx-ooxml-generations."
    );
  }
}
