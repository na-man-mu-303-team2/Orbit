import { expect, test } from "@playwright/test";

test.describe("iPad presenter companion pairing", () => {
  test("exchanges a one-time code and removes it from browser history", async ({
    page,
  }) => {
    let exchangeCount = 0;
    await page.route(
      "**/api/v1/presentation-companion/pairings/**/exchange",
      async (route) => {
        exchangeCount += 1;
        expect(route.request().method()).toBe("POST");
        await route.fulfill({
          contentType: "application/json",
          json: {
            expiresAt: "2026-07-23T04:00:00.000Z",
            scopes: ["view-audience-output", "write-annotation"],
            sessionId: "session_companion_1",
          },
        });
      },
    );
    await page.route(
      "**/api/v1/presentation-companion/session_companion_1/bootstrap",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          json: createBootstrap(),
        });
      },
    );

    await page.goto("/companion/pair/one-time-private-code");

    await expect(page.getByRole("heading", { name: "발표 자료" })).toBeVisible();
    await expect(page.getByText("발표자 화면 연결을 기다리고 있습니다.")).toBeVisible();
    await expect(page).toHaveURL(/\/companion\/session_companion_1$/);
    expect(page.url()).not.toContain("one-time-private-code");
    expect(exchangeCount).toBe(1);

    await page.goBack();
    expect(page.url()).not.toContain("one-time-private-code");
  });

  test("shows a fixed failure after removing an expired code from the URL", async ({
    page,
  }) => {
    await page.route(
      "**/api/v1/presentation-companion/pairings/**/exchange",
      async (route) => {
        await route.fulfill({ status: 404 });
      },
    );

    await page.goto("/companion/pair/expired-private-code");

    await expect(page.getByRole("alert")).toContainText(
      "연결 코드가 만료되었거나 이미 사용되었습니다.",
    );
    expect(page.url()).not.toContain("expired-private-code");
  });
});

function createBootstrap() {
  return {
    deck: {
      canvas: {
        aspectRatio: "16:9",
        height: 1080,
        preset: "wide-16-9",
        width: 1920,
      },
      deckId: "deck_companion_1",
      projectId: "project_companion_1",
      slides: [
        {
          animations: [],
          elements: [],
          kind: "content",
          order: 1,
          slideId: "slide_companion_1",
          style: {
            accentColor: "#5b4ae8",
            backgroundColor: "#ffffff",
            layout: "title-content",
            textColor: "#172033",
          },
        },
      ],
      theme: {
        accentColor: "#5b4ae8",
        backgroundColor: "#ffffff",
        fontFamily: "Inter",
        textColor: "#172033",
      },
      version: 1,
    },
    expiresAt: "2026-07-23T04:00:00.000Z",
    scopes: ["view-audience-output", "write-annotation"],
    sessionId: "session_companion_1",
    sessionPurpose: "presentation",
  };
}
