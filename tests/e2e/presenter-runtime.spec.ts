import { expect, test, type Page } from "@playwright/test";

const runtimeDeck = {
  deckId: "deck_demo_1",
  projectId: "project_demo_1",
  title: "ORBIT Runtime Deck",
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
      slideId: "slide_runtime_1",
      order: 1,
      title: "Runtime 1",
      thumbnailUrl: "",
      estimatedSeconds: 60,
      style: {
        layout: "title-content",
        backgroundColor: "#ffffff",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "발표자 전용 대본",
      elements: [
        {
          elementId: "el_runtime_1",
          type: "text",
          x: 120,
          y: 140,
          width: 900,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "Runtime 1",
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
          keywordId: "kw_show",
          text: "보이기",
          synonyms: [],
          abbreviations: [],
          required: false
        },
        {
          keywordId: "kw_next",
          text: "다음장",
          synonyms: [],
          abbreviations: [],
          required: false
        }
      ],
      animations: [
        {
          animationId: "anim_runtime_1",
          elementId: "el_runtime_1",
          type: "fade-in",
          order: 1,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out"
        }
      ],
      actions: [
        {
          actionId: "act_runtime_show",
          trigger: {
            kind: "keyword",
            keywordId: "kw_show"
          },
          effect: {
            kind: "play-animation",
            animationId: "anim_runtime_1"
          }
        },
        {
          actionId: "act_runtime_next",
          trigger: {
            kind: "keyword",
            keywordId: "kw_next"
          },
          effect: {
            kind: "go-to-next-slide"
          }
        }
      ],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    },
    {
      slideId: "slide_runtime_2",
      order: 2,
      title: "Runtime 2",
      thumbnailUrl: "",
      estimatedSeconds: 60,
      style: {
        layout: "closing",
        backgroundColor: "#f8fafc",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "두 번째 슬라이드 대본",
      elements: [
        {
          elementId: "el_runtime_2",
          type: "text",
          x: 120,
          y: 140,
          width: 900,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "Runtime 2",
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
      actions: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    }
  ]
};

test.describe("presenter runtime bridge", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__ORBIT_ENABLE_TEST_API__ = true;
    });
    await routeRuntimeDeck(page);
  });

  test("advances keyword-triggered animation steps on click and syncs the slide window", async ({
    page
  }) => {
    await page.goto("/rehearsal/project_demo_1");
    await expect(page.getByRole("heading", { name: "리허설", exact: true })).toBeVisible();

    const slideWindowPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "슬라이드 창 열기" }).click();
    const slideWindow = await slideWindowPromise;
    await slideWindow.waitForLoadState();

    await expect
      .poll(() => page.evaluate(() => window.__ORBIT_TEST_API__?.getSnapshot().runtime?.stepIndex))
      .toBe(0);

    await page.evaluate(() => {
      window.__ORBIT_TEST_API__?.advanceClick();
    });

    await expect
      .poll(() => page.evaluate(() => window.__ORBIT_TEST_API__?.getSnapshot().runtime?.stepIndex))
      .toBe(1);
    await expect
      .poll(async () => slideWindow.locator(".slideshow-renderer").getAttribute("data-step-index"))
      .toBe("1");

    await page.evaluate(() => {
      window.__ORBIT_TEST_API__?.advanceClick();
    });

    await expect
      .poll(() => page.evaluate(() => window.__ORBIT_TEST_API__?.getSnapshot().slideId))
      .toBe("slide_runtime_2");
    await expect(slideWindow.locator('[data-slide-id="slide_runtime_2"]')).toBeVisible();
  });

  test("executes keyword-authored animation and next-slide actions through the test bridge", async ({
    page
  }) => {
    await page.goto("/rehearsal/project_demo_1");
    const slideWindowPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "슬라이드 창 열기" }).click();
    const slideWindow = await slideWindowPromise;
    await slideWindow.waitForLoadState();

    await page.evaluate(() => {
      window.__ORBIT_TEST_API__?.triggerKeyword("kw_show");
    });

    await expect
      .poll(() =>
        page.evaluate(() => window.__ORBIT_TEST_API__?.getSnapshot().runtime?.executedAnimationIds)
      )
      .toEqual(["anim_runtime_1"]);
    await expect
      .poll(async () => slideWindow.locator(".slideshow-renderer").getAttribute("data-step-index"))
      .toBe("1");

    await page.evaluate(() => {
      window.__ORBIT_TEST_API__?.triggerKeyword("kw_next");
    });

    await expect
      .poll(() => page.evaluate(() => window.__ORBIT_TEST_API__?.getSnapshot().currentSlideIndex))
      .toBe(1);
    await expect(slideWindow.locator('[data-slide-id="slide_runtime_2"]')).toBeVisible();
  });
});

async function routeRuntimeDeck(page: Page) {
  await page.route("**/api/v1/projects/project_demo_1/deck", async (route) => {
    await route.fulfill({
      json: {
        projectId: "project_demo_1",
        deck: runtimeDeck,
        updatedAt: "2026-07-03T00:00:00.000Z"
      }
    });
  });
}
