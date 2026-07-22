import { describe, expect, it } from "vitest";

import {
  projectAccessResponseSchema,
  projectApiErrorSchema,
  projectListResponseSchema,
  updateProjectPinRequestSchema,
} from "./project.schema";

describe("project pin contracts", () => {
  it("requires a user-specific pin state in project list items", () => {
    expect(
      projectListResponseSchema.parse([
        {
          projectId: "project_1",
          workspaceId: "workspace_1",
          title: "Pinned deck",
          createdBy: "user_1",
          createdAt: "2026-07-18T00:00:00.000Z",
          generation: null,
          isPinned: true,
          pinnedAt: "2026-07-20T00:00:00.000Z",
          tags: [],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        generation: null,
        isPinned: true,
        pinnedAt: "2026-07-20T00:00:00.000Z",
        tags: [],
      }),
    ]);
  });

  it("identifies active PPTX conversion progress in project list items", () => {
    const [project] = projectListResponseSchema.parse([
      {
        projectId: "project_pptx",
        workspaceId: "workspace_1",
        title: "2026 하반기 제품 전략",
        createdBy: "user_1",
        createdAt: "2026-07-22T00:00:00.000Z",
        generation: {
          jobId: "job_pptx",
          type: "pptx-ooxml-generation",
          status: "running",
          progress: 78,
          message: "발표자 노트와 레이아웃을 정리하고 있습니다.",
        },
        isPinned: false,
        pinnedAt: null,
        tags: [],
      },
    ]);

    expect(project?.generation).toMatchObject({
      type: "pptx-ooxml-generation",
      progress: 78,
    });
  });

  it("rejects non-boolean project pin updates", () => {
    expect(updateProjectPinRequestSchema.safeParse({ isPinned: "true" }).success).toBe(
      false,
    );
  });
});

describe("project access contracts", () => {
  it("validates accepted membership responses", () => {
    expect(
      projectAccessResponseSchema.parse({
        project: {
          projectId: "project_1",
          workspaceId: "workspace_1",
          title: "Shared deck",
          createdBy: "user_1",
          createdAt: "2026-07-18T00:00:00.000Z",
        },
        membership: { role: "editor", status: "accepted" },
      }),
    ).toMatchObject({ membership: { role: "editor", status: "accepted" } });
  });

  it("requires structured project API failures", () => {
    expect(
      projectApiErrorSchema.parse({
        code: "PROJECT_ACCESS_UNAVAILABLE",
        message: "프로젝트 권한 정보를 불러오지 못했습니다.",
        details: [],
      }),
    ).toEqual({
      code: "PROJECT_ACCESS_UNAVAILABLE",
      message: "프로젝트 권한 정보를 불러오지 못했습니다.",
      details: [],
    });
  });
});
