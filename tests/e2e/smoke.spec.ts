import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.ORBIT_API_URL ?? "http://127.0.0.1:3000";

test.describe("ORBIT-2 ORBIT-10 ORBIT-58 smoke", () => {
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

  test("creates a project and completes a project asset upload", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "프로젝트 생성" }).click();

    await expect(
      page.getByRole("heading", { name: "프로젝트와 파일" })
    ).toBeVisible();

    await page.getByLabel("프로젝트 이름").fill("ORBIT-10 smoke project");
    await page
      .getByRole("button", { name: "프로젝트 생성" })
      .click();

    await expect(page.getByText("ORBIT-10 smoke project")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "smoke.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nORBIT smoke\n")
    });
    await expect(page.getByText("smoke.pdf")).toBeVisible();

    await page.getByRole("button", { name: "업로드" }).click();

    await expect(page.getByText("smoke.pdf 업로드 완료")).toBeVisible({
      timeout: 20_000
    });
    await expect(
      page.getByRole("list", { name: "업로드된 파일" }).getByText("smoke.pdf")
    ).toBeVisible();
  });
});
