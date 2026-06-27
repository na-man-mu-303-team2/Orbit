import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.ORBIT_API_URL ?? "http://127.0.0.1:3000";

test.describe("ORBIT-2 ORBIT-58 smoke", () => {
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

    await expect(
      page.getByRole("heading", { name: "ORBIT Demo Console" })
    ).toBeVisible();
    await expect(page.getByText("project_demo_1")).toBeVisible();
    await expect(page.getByText("session_demo_1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "프로젝트 생성" })
    ).toBeVisible();
    await expect(page.getByText("ok")).toBeVisible();
  });
});
