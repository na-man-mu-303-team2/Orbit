import { describe, expect, it } from "vitest";

import {
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
          isPinned: true,
        },
      ]),
    ).toEqual([expect.objectContaining({ isPinned: true })]);
  });

  it("rejects non-boolean project pin updates", () => {
    expect(updateProjectPinRequestSchema.safeParse({ isPinned: "true" }).success).toBe(
      false,
    );
  });
});
