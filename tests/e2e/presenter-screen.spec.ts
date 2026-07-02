import { expect, test, type Page } from "@playwright/test";

const presenterDeck = {
  deckId: "deck_demo_1",
  projectId: "project_demo_1",
  title: "ORBIT 발표 화면 검증",
  version: 1,
  targetDurationMinutes: 10,
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
      slideId: "slide_presenter_1",
      order: 1,
      title: "Presenter Window",
      thumbnailUrl: "",
      estimatedSeconds: 60,
      style: {
        layout: "title-content",
        backgroundColor: "#ffffff",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "이 대본은 슬라이드 창에 노출되면 안 됩니다.",
      elements: [
        {
          elementId: "el_presenter_1",
          type: "text",
          x: 120,
          y: 140,
          width: 980,
          height: 160,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "Presenter Window",
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
          keywordId: "kw_presenter_secret",
          text: "비공개 키워드",
          synonyms: [],
          abbreviations: []
        }
      ],
      animations: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    },
    {
      slideId: "slide_presenter_2",
      order: 2,
      title: "Slide Window",
      thumbnailUrl: "",
      estimatedSeconds: 60,
      style: {
        layout: "closing",
        backgroundColor: "#f8fafc",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "두 번째 슬라이드 대본도 슬라이드 창에 노출되면 안 됩니다.",
      elements: [
        {
          elementId: "el_presenter_2",
          type: "text",
          x: 120,
          y: 140,
          width: 980,
          height: 160,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "Slide Window",
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

test.describe("P1 presenter screen and slide window", () => {
  test("keeps the slide-only window synchronized without exposing presenter notes", async ({
    page
  }) => {
    await routePresenterDeck(page);

    await page.goto("/rehearsal/project_demo_1");
    await expect(page.getByRole("heading", { name: "리허설", exact: true })).toBeVisible();
    await expect(page.getByText("Presenter Window")).toBeVisible();

    const slideWindowPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "슬라이드 창 열기" }).click();
    const slideWindow = await slideWindowPromise;
    await slideWindow.waitForLoadState();

    await expect(slideWindow.getByLabel("슬라이드 전용 창")).toBeVisible();
    await expect(page.getByText(/발표 모니터/)).toBeVisible();
    await expect(slideWindow.locator('[data-slide-id="slide_presenter_1"]')).toBeVisible();
    await expect
      .poll(async () => slideWindow.locator(".slideshow-renderer").getAttribute("data-slide-title"))
      .toBe("Presenter Window");
    expect(await slideWindow.content()).not.toContain("이 대본은 슬라이드 창에 노출되면 안 됩니다");
    expect(await slideWindow.content()).not.toContain("비공개 키워드");

    await page.getByRole("button", { name: "다음 슬라이드" }).click();

    await expect(slideWindow.locator('[data-slide-id="slide_presenter_2"]')).toBeVisible();
    await expect
      .poll(async () => slideWindow.locator(".slideshow-renderer").getAttribute("data-slide-title"))
      .toBe("Slide Window");
    expect(await slideWindow.content()).not.toContain("두 번째 슬라이드 대본도");

    await slideWindow.close();
    await expect(page.getByText("슬라이드 창이 닫혔습니다. 다시 열 수 있습니다.")).toBeVisible();

    const reopenedWindowPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "슬라이드 창 다시 열기" }).click();
    const reopenedWindow = await reopenedWindowPromise;
    await reopenedWindow.waitForLoadState();

    await expect(reopenedWindow.locator('[data-slide-id="slide_presenter_2"]')).toBeVisible();
    await expect
      .poll(async () =>
        reopenedWindow.locator(".slideshow-renderer").getAttribute("data-slide-title")
      )
      .toBe("Slide Window");
    expect(await reopenedWindow.content()).not.toContain("두 번째 슬라이드 대본도");
  });

  test("shows a screen picker when Window Management reports multiple external displays", async ({
    page
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "getScreenDetails", {
        configurable: true,
        value: async () => ({
          currentScreen: {
            height: 900,
            isPrimary: true,
            label: "내장 화면",
            left: 0,
            top: 0,
            width: 1440
          },
          screens: [
            {
              height: 900,
              isPrimary: true,
              label: "내장 화면",
              left: 0,
              top: 0,
              width: 1440
            },
            {
              availHeight: 1080,
              availWidth: 1920,
              height: 1080,
              isPrimary: false,
              label: "HDMI A",
              left: 1440,
              top: 0,
              width: 1920
            },
            {
              availHeight: 1080,
              availWidth: 1920,
              height: 1080,
              isPrimary: false,
              label: "HDMI B",
              left: 3360,
              top: 0,
              width: 1920
            }
          ]
        })
      });
    });
    await routePresenterDeck(page);

    await page.goto("/rehearsal/project_demo_1");
    const slideWindowPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "슬라이드 창 열기" }).click();
    const slideWindow = await slideWindowPromise;
    await slideWindow.waitForLoadState();

    await expect(page.getByText("화면 선택 필요")).toBeVisible();
    await expect(page.getByText("슬라이드 창을 띄울 화면을 선택하세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: /HDMI A/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /HDMI B/ })).toBeVisible();
    await expect(slideWindow.locator('[data-slide-id="slide_presenter_1"]')).toBeVisible();
  });
});

async function routePresenterDeck(page: Page) {
  await page.route("**/api/v1/projects/project_demo_1/deck", async (route) => {
    await route.fulfill({
      json: {
        projectId: "project_demo_1",
        deck: presenterDeck,
        updatedAt: "2026-07-02T00:00:00.000Z"
      }
    });
  });
}
