import { createDemoDeck } from "@orbit/editor-core";
import type { Deck, ProjectMemberRole, RehearsalRun } from "@orbit/shared";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  addAuthenticatedProjectMember,
  createAuthenticatedProject,
} from "./authenticatedProject";

const journeySteps = [
  "brief",
  "validation",
  "rehearsal",
  "presentation",
] as const;

const outcomeViewports = [
  { height: 900, width: 1440 },
  { height: 768, width: 1024 },
  { height: 1024, width: 768 },
  { height: 844, width: 390 },
] as const;

type OutcomeActor = {
  context: BrowserContext | null;
  page: Page;
};

type MutationProbe = {
  requests: Request[];
};

async function createIsolatedPage(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({
    baseURL:
      typeof testInfo.project.use.baseURL === "string"
        ? testInfo.project.use.baseURL
        : "http://127.0.0.1:5173",
  });

  return { context, page: await context.newPage() };
}

async function createOutcomeActor(
  browser: Browser,
  ownerPage: Page,
  testInfo: TestInfo,
  options: {
    label: string;
    projectId: string;
    role: ProjectMemberRole;
  },
): Promise<OutcomeActor> {
  if (options.role === "owner") {
    return { context: null, page: ownerPage };
  }

  const isolated = await createIsolatedPage(browser, testInfo);
  await addAuthenticatedProjectMember(ownerPage, isolated.page, {
    label: options.label,
    projectId: options.projectId,
    role: options.role,
  });

  return isolated;
}

function observeMutations(page: Page): MutationProbe {
  const probe: MutationProbe = { requests: [] };
  page.on("request", (request) => {
    if (
      ["DELETE", "PATCH", "POST", "PUT"].includes(request.method()) &&
      new URL(request.url()).pathname.startsWith("/api/")
    ) {
      probe.requests.push(request);
    }
  });
  return probe;
}

function projectDeckMutations(probe: MutationProbe, projectId: string) {
  const deckPath = `/api/v1/projects/${encodeURIComponent(projectId)}/deck`;
  return probe.requests.filter((request) =>
    new URL(request.url()).pathname.startsWith(deckPath),
  );
}

function presentationSessionMutations(probe: MutationProbe) {
  return probe.requests.filter((request) =>
    new URL(request.url()).pathname.includes("/presentation-sessions"),
  );
}

function presentationBriefPuts(probe: MutationProbe, projectId: string) {
  const briefPath = `/api/v1/projects/${encodeURIComponent(projectId)}/presentation-brief`;
  return probe.requests.filter(
    (request) =>
      request.method() === "PUT" &&
      new URL(request.url()).pathname === briefPath,
  );
}

async function settleEditorLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolveFrame());
      });
    });
  });
}

async function openEditor(
  page: Page,
  projectId: string,
  viewport = { height: 900, width: 1440 },
) {
  await page.setViewportSize(viewport);
  await page.goto(`/project/${projectId}`);
  await expect(page.getByLabel("Presentation editor")).toBeVisible();
  await expect(page.getByTestId("editor-stage-shell")).toBeVisible();
  await settleEditorLayout(page);
}

function journeyPanel(page: Page) {
  return page.getByTestId("presentation-journey-panel");
}

function journeyAction(page: Page, action: string) {
  return page.locator(`[data-journey-action="${action}"]`);
}

async function openJourney(page: Page) {
  const opener = page.getByRole("button", {
    name: "발표 준비 경로 열기",
    exact: true,
  });
  await expect(opener).toBeVisible();
  await opener.click();
  await expect(journeyPanel(page)).toBeVisible();
  await expect(
    journeyPanel(page).getByRole("navigation", {
      name: "발표 준비 경로",
      exact: true,
    }),
  ).toBeVisible();
  return journeyPanel(page);
}

async function expectFourJourneySteps(page: Page) {
  const steps = await journeyPanel(page)
    .locator("[data-journey-step]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-journey-step")),
    );
  expect(steps).toEqual(journeySteps);
}

