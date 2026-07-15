import { describe, expect, it } from "vitest";

import { buildInitialProjectDeck } from "./projectDeckFactory";

describe("buildInitialProjectDeck", () => {
  it("같은 프로젝트에서 결정적인 첫 슬라이드 Deck을 만든다", () => {
    const project = {
      projectId: "project_new",
      workspaceId: "workspace_demo_1",
      title: "팀 발표",
      createdBy: "user_owner",
      createdAt: "2026-07-16T00:00:00.000Z",
    };

    expect(buildInitialProjectDeck(project)).toEqual(buildInitialProjectDeck(project));
    expect(buildInitialProjectDeck(project)).toMatchObject({
      deckId: "deck_new",
      projectId: "project_new",
      slides: [{ order: 1, slideId: "slide_1" }],
    });
  });
});
