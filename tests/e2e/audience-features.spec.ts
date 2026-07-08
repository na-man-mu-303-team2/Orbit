import { expect, test, type Page } from "@playwright/test";

const now = "2026-07-05T00:00:00.000Z";
const session = {
  sessionId: "session_1",
  projectId: "project_1",
  joinCode: "123456",
  status: "live",
  entryStatus: "open",
};
const participant = {
  audienceId: "audience_00000000-0000-4000-8000-000000000001",
  sessionId: "session_1",
  nickname: "orbit",
  joinedAt: now,
  lastSeenAt: now,
  joinedBeforeEnd: true,
};
const disabledFeatures = {
  sessionId: "session_1",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: false,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: now,
};

test.describe("audience feature cards", () => {
  test("hides disabled audience features", async ({ page }) => {
    await mockAudienceJoinFlow(page, disabledFeatures);

    await joinAudience(page);

    await expect(page.getByLabel("활성 청중 기능")).toHaveCount(0);
    await expect(page.getByText("질문 보내기")).toHaveCount(0);
    await expect(page.getByText("투표 참여")).toHaveCount(0);
  });

  test("shows only enabled audience features", async ({ page }) => {
    await mockAudienceJoinFlow(page, {
      ...disabledFeatures,
      qnaEnabled: true,
      pollsEnabled: true,
    });

    await joinAudience(page);

    await expect(page.getByLabel("활성 청중 기능")).toBeVisible();
    await expect(page.getByText("질문 보내기")).toBeVisible();
    await expect(page.getByText("Poll", { exact: true })).toBeVisible();
    await expect(page.getByText("대기 중")).toBeVisible();
    await expect(page.getByText("퀴즈 참여")).toHaveCount(0);
    await expect(page.getByText("설문 작성")).toHaveCount(0);
  });
});

async function joinAudience(page: Page) {
  await page.goto("/join/123456");
  await page.getByLabel("닉네임").fill("orbit");
  await page.getByRole("button", { name: "입장하기" }).click();
}

async function mockAudienceJoinFlow(
  page: Page,
  features: typeof disabledFeatures,
) {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Authentication required" }),
    }),
  );
  await page.route("**/socket.io/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Socket mocked for audience smoke" }),
    }),
  );
  await page.route("**/api/v1/presentation-sessions/join/123456", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ session }),
      });
    }

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ session, participant }),
    });
  });
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/me",
    (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Audience access required" }),
      }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/state",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          session,
          participant,
          state: {
            sessionId: "session_1",
            slideId: "slide_1",
            slideIndex: 0,
            effectState: {},
            activeInteractionId: null,
            updatedAt: now,
          },
          features,
        }),
      }),
  );
}