async function installNavigationRecorder(page: Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __ORBIT_OUTCOME_NAVIGATIONS__?: string[];
    };
    target.__ORBIT_OUTCOME_NAVIGATIONS__ = [];
    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = (...args: Parameters<History["pushState"]>) => {
      const url = args[2];
      if (url !== undefined && url !== null) {
        target.__ORBIT_OUTCOME_NAVIGATIONS__?.push(String(url));
      }
      return originalPushState(...args);
    };
  });
}

async function recordedNavigationCount(page: Page, pathname: string) {
  return page.evaluate((expectedPathname) => {
    const target = window as typeof window & {
      __ORBIT_OUTCOME_NAVIGATIONS__?: string[];
    };
    return (target.__ORBIT_OUTCOME_NAVIGATIONS__ ?? []).filter((url) => {
      const parsed = new URL(url, window.location.origin);
      return parsed.pathname === expectedPathname;
    }).length;
  }, pathname);
}

async function applyPendingDeckChange(page: Page) {
  const accepted = await page.evaluate(() => {
    const target = window as typeof window & {
      __ORBIT_EDITOR_TEST_API__?: {
        updateCurrentSlideStyle: (style: {
          backgroundColor: string;
        }) => boolean;
      };
    };
    return (
      target.__ORBIT_EDITOR_TEST_API__?.updateCurrentSlideStyle({
        backgroundColor: "#fef3c7",
      }) ?? false
    );
  });
  expect(accepted).toBe(true);
}

async function clickTwiceInSameTick(locator: Locator) {
  await locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Journey action is not an HTMLElement.");
    }
    element.click();
    element.click();
  });
}

function createValidationDeck(): Deck {
  const deck = structuredClone(createDemoDeck());
  const text = deck.slides[0]?.elements.find(
    (element: Deck["slides"][number]["elements"][number]) =>
      element.type === "text",
  );
  if (!text || text.type !== "text") {
    throw new Error("Demo Deck text fixture is missing.");
  }

  text.width = 220;
  text.height = 30;
  text.props = {
    ...text.props,
    fontSize: 48,
    lineHeight: 1.5,
    text: "발표 준비 경로에서 전체 Deck 검사 단계를 검증하는 긴 본문입니다.",
  };
  return deck;
}

async function installSnapshotUploadRoutes(
  page: Page,
  projectId: string,
  testInfo: TestInfo,
) {
  const requests: Array<Record<string, unknown>> = [];
  const purposeByFileId = new Map<string, string>();
  let nextFileNumber = 0;
  const baseURL =
    typeof testInfo.project.use.baseURL === "string"
      ? testInfo.project.use.baseURL
      : "http://127.0.0.1:5173";

  await page.route("**/assets/upload-url", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    const fileId = `file_outcome_snapshot_${++nextFileNumber}`;
    purposeByFileId.set(fileId, String(body.purpose));
    await route.fulfill({
      json: {
        expiresAt: "2099-01-01T00:00:00.000Z",
        fileId,
        headers: { "content-type": body.mimeType },
        method: "PUT",
        projectId,
        purpose: body.purpose,
        uploadUrl: `${baseURL}/__outcome-e2e-upload/${fileId}`,
      },
    });
  });
  await page.route("**/__outcome-e2e-upload/*", (route) =>
    route.fulfill({ body: "", status: 200 }),
  );
  await page.route("**/assets/complete", async (route) => {
    const { fileId } = route.request().postDataJSON() as { fileId: string };
    await route.fulfill({
      json: {
        createdAt: "2026-07-16T00:00:00.000Z",
        fileId,
        mimeType: "image/png",
        originalName: `${fileId}.png`,
        projectId,
        purpose: purposeByFileId.get(fileId),
        size: 4,
        url: `/api/v1/projects/${projectId}/assets/${fileId}/content`,
      },
    });
  });

  return requests;
}

