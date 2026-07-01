import type { Page } from "@playwright/test";

export const demoUser = {
  userId: "user_demo_1",
  email: "demo@orbit.local",
  displayName: "Demo User"
};

export function projectFixture(
  patch: Partial<{
    projectId: string;
    workspaceId: string;
    title: string;
    createdBy: string;
    createdAt: string;
  }> = {}
) {
  return {
    projectId: patch.projectId ?? "project_demo_1",
    workspaceId: patch.workspaceId ?? "workspace_demo_1",
    title: patch.title ?? "ORBIT Demo Project",
    createdBy: patch.createdBy ?? demoUser.userId,
    createdAt: patch.createdAt ?? "2026-06-29T00:00:00.000Z"
  };
}

export async function routeAuthenticatedUser(page: Page) {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: { user: demoUser } });
  });
}

export async function routeAcceptedProjectAccess(
  page: Page,
  project = projectFixture()
) {
  await page.route(`**/api/v1/projects/${project.projectId}/access`, async (route) => {
    await route.fulfill({
      json: {
        project,
        membership: {
          role: "owner",
          status: "accepted"
        }
      }
    });
  });
}

export async function exposeRehearsalSmokeControls(page: Page) {
  await page.addStyleTag({
    content: ".rehearsal-smoke-controls { display: flex !important; }"
  });
}
