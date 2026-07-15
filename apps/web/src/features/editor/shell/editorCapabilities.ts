import {
  projectMemberRoleSchema,
  projectMemberStatusSchema,
} from "@orbit/shared";

export type EditorCapabilities = {
  canCreatePresentationSession: boolean;
  canEditBrief: boolean;
  canExportDeck: boolean;
  canManageShare: boolean;
  canMutateDeck: boolean;
  canRestoreHistory: boolean;
  canStartPersonalRehearsal: boolean;
  canUseAiMutations: boolean;
};

export type EditorCapability = keyof EditorCapabilities;

export const deniedEditorCapabilities: Readonly<EditorCapabilities> = Object.freeze({
  canCreatePresentationSession: false,
  canEditBrief: false,
  canExportDeck: false,
  canManageShare: false,
  canMutateDeck: false,
  canRestoreHistory: false,
  canStartPersonalRehearsal: false,
  canUseAiMutations: false,
});

const editorCapabilities: Readonly<EditorCapabilities> = Object.freeze({
  ...deniedEditorCapabilities,
  canCreatePresentationSession: true,
  canEditBrief: true,
  canExportDeck: true,
  canMutateDeck: true,
  canRestoreHistory: true,
  canStartPersonalRehearsal: true,
  canUseAiMutations: true,
});

const ownerCapabilities: Readonly<EditorCapabilities> = Object.freeze({
  ...editorCapabilities,
  canManageShare: true,
});

const viewerCapabilities: Readonly<EditorCapabilities> = Object.freeze({
  ...deniedEditorCapabilities,
  canStartPersonalRehearsal: true,
});

export function resolveEditorCapabilities(membership: unknown): EditorCapabilities {
  if (!membership || typeof membership !== "object") {
    return { ...deniedEditorCapabilities };
  }

  const candidate = membership as { role?: unknown; status?: unknown };
  const role = projectMemberRoleSchema.safeParse(candidate.role);
  const status = projectMemberStatusSchema.safeParse(candidate.status);

  if (!role.success || !status.success || status.data !== "accepted") {
    return { ...deniedEditorCapabilities };
  }

  if (role.data === "owner") return { ...ownerCapabilities };
  if (role.data === "editor") return { ...editorCapabilities };
  if (role.data === "viewer") return { ...viewerCapabilities };
  return { ...deniedEditorCapabilities };
}