async function createPersonalRun(
  page: Page,
  projectId: string,
  deckId: string,
) {
  const response = await page.request.post(
    `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsals`,
    { data: { deckId } },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { run: RehearsalRun }).run;
}

async function listPersonalRuns(page: Page, projectId: string) {
  const response = await page.request.get(
    `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsals`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { runs: RehearsalRun[] }).runs;
}

async function expectNoHorizontalDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const contentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    return Math.ceil(contentWidth - document.documentElement.clientWidth);
  });
  expect(overflow).toBe(0);
}

async function expectNoCriticalOrSeriousAxeViolations(page: Page) {
  await page.addScriptTag({
    content: readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8"),
  });
  const violations = await page.evaluate(async () => {
    type AxeResult = {
      violations: Array<{
        help: string;
        id: string;
        impact: string | null;
        nodes: Array<{ target: string[] }>;
      }>;
    };
    const axe = (
      window as typeof window & {
        axe: { run: (root: Document, options: object) => Promise<AxeResult> };
      }
    ).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter(
        (violation) =>
          violation.impact === "critical" || violation.impact === "serious",
      )
      .map((violation) => ({
        help: violation.help,
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      }));
  });
  expect(violations).toEqual([]);
}

async function focusWithTab(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (
      await target.evaluate((element) => document.activeElement === element)
    ) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

for (const role of ["owner", "editor"] as const) {
  test(`presentation outcome flow ${role} action order waits for one pending Deck patch before one Brief navigation`, async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    await installNavigationRecorder(ownerPage);
    const { project } = await createAuthenticatedProject(ownerPage, {
      deck: createDemoDeck(),
      label: `outcome-${role}-flush-owner`,
    });
    const actor = await createOutcomeActor(browser, ownerPage, testInfo, {
      label: `outcome-${role}-flush-actor`,
      projectId: project.projectId,
      role,
    });
    if (actor.page !== ownerPage) {
      await installNavigationRecorder(actor.page);
    }

    let releasePatch: () => void = () => {};
    const patchGate = new Promise<void>((resolveGate) => {
      releasePatch = resolveGate;
    });
    const patchRequests: Request[] = [];
    await actor.page.route(
      `**/api/v1/projects/${project.projectId}/deck/patches`,
      async (route) => {
        patchRequests.push(route.request());
        await patchGate;
        await route.continue();
      },
    );

    try {
      await openEditor(actor.page, project.projectId);
      await openJourney(actor.page);
      await expectFourJourneySteps(actor.page);
      await expect(journeyAction(actor.page, "brief-edit")).toBeVisible();
      await expect(journeyAction(actor.page, "validation-open")).toBeVisible();
      await expect(journeyAction(actor.page, "rehearsal-start")).toBeVisible();
      await expect(
        journeyAction(actor.page, "presentation-start"),
      ).toBeVisible();
      await expect(journeyAction(actor.page, "brief-view")).toHaveCount(0);
      await expect(journeyAction(actor.page, "validation-focus")).toHaveCount(
        0,
      );

      await applyPendingDeckChange(actor.page);
      await expect.poll(() => patchRequests.length).toBe(1);
      await clickTwiceInSameTick(journeyAction(actor.page, "brief-edit"));
      await expect(actor.page).toHaveURL(`/project/${project.projectId}`);

      releasePatch();
      await expect(actor.page).toHaveURL(`/project/${project.projectId}/brief`);
      expect(patchRequests).toHaveLength(1);
      await expect
        .poll(() =>
          recordedNavigationCount(
            actor.page,
            `/project/${project.projectId}/brief`,
          ),
        )
        .toBe(1);
    } finally {
      releasePatch();
      await actor.context?.close();
    }
  });
}

