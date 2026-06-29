import { BadRequestException } from "@nestjs/common";
import { demoIds } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

describe("ProjectsController", () => {
  it("turns an invalid create payload into a bad request", () => {
    const controller = new ProjectsController({
      create: vi.fn(),
      list: vi.fn(),
    } as unknown as ProjectsService);

    expect(() =>
      controller.createProject(demoIds.workspaceId, { title: "" }),
    ).toThrow(BadRequestException);
  });
});
