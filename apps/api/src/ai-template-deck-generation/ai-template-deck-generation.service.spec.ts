import { GoneException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AiTemplateDeckGenerationService } from "./ai-template-deck-generation.service";

describe("AiTemplateDeckGenerationService", () => {
  it("blocks legacy AI template deck generation", async () => {
    const service = new AiTemplateDeckGenerationService();

    await expect(
      service.createJob("project-a", { topic: "ORBIT" })
    ).rejects.toBeInstanceOf(GoneException);
  });
});