test("presentation outcome flow save 500 keeps the editor route and exposes recovery status", async ({
  page,
}) => {
  const { project } = await createAuthenticatedProject(page, {
    deck: createDemoDeck(),
    label: "outcome-save-500",
  });
  let patchAttempts = 0;
  await page.route(
    `**/api/v1/projects/${project.projectId}/deck/patches`,
    async (route) => {
      patchAttempts += 1;
      await route.fulfill({
        body: JSON.stringify({ message: "deterministic save failure" }),
        contentType: "application/json",
        status: 500,
      });
    },
  );

  await openEditor(page, project.projectId);
  await openJourney(page);
  await applyPendingDeckChange(page);
  await journeyAction(page, "brief-edit").click();

  await expect.poll(() => patchAttempts).toBeGreaterThan(0);
  await expect(page).toHaveURL(`/project/${project.projectId}`);
  await expect(page.getByTestId("presentation-journey-status")).toBeVisible();
  await expect(page.getByTestId("presentation-journey-status")).toContainText(
    /저장|실패|다시/,
  );
});

test("presentation outcome flow repeated stale version conflict keeps the editor route and exposes recovery status", async ({
  page,
}) => {
  const { project } = await createAuthenticatedProject(page, {
    deck: createDemoDeck(),
    label: "outcome-save-conflict",
  });
  let patchAttempts = 0;
  await page.route(
    `**/api/v1/projects/${project.projectId}/deck/patches`,
    async (route) => {
      patchAttempts += 1;
      await route.fulfill({
        body: JSON.stringify({
          code: "STALE_BASE_VERSION",
          message: "deterministic version conflict",
        }),
        contentType: "application/json",
        status: 409,
      });
    },
  );

  await openEditor(page, project.projectId);
  await openJourney(page);
  await applyPendingDeckChange(page);
  await journeyAction(page, "presentation-start").click();

  await expect.poll(() => patchAttempts).toBeGreaterThanOrEqual(2);
  await expect(page).toHaveURL(`/project/${project.projectId}`);
  await expect(page.getByTestId("presentation-journey-status")).toBeVisible();
  await expect(page.getByTestId("presentation-journey-status")).toContainText(
    /저장|충돌|최신|다시/,
  );
});

test("presentation outcome flow validation action opens the existing AI validation region", async ({
  page,
}) => {
  const { project } = await createAuthenticatedProject(page, {
    deck: createValidationDeck(),
    label: "outcome-validation-owner",
  });
  await openEditor(page, project.projectId);
  await openJourney(page);
  await journeyAction(page, "validation-open").click();

  await expect(page.getByTestId("editor-validation-panel")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "AI 코치", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tab", { name: "검사", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("presentation outcome flow Viewer keeps Brief and validation read-only, starts only personal rehearsal, and creates no Deck or presentation mutation", async ({
  browser,
  page: ownerPage,
}, testInfo) => {
  const { project } = await createAuthenticatedProject(ownerPage, {
    deck: createValidationDeck(),
    label: "outcome-viewer-owner",
  });
  const actor = await createOutcomeActor(browser, ownerPage, testInfo, {
    label: "outcome-viewer",
    projectId: project.projectId,
    role: "viewer",
  });
  const snapshotRequests = await installSnapshotUploadRoutes(
    actor.page,
    project.projectId,
    testInfo,
  );

  try {
    const probe = observeMutations(actor.page);
    await openEditor(actor.page, project.projectId);
    await openJourney(actor.page);
    await expectFourJourneySteps(actor.page);
    await expect(journeyAction(actor.page, "brief-view")).toBeVisible();
    await expect(journeyAction(actor.page, "validation-focus")).toBeVisible();
    await expect(journeyAction(actor.page, "rehearsal-start")).toBeVisible();
    await expect(journeyAction(actor.page, "brief-edit")).toHaveCount(0);
    await expect(journeyAction(actor.page, "validation-open")).toHaveCount(0);
    await expect(journeyAction(actor.page, "presentation-start")).toHaveCount(
      0,
    );

    await journeyAction(actor.page, "validation-focus").click();
    const validationPanel = actor.page.getByTestId("editor-validation-panel");
    await expect(validationPanel).toBeVisible();
    await expect(
      validationPanel.getByRole("button", { name: /안전 수정/ }),
    ).toHaveCount(0);
    const firstTarget = validationPanel
      .getByTestId("editor-validation-target")
      .first();
    await expect(firstTarget).toBeVisible();
    await firstTarget.click();
    expect(projectDeckMutations(probe, project.projectId)).toEqual([]);

    await openJourney(actor.page);
    await journeyAction(actor.page, "brief-view").click();
    await expect(actor.page).toHaveURL(`/project/${project.projectId}/brief`);
    await expect(actor.page.getByText(/보기 전용/).first()).toBeVisible();
    expect(presentationBriefPuts(probe, project.projectId)).toEqual([]);

    await openEditor(actor.page, project.projectId);
    await openJourney(actor.page);
    await journeyAction(actor.page, "rehearsal-start").click();
    await expect(actor.page).toHaveURL(
      new RegExp(`/rehearsal/${project.projectId}\\?snapshotPreparationId=`),
    );
    await expect
      .poll(
        () =>
          snapshotRequests.filter(
            (request) => request.purpose === "rehearsal-slide-snapshot",
          ).length,
      )
      .toBeGreaterThan(0);

    expect(projectDeckMutations(probe, project.projectId)).toEqual([]);
    expect(presentationBriefPuts(probe, project.projectId)).toEqual([]);
    expect(presentationSessionMutations(probe)).toEqual([]);
  } finally {
    await actor.context?.close();
  }
});

