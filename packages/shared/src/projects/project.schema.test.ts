import { describe, expect, it } from "vitest";

import { projectAccessResponseSchema } from "./project.schema";

const project = {
  projectId: "project_1",
  workspaceId: "workspace_demo_1",
  title: "신뢰 경계",
  createdBy: "user_owner",
  createdAt: "2026-07-16T00:00:00.000Z",
};

describe("projectAccessResponseSchema", () => {
  it("accepted owner/editor/viewer membership을 검증한다", () => {
    for (const role of ["owner", "editor", "viewer"] as const) {
      expect(
        projectAccessResponseSchema.parse({
          project,
          membership: { role, status: "accepted" },
        }).membership,
      ).toEqual({ role, status: "accepted" });
    }
  });

  it("unknown role과 알 수 없는 응답 필드를 거부한다", () => {
    expect(
      projectAccessResponseSchema.safeParse({
        project,
        membership: { role: "commenter", status: "accepted" },
      }).success,
    ).toBe(false);
    expect(
      projectAccessResponseSchema.safeParse({
        project,
        membership: null,
        effectiveRole: "owner",
      }).success,
    ).toBe(false);
  });
});
