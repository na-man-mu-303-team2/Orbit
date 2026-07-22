import { expect, test } from "@playwright/test";
import type { Deck } from "@orbit/shared";
import {
  authenticateE2ePage,
  createAuthenticatedProject,
} from "./authenticatedProject";

const apiBaseUrl = process.env.ORBIT_API_URL ?? "http://127.0.0.1:3000";
const smokeDeck = {
  deckId: "deck_demo_1",
  projectId: "project_demo_1",
  title: "ORBIT 리허설 Smoke Deck",
  version: 1,
  metadata: { language: "ko", locale: "ko-KR", sourceType: "manual" },
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  theme: {
    fontFamily: "Inter",
    backgroundColor: "#ffffff",
    textColor: "#15202b",
    accentColor: "#0f766e"
  },
  slides: [
    {
      slideId: "slide_smoke_1",
      order: 1,
      title: "ORBIT 리허설 흐름",
      thumbnailUrl: "",
      style: {
        layout: "title-content",
        backgroundColor: "#ffffff",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "ORBIT 리허설 흐름을 설명합니다.",
      elements: [
        {
          elementId: "el_smoke_1",
          type: "text",
          x: 120,
          y: 140,
          width: 900,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "ORBIT 리허설 흐름",
            fontSize: 64,
            fontFamily: "Inter",
            fontWeight: 800,
            color: "#15202b",
            align: "left"
          }
        }
      ],
      keywords: [
        {
          keywordId: "kw_smoke_1",
          text: "ORBIT",
          synonyms: ["오르빗"],
          abbreviations: []
        }
      ],
      animations: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    },
    {
      slideId: "slide_smoke_2",
      order: 2,
      title: "리포트 분석 완료",
      thumbnailUrl: "",
      style: {
        layout: "closing",
        backgroundColor: "#f8fafb",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "리포트 분석 완료 상태를 확인합니다.",
      elements: [
        {
          elementId: "el_smoke_2",
          type: "text",
          x: 120,
          y: 140,
          width: 900,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "리포트 분석 완료",
            fontSize: 64,
            fontFamily: "Inter",
            fontWeight: 800,
            color: "#15202b",
            align: "left"
          }
        }
      ],
      keywords: [],
      animations: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    }
  ]
};

test.describe("ORBIT-2 ORBIT-10 ORBIT-36 ORBIT-58 smoke", () => {
  test("serves the web shell and API health contract", async ({
    page,
    request
  }) => {
    const apiHealth = await request.get(`${apiBaseUrl}/health`);
    expect(apiHealth.ok()).toBe(true);
    expect(await apiHealth.json()).toEqual(
      expect.objectContaining({
        status: "ok",
        app: "orbit-api",
        demo: expect.objectContaining({
          projectId: "project_demo_1",
          sessionId: "session_demo_1"
        })
      })
    );

    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.getByText("Orbit 작업 공간")).toBeVisible();
  });

  test("authenticates and opens the migrated project workspace", async ({
    page
  }) => {
    await authenticateE2ePage(page, "asset-upload");
    await page.goto("/project");

    await expect(page.getByRole("heading", { name: "프로젝트 불러오기" })).toBeVisible();
    await expect(page.getByRole("button", { name: /빈 프레젠테이션 만들기/ })).toBeVisible();
  });

  test("opens the migrated rehearsal preflight and starts voice-less practice", async ({
    page
  }) => {
    const created = await createAuthenticatedProject(page, {
      deck: smokeDeck as Deck,
      label: "rehearsal-smoke",
    });
    const projectId = created.project.projectId;

    await page.goto(`/rehearsal/${projectId}`);
    await expect(page.getByRole("heading", { name: "리허설을 시작할까요?" })).toBeVisible();
    await page.getByRole("button", { name: "음성 없이 연습하기" }).click();

    await expect(page.getByRole("region", { name: "리허설 타이머" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "발표 대본 프롬프터" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "리허설 마치기" })).toBeVisible();
  });

  test("finishes a voice-less live presentation and opens its unified report", async ({
    page
  }) => {
    const created = await createAuthenticatedProject(page, {
      deck: smokeDeck as Deck,
      label: "presentation-smoke",
    });
    const projectId = created.project.projectId;

    await page.goto(`/presentation/${projectId}`);
    await expect(
      page.getByRole("heading", { name: "발표 전 마이크를 확인해 주세요" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "마이크 없이 시작" }).click();

    await expect(page.getByText("발표 · 스크립트와 타이머")).toBeVisible();
    await expect(
      page.getByText(smokeDeck.slides[0]?.title ?? "", { exact: true }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "발표 종료" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/presentation/${projectId}/report/[^?]+\\?runId=`),
    );
    await expect(page.getByRole("heading", { name: "발표 리포트" })).toBeVisible();
    await expect(page.getByText("마이크 없이 발표했습니다.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "응답 결과" })).toBeVisible();
    await expect(page.getByText("수집된 청중 결과가 없습니다.")).toBeVisible();
  });

  test("slide redesign applies once and one undo restores the original deck", async ({
    page,
  }) => {
    const created = await createAuthenticatedProject(page, {
      deck: smokeDeck as Deck,
      label: "slide-redesign-smoke",
    });
    const projectId = created.project.projectId;
    await page.goto(`/project/${projectId}`);
    await expect(page.getByLabel("Presentation editor")).toBeVisible();

    const elementsDebug = page.getByTestId("editor-elements-debug");
    const originalElements = await elementsDebug.textContent();
    expect(originalElements).toBeTruthy();

    await page.getByRole("tab", { name: "AI 어시스턴트 탭" }).click();
    await page
      .getByRole("button", { name: "슬라이드 다시 디자인", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "배색을 골라주세요" }),
    ).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: "배색 선택" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "선택한 배색으로 미리보기" })
      .click();
    const proposalCard = page.getByRole("region", {
      name: "디자인 제안 Before/After",
    });
    await expect(proposalCard).toBeVisible({ timeout: 60_000 });
    await proposalCard
      .getByRole("button", { name: "적용", exact: true })
      .click({ timeout: 60_000 });

    await expect(
      page.getByText(
        "디자인 제안을 적용했습니다. 실행 취소 한 번으로 전체 변경을 되돌릴 수 있습니다.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect
      .poll(async () => elementsDebug.textContent())
      .not.toBe(originalElements);

    const undoButton = page.getByRole("button", {
      name: "실행 취소",
      exact: true,
    });
    await expect(undoButton).toBeEnabled();
    await undoButton.click();

    await expect
      .poll(async () => elementsDebug.textContent())
      .toBe(originalElements);
    await expect(undoButton).toBeDisabled();
  });
});
