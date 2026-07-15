import { describe, expect, it } from "vitest";

import {
  deniedEditorCapabilities,
  resolveEditorCapabilities,
} from "./editorCapabilities";

describe("resolveEditorCapabilities", () => {
  it("owner와 editor의 편집 capability를 명시적으로 계산한다", () => {
    expect(resolveEditorCapabilities({ role: "owner", status: "accepted" })).toEqual({
      canCreatePresentationSession: true,
      canEditBrief: true,
      canExportDeck: true,
      canManageShare: true,
      canMutateDeck: true,
      canRestoreHistory: true,
      canStartPersonalRehearsal: true,
      canUseAiMutations: true,
    });
    expect(resolveEditorCapabilities({ role: "editor", status: "accepted" })).toEqual({
      canCreatePresentationSession: true,
      canEditBrief: true,
      canExportDeck: true,
      canManageShare: false,
      canMutateDeck: true,
      canRestoreHistory: true,
      canStartPersonalRehearsal: true,
      canUseAiMutations: true,
    });
  });

  it("viewer에게 개인 리허설만 허용하고 mutation capability는 모두 거부한다", () => {
    expect(resolveEditorCapabilities({ role: "viewer", status: "accepted" })).toEqual({
      ...deniedEditorCapabilities,
      canStartPersonalRehearsal: true,
    });
  });

  it("pending, non-member, unknown role을 fail closed 처리한다", () => {
    expect(resolveEditorCapabilities({ role: "owner", status: "pending" })).toEqual(
      deniedEditorCapabilities,
    );
    expect(resolveEditorCapabilities(null)).toEqual(deniedEditorCapabilities);
    expect(
      resolveEditorCapabilities({ role: "commenter", status: "accepted" }),
    ).toEqual(deniedEditorCapabilities);
  });
});
