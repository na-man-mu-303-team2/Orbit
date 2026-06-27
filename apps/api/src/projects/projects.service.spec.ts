import { demoIds } from "@orbit/shared";
import { describe, expect, it } from "vitest";
import { ProjectsService } from "./projects.service";

describe("ORBIT-10 ProjectsService", () => {
  it("seeds the demo project for the first E2E project boundary", () => {
    const service = new ProjectsService();

    expect(service.list()).toEqual([
      expect.objectContaining({
        projectId: demoIds.projectId,
        workspaceId: demoIds.workspaceId,
        title: "ORBIT Demo Project",
        createdBy: demoIds.userId
      })
    ]);
  });

  it("creates a project with stable demo IDs and the requested title", () => {
    const service = new ProjectsService();

    const project = service.create({ title: "Jira smoke project" });

    expect(project).toEqual(
      expect.objectContaining({
        projectId: demoIds.projectId,
        workspaceId: demoIds.workspaceId,
        title: "Jira smoke project",
        createdBy: demoIds.userId
      })
    );
    expect(project.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(service.list()).toContainEqual(project);
  });
});
