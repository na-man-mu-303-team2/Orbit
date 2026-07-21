import { describe, expect, it, vi } from "vitest";

import {
  createCommunityTemplatePublishRequest,
  executeCommunityTemplatePublish,
  getFirstCommunityTemplatePublishErrorField,
} from "./communityTemplatePublish";

describe("community template publish", () => {
  it("returns accessible field errors in source, title, category, rights order", () => {
    const result = createCommunityTemplatePublishRequest({
      sourceProjectId: "",
      title: "",
      category: "",
      tags: [],
      rightsConfirmed: false,
    });

    expect(result).toEqual({
      success: false,
      errors: {
        sourceProjectId: "공개할 프로젝트를 선택해 주세요.",
        title: "템플릿 이름은 1자 이상 60자 이하로 입력해 주세요.",
        category: "대표 주제를 선택해 주세요.",
        rightsConfirmed: "공개 권리를 확인해 주세요.",
      },
    });
    if (!result.success) {
      expect(getFirstCommunityTemplatePublishErrorField(result.errors)).toBe(
        "sourceProjectId",
      );
    }
  });

  it("uses the shared contract to trim a valid request", () => {
    expect(
      createCommunityTemplatePublishRequest({
        sourceProjectId: "project_owner_source",
        title: "  팀 회고 템플릿  ",
        category: "business",
        tags: [" 팀 회고 ", "팀 회고"],
        rightsConfirmed: true,
      }),
    ).toEqual({
      success: true,
      request: {
        sourceProjectId: "project_owner_source",
        title: "팀 회고 템플릿",
        categoryId: "business",
        tags: ["팀 회고"],
        rightsConfirmed: true,
      },
    });
  });

  it("invalidates only shelf and list queries before closing and announcing success", async () => {
    const invalidateShelf = vi.fn(async () => undefined);
    const invalidateLists = vi.fn(async () => undefined);
    const closeDialog = vi.fn();
    const announceSuccess = vi.fn();
    const publish = vi.fn(async () => ({
      template: { title: "팀 회고 템플릿" },
    }));

    await executeCommunityTemplatePublish(
      {
        workspaceId: "workspace_demo_1",
        request: {
          sourceProjectId: "project_owner_source",
          title: "팀 회고 템플릿",
          category: "business",
          categoryId: "business",
          tags: [],
          rightsConfirmed: true,
        },
      },
      {
        announceSuccess,
        closeDialog,
        invalidateLists,
        invalidateShelf,
        publish,
      },
    );

    expect(publish).toHaveBeenCalledOnce();
    expect(invalidateShelf).toHaveBeenCalledOnce();
    expect(invalidateLists).toHaveBeenCalledOnce();
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(announceSuccess).toHaveBeenCalledWith("팀 회고 템플릿");
  });

  it("keeps the dialog and form intact when publish fails", async () => {
    const closeDialog = vi.fn();
    const announceSuccess = vi.fn();

    await expect(
      executeCommunityTemplatePublish(
        {
          workspaceId: "workspace_demo_1",
          request: {
            sourceProjectId: "project_owner_source",
            title: "팀 회고 템플릿",
            categoryId: "business",
            tags: [],
            rightsConfirmed: true,
          },
        },
        {
          announceSuccess,
          closeDialog,
          invalidateLists: vi.fn(),
          invalidateShelf: vi.fn(),
          publish: vi.fn(async () => {
            throw new Error("private provider detail");
          }),
        },
      ),
    ).rejects.toThrow("private provider detail");
    expect(closeDialog).not.toHaveBeenCalled();
    expect(announceSuccess).not.toHaveBeenCalled();
  });
});
