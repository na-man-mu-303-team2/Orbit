import type { Deck, Project } from "@orbit/shared";
import { expect, type Page } from "@playwright/test";

const e2ePassword = "orbit-e2e-password-123";

export async function authenticateE2ePage(page: Page, label: string) {
  const email = `orbit-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const response = await page.request.post("/api/v1/auth/register", {
    data: { email, password: e2ePassword },
  });

  expect(response.ok(), await response.text()).toBe(true);
}

export async function createAuthenticatedProject(
  page: Page,
  options: { deck?: Deck; label: string; title?: string },
) {
  await authenticateE2ePage(page, options.label);
  const response = await page.request.post(
    "/api/v1/workspaces/workspace_demo_1/projects",
    { data: { title: options.title ?? `E2E ${options.label}` } },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const project = (await response.json()) as Project;

  let deck: Deck | undefined;
  if (options.deck) {
    deck = {
      ...structuredClone(options.deck),
      deckId: `deck_${project.projectId.replace(/^project_/, "")}`,
      projectId: project.projectId,
    };
    const deckResponse = await page.request.put(
      `/api/v1/projects/${encodeURIComponent(project.projectId)}/deck`,
      { data: { deck } },
    );
    expect(deckResponse.ok(), await deckResponse.text()).toBe(true);
  }

  return { deck, project };
}
