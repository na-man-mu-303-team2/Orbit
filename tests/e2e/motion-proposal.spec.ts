import { createDemoDeck } from "@orbit/editor-core";
import { expect, test } from "@playwright/test";
import type { Deck } from "@orbit/shared";
import { createAuthenticatedProject } from "./authenticatedProject";

test.describe("Semantic Motion proposal preview", () => {
  test("previews canonical beats and preserves apply undo redo graph", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const source = createDemoDeck();
    const slide = source.slides[0]!;
    const deck = {
      ...source,
      metadata: { ...source.metadata, sourceType: "manual" as const },
      slides: [
        {
          ...slide,
          actions: [],
          animations: [],
          speakerNotes: "MOTION_E2E_PRIVATE_SENTINEL",
        },
      ],
    } satisfies Deck;
    const created = await createAuthenticatedProject(page, {
      deck,
      label: "semantic-motion-preview",
    });
    const projectId = created.project.projectId;

    await page.goto(`/project/${projectId}`);
    await expect(page.getByLabel("Presentation editor")).toBeVisible();
    const animationsDebug = page.getByTestId("editor-animations-debug");
    const beforeAnimations = await animationsDebug.textContent();
    expect(beforeAnimations).toBe("[]");

    await page.getByRole("tab", { name: "AI 어시스턴트 탭" }).click();
    await page
      .getByRole("button", { name: "애니메이션 추천", exact: true })
      .click();
    const proposalCard = page.getByRole("region", { name: "Motion 제안" });
    await expect(proposalCard).toBeVisible({ timeout: 60_000 });
    await expect(proposalCard.getByText(/자동 진입 \d+ · 클릭 \d+/)).toBeVisible();

    await proposalCard.getByRole("button", { name: "미리보기" }).click();
    const dialog = page.getByRole("dialog", {
      name: "AI Motion 제안 미리보기",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("region", { name: "Motion 제안 미리보기" }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "처음으로" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "재생" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "다음 beat" })).toBeEnabled();
    await dialog.getByRole("button", { name: "다음 beat" }).click();
    await expect(dialog.getByText(/클릭 1\/\d+/)).toBeVisible();
    await dialog.getByRole("button", { name: "동작 줄이기" }).click();
    await expect(
      dialog.getByRole("button", { name: "동작 줄임 켜짐" }),
    ).toHaveAttribute("aria-pressed", "true");

    await dialog.getByRole("button", { name: "적용", exact: true }).click();
    await expect
      .poll(async () => animationsDebug.textContent())
      .not.toBe(beforeAnimations);
    const candidateAnimations = await animationsDebug.textContent();
    expect(candidateAnimations).toBeTruthy();
    expect(candidateAnimations).not.toContain("MOTION_E2E_PRIVATE_SENTINEL");

    const undoButton = page.getByRole("button", {
      name: "실행 취소",
      exact: true,
    });
    const redoButton = page.getByRole("button", {
      name: "다시 실행",
      exact: true,
    });
    await undoButton.click();
    await expect.poll(async () => animationsDebug.textContent()).toBe("[]");
    await redoButton.click();
    await expect
      .poll(async () => animationsDebug.textContent())
      .toBe(candidateAnimations);
  });

  test("uses instant beat state when the system requests reduced motion", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const source = createDemoDeck();
    const slide = source.slides[0]!;
    const created = await createAuthenticatedProject(page, {
      deck: {
        ...source,
        metadata: { ...source.metadata, sourceType: "manual" },
        slides: [{ ...slide, actions: [], animations: [] }],
      } as Deck,
      label: "semantic-motion-reduced",
    });

    await page.goto(`/project/${created.project.projectId}`);
    await page.getByRole("tab", { name: "AI 어시스턴트 탭" }).click();
    await page
      .getByRole("button", { name: "애니메이션 추천", exact: true })
      .click();
    const proposalCard = page.getByRole("region", { name: "Motion 제안" });
    await expect(proposalCard).toBeVisible({ timeout: 60_000 });
    await proposalCard.getByRole("button", { name: "미리보기" }).click();
    const reducedMotionButton = page.getByRole("button", {
      name: "동작 줄임 켜짐",
    });
    await expect(reducedMotionButton).toBeDisabled();
    await expect(reducedMotionButton).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("시스템의 동작 줄이기 설정을 따릅니다.", {
        exact: false,
      }),
    ).toBeVisible();
  });
});