test("presentation outcome flow creator-owned Run and report data stay isolated for Owner, Editor, and Viewer", async ({
  browser,
  page: ownerPage,
}, testInfo) => {
  const { deck, project } = await createAuthenticatedProject(ownerPage, {
    deck: createDemoDeck(),
    label: "outcome-run-isolation-owner",
  });
  if (!deck) {
    throw new Error("Persisted outcome Deck fixture is missing.");
  }
  const editor = await createOutcomeActor(browser, ownerPage, testInfo, {
    label: "outcome-run-isolation-editor",
    projectId: project.projectId,
    role: "editor",
  });
  const viewer = await createOutcomeActor(browser, ownerPage, testInfo, {
    label: "outcome-run-isolation-viewer",
    projectId: project.projectId,
    role: "viewer",
  });

  try {
    const ownerRun = await createPersonalRun(
      ownerPage,
      project.projectId,
      deck.deckId,
    );
    const editorRun = await createPersonalRun(
      editor.page,
      project.projectId,
      deck.deckId,
    );
    const viewerRun = await createPersonalRun(
      viewer.page,
      project.projectId,
      deck.deckId,
    );

    await expect
      .poll(async () =>
        (await listPersonalRuns(ownerPage, project.projectId)).map(
          (run) => run.runId,
        ),
      )
      .toEqual([ownerRun.runId]);
    await expect
      .poll(async () =>
        (await listPersonalRuns(editor.page, project.projectId)).map(
          (run) => run.runId,
        ),
      )
      .toEqual([editorRun.runId]);
    await expect
      .poll(async () =>
        (await listPersonalRuns(viewer.page, project.projectId)).map(
          (run) => run.runId,
        ),
      )
      .toEqual([viewerRun.runId]);

    const ownerForeignReport = await ownerPage.request.get(
      `/api/v1/rehearsals/${editorRun.runId}/report`,
    );
    const editorForeignReport = await editor.page.request.get(
      `/api/v1/rehearsals/${viewerRun.runId}/report`,
    );
    const viewerForeignReport = await viewer.page.request.get(
      `/api/v1/rehearsals/${ownerRun.runId}/report`,
    );
    expect(ownerForeignReport.status()).toBe(404);
    expect(editorForeignReport.status()).toBe(404);
    expect(viewerForeignReport.status()).toBe(404);

    await openEditor(viewer.page, project.projectId);
    const panel = await openJourney(viewer.page);
    const visibleJourneyText = await panel.innerText();
    expect(visibleJourneyText).not.toContain(ownerRun.runId);
    expect(visibleJourneyText).not.toContain(editorRun.runId);
  } finally {
    await editor.context?.close();
    await viewer.context?.close();
  }
});

