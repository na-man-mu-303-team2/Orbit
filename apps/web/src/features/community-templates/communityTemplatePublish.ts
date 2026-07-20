import {
  publishCommunityTemplateRequestSchema,
  type PublishCommunityTemplateRequest,
} from "@orbit/shared";

export type CommunityTemplatePublishDraft = {
  sourceProjectId: string;
  title: string;
  category: "" | PublishCommunityTemplateRequest["category"];
  rightsConfirmed: boolean;
};

export type CommunityTemplatePublishField = keyof CommunityTemplatePublishDraft;
export type CommunityTemplatePublishErrors = Partial<
  Record<CommunityTemplatePublishField, string>
>;

const fieldOrder: CommunityTemplatePublishField[] = [
  "sourceProjectId",
  "title",
  "category",
  "rightsConfirmed",
];

export function createCommunityTemplatePublishRequest(
  draft: CommunityTemplatePublishDraft,
):
  | { success: true; request: PublishCommunityTemplateRequest }
  | { success: false; errors: CommunityTemplatePublishErrors } {
  const parsed = publishCommunityTemplateRequestSchema.safeParse(draft);
  if (parsed.success) return { success: true, request: parsed.data };

  const errors: CommunityTemplatePublishErrors = {};
  if (!draft.sourceProjectId.trim()) {
    errors.sourceProjectId = "공개할 프로젝트를 선택해 주세요.";
  }
  if (!draft.title.trim() || draft.title.trim().length > 60) {
    errors.title = "템플릿 이름은 1자 이상 60자 이하로 입력해 주세요.";
  }
  if (!draft.category) {
    errors.category = "카테고리를 선택해 주세요.";
  }
  if (!draft.rightsConfirmed) {
    errors.rightsConfirmed = "공개 권리를 확인해 주세요.";
  }
  return { success: false, errors };
}

export function getFirstCommunityTemplatePublishErrorField(
  errors: CommunityTemplatePublishErrors,
) {
  return fieldOrder.find((field) => Boolean(errors[field]));
}

export async function executeCommunityTemplatePublish(
  input: {
    workspaceId: string;
    request: PublishCommunityTemplateRequest;
  },
  dependencies: {
    announceSuccess: (title: string) => void;
    closeDialog: () => void;
    invalidateLists: () => Promise<unknown> | unknown;
    invalidateShelf: () => Promise<unknown> | unknown;
    publish: (input: {
      workspaceId: string;
      sourceProjectId: string;
      title: string;
      category: PublishCommunityTemplateRequest["category"];
      rightsConfirmed: boolean;
    }) => Promise<{ template: { title: string } }>;
  },
) {
  const response = await dependencies.publish({
    workspaceId: input.workspaceId,
    ...input.request,
  });
  await Promise.all([
    dependencies.invalidateShelf(),
    dependencies.invalidateLists(),
  ]);
  dependencies.closeDialog();
  dependencies.announceSuccess(response.template.title);
  return response;
}