for (const viewport of outcomeViewports) {
  test(`presentation outcome flow keyboard, bounds, overflow, and axe remain valid at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createDemoDeck(),
      label: `outcome-viewport-${viewport.width}x${viewport.height}`,
    });
    await openEditor(page, project.projectId, viewport);

    const opener = page.getByRole("button", {
      name: "발표 준비 경로 열기",
      exact: true,
    });
    await opener.focus();
    await expect(opener).toBeFocused();
    await opener.press("Enter");
    await expect(journeyPanel(page)).toBeVisible();
    await expectFourJourneySteps(page);

    const action = journeyAction(page, "brief-edit");
    await focusWithTab(page, action);
    await expect(action).toBeFocused();
    const bounds = await action.evaluate((element) => {
      const actionRect = element.getBoundingClientRect();
      const panel = element.closest(
        '[data-testid="presentation-journey-panel"]',
      );
      const panelRect = panel?.getBoundingClientRect();
      return {
        actionBottom: actionRect.bottom,
        actionHeight: actionRect.height,
        actionLeft: actionRect.left,
        actionRight: actionRect.right,
        actionTop: actionRect.top,
        panelBottom: panelRect?.bottom ?? 0,
        panelLeft: panelRect?.left ?? 0,
        panelRight: panelRect?.right ?? 0,
        panelTop: panelRect?.top ?? 0,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(bounds.actionLeft).toBeGreaterThanOrEqual(bounds.panelLeft - 1);
    expect(bounds.actionRight).toBeLessThanOrEqual(bounds.panelRight + 1);
    expect(bounds.actionTop).toBeGreaterThanOrEqual(bounds.panelTop - 1);
    expect(bounds.actionBottom).toBeLessThanOrEqual(bounds.panelBottom + 1);
    expect(bounds.actionLeft).toBeGreaterThanOrEqual(-1);
    expect(bounds.actionRight).toBeLessThanOrEqual(bounds.viewportWidth + 1);
    expect(bounds.actionTop).toBeGreaterThanOrEqual(-1);
    expect(bounds.actionBottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
    if (viewport.width === 390) {
      expect(bounds.actionHeight).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalDocumentOverflow(page);
    await expectNoCriticalOrSeriousAxeViolations(page);
  });
}

test("presentation outcome flow missing Brief keeps all four journey steps", async ({
  page,
}) => {
  const { project } = await createAuthenticatedProject(page, {
    deck: createDemoDeck(),
    label: "outcome-brief-missing",
  });
  await openEditor(page, project.projectId);
  await openJourney(page);
  await expectFourJourneySteps(page);
  await expect(journeyAction(page, "brief-edit")).toBeVisible();
});

test("presentation outcome flow Brief GET error keeps all four journey steps", async ({
  page,
}) => {
  const { project } = await createAuthenticatedProject(page, {
    deck: createDemoDeck(),
    label: "outcome-brief-error",
  });
  await page.route(
    `**/api/v1/projects/${project.projectId}/presentation-brief`,
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          body: JSON.stringify({ message: "deterministic Brief failure" }),
          contentType: "application/json",
          status: 500,
        });
        return;
      }
      await route.continue();
    },
  );

  await openEditor(page, project.projectId);
  await openJourney(page);
  await expectFourJourneySteps(page);
  await expect(journeyPanel(page)).toContainText(/Brief|브리프/);
});
