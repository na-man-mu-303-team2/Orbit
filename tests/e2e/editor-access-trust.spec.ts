import { createDemoDeck } from "@orbit/editor-core";
import type { Deck, ProjectMemberRole } from "@orbit/shared";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
  type TestInfo,
} from "@playwright/test";

import {
  addAuthenticatedProjectMember,
  createAuthenticatedProject,
  requestAuthenticatedProjectAccess,
} from "./authenticatedProject";

const mutatingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

type NetworkProbe = {
  mutations: Request[];
  socketRequests: Request[];
  websocketUrls: string[];
};

function observeTrustBoundary(page: Page): NetworkProbe {
  const probe: NetworkProbe = {
    mutations: [],
    socketRequests: [],
    websocketUrls: [],
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      mutatingMethods.has(request.method()) &&
      url.pathname.startsWith("/api/")
    ) {
      probe.mutations.push(request);
    }
    if (url.pathname.startsWith("/socket.io")) {
      probe.socketRequests.push(request);
    }
  });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname.startsWith("/socket.io")) {
      probe.websocketUrls.push(socket.url());
    }
  });

  return probe;
}

function projectDeckMutations(probe: NetworkProbe, projectId: string) {
  const deckPath = `/api/v1/projects/${encodeURIComponent(projectId)}/deck`;
  return probe.mutations.filter((request) =>
    new URL(request.url()).pathname.startsWith(deckPath),
  );
}

function presentationSessionMutations(probe: NetworkProbe) {
  return probe.mutations.filter((request) =>
    new URL(request.url()).pathname.includes("/presentation-sessions"),
  );
}

async function createIsolatedPage(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({
    baseURL:
      typeof testInfo.project.use.baseURL === "string"
        ? testInfo.project.use.baseURL
        : "http://127.0.0.1:5173",
  });
  return { context, page: await context.newPage() };
}

async function expectNoDemoOrCanvas(page: Page) {
  await expect(page.getByText("ORBIT Demo Deck", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("editor-canvas-stage")).toHaveCount(0);
  await expect(page.getByLabel("Presentation editor")).toHaveCount(0);
}

async function seedPresentationBrief(page: Page, projectId: string) {
  const response = await page.request.put(
    `/api/v1/projects/${encodeURIComponent(projectId)}/presentation-brief`,
    {
      data: {
        approvedReferenceFileIds: [],
        audience: "decision-maker",
        challengeTopics: ["예산 승인 기준"],
        desiredOutcome: "다음 분기 실행 예산 승인",
        evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
        expectedRevision: 0,
        purpose: "persuade",
        requirements: [
          {
            kind: "must-cover",
            reviewStatus: "approved",
            text: "시장 진입 근거",
          },
        ],
        targetDurationMinutes: 10,
        terminology: [],
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
}

test.describe("P0-2 editor access and trust boundary", () => {
  test("pending membership cannot bypass Editor, Brief, History, or Rehearsal routes", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const { project } = await createAuthenticatedProject(ownerPage, {
      label: "trust-pending-owner",
    });
    const { context, page } = await createIsolatedPage(browser, testInfo);

    try {
      await requestAuthenticatedProjectAccess(page, {
        label: "trust-pending-member",
        projectId: project.projectId,
        role: "viewer",
      });
      const probe = observeTrustBoundary(page);

      for (const path of [
        `/project/${project.projectId}`,
        `/project/${project.projectId}/brief`,
        `/project/${project.projectId}/history`,
        `/rehearsal/${project.projectId}`,
      ]) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(
          new RegExp(`/project/${project.projectId}/request$`),
        );
        await expectNoDemoOrCanvas(page);
        await expect(page.getByText("승인을 기다리고 있어요.")).toBeVisible();
      }

      expect(probe.mutations).toEqual([]);
      expect(probe.socketRequests).toEqual([]);
      expect(probe.websocketUrls).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("a Deck 500 response exposes recovery without demo, canvas, socket, or mutation", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      label: "trust-deck-500",
    });
    const probe = observeTrustBoundary(page);

    await page.route(
      `**/api/v1/projects/${project.projectId}/deck`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            body: JSON.stringify({ message: "Deck unavailable" }),
            contentType: "application/json",
            status: 500,
          });
          return;
        }
        await route.continue();
      },
    );

    await page.goto(`/project/${project.projectId}`);

    await expect(page.getByRole("alert")).toContainText(
      /발표 자료를 불러오지 못|Deck unavailable/,
    );
    await expectNoDemoOrCanvas(page);
    await expect(page.getByRole("button", { name: /다시 시도/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /프로젝트.*돌아가기/ }),
    ).toBeVisible();
    expect(probe.mutations).toEqual([]);
    expect(probe.socketRequests).toEqual([]);
    expect(probe.websocketUrls).toEqual([]);
  });

  test("a pending Deck response does not mount demo, canvas, socket, or mutation hooks", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      label: "trust-deck-pending",
    });
    const probe = observeTrustBoundary(page);
    let pendingDeckRoute: Route | null = null;

    await page.route(
      `**/api/v1/projects/${project.projectId}/deck`,
      (route) => {
        pendingDeckRoute = route;
      },
    );

    try {
      await page.goto(`/project/${project.projectId}`, {
        waitUntil: "domcontentloaded",
      });
      await expect.poll(() => pendingDeckRoute !== null).toBe(true);

      await expectNoDemoOrCanvas(page);
      await expect(page.getByRole("status")).toContainText(/불러오는 중/);
      expect(probe.mutations).toEqual([]);
      expect(probe.socketRequests).toEqual([]);
      expect(probe.websocketUrls).toEqual([]);
    } finally {
      await pendingDeckRoute?.abort().catch(() => undefined);
    }
  });

  for (const role of ["owner", "editor"] as const) {
    test(`a ${role} creates the first slide with exactly one explicit PUT`, async ({
      browser,
      page: ownerPage,
    }, testInfo) => {
      const { project } = await createAuthenticatedProject(ownerPage, {
        label: `trust-empty-${role}`,
      });
      let context: BrowserContext | null = null;
      let actorPage = ownerPage;

      if (role === "editor") {
        const isolated = await createIsolatedPage(browser, testInfo);
        context = isolated.context;
        actorPage = isolated.page;
        await addAuthenticatedProjectMember(ownerPage, actorPage, {
          label: "trust-empty-editor-member",
          projectId: project.projectId,
          role,
        });
      }

      try {
        const probe = observeTrustBoundary(actorPage);
        await actorPage.goto(`/project/${project.projectId}`);

        await expect(
          actorPage.getByRole("button", { name: "첫 슬라이드 만들기" }),
        ).toBeVisible();
        expect(projectDeckMutations(probe, project.projectId)).toEqual([]);

        await actorPage
          .getByRole("button", { name: "첫 슬라이드 만들기" })
          .click();

        const createdDeckPutCount = () =>
          projectDeckMutations(probe, project.projectId).length;
        await expect.poll(createdDeckPutCount).toBe(1);
        expect(
          projectDeckMutations(probe, project.projectId)[0]?.method(),
        ).toBe("PUT");
        await expect(actorPage.getByLabel("Presentation editor")).toBeVisible();
        await expect(
          actorPage.getByTestId("editor-canvas-stage"),
        ).toBeVisible();
      } finally {
        await context?.close();
      }
    });
  }

  test("a Viewer sees a read-only empty state and never creates the first slide", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const { project } = await createAuthenticatedProject(ownerPage, {
      label: "trust-empty-viewer-owner",
    });
    const { context, page } = await createIsolatedPage(browser, testInfo);

    try {
      await addAuthenticatedProjectMember(ownerPage, page, {
        label: "trust-empty-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      const probe = observeTrustBoundary(page);
      await page.goto(`/project/${project.projectId}`);

      await expect(page.getByText("아직 발표 자료가 없습니다.")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "첫 슬라이드 만들기" }),
      ).toHaveCount(0);
      await expectNoDemoOrCanvas(page);
      expect(projectDeckMutations(probe, project.projectId)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("a Viewer can read notes, Brief, and History with zero editor mutations", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const sourceDeck = createDemoDeck();
    const { deck, project } = await createAuthenticatedProject(ownerPage, {
      deck: sourceDeck,
      label: "trust-readonly-owner",
    });
    await seedPresentationBrief(ownerPage, project.projectId);
    const { context, page } = await createIsolatedPage(browser, testInfo);

    try {
      await addAuthenticatedProjectMember(ownerPage, page, {
        label: "trust-readonly-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      const probe = observeTrustBoundary(page);

      await page.goto(`/project/${project.projectId}`);
      await expect(page.getByText(/보기 전용/).first()).toBeVisible();
      await expect(page.getByText(deck!.slides[0]!.speakerNotes)).toBeVisible();
      await expect(page.locator("[contenteditable='true']")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "리허설" })).toBeVisible();
      for (const name of [
        "저장",
        "공유",
        "발표하기",
        "발표 메뉴 열기",
      ] as const) {
        await expect(
          page.getByRole("button", { name, exact: true }),
        ).toHaveCount(0);
      }

      const hiddenMutationAccepted = await page.evaluate(() => {
        const editorWindow = window as typeof window & {
          __ORBIT_EDITOR_TEST_API__?: {
            updateCurrentSlideStyle: (style: {
              backgroundColor: string;
            }) => boolean;
          };
        };
        return (
          editorWindow.__ORBIT_EDITOR_TEST_API__?.updateCurrentSlideStyle({
            backgroundColor: "#fef3c7",
          }) ?? false
        );
      });
      expect(hiddenMutationAccepted).toBe(false);
      await page.keyboard.press("Delete");
      await page.keyboard.press("Control+D");

      await page.goto(`/project/${project.projectId}/brief`);
      await expect(page.getByText(/보기 전용/).first()).toBeVisible();
      await expect(page.getByText("다음 분기 실행 예산 승인")).toBeVisible();
      await expect(
        page.locator("input:not([type='hidden']), textarea"),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: /저장/ })).toHaveCount(0);

      await page.goto(`/project/${project.projectId}/history`);
      await expect(page.getByText(/보기 전용/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /복원/ })).toHaveCount(0);

      expect(probe.mutations).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("a Viewer cannot create a presentation session through the direct route", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const { project } = await createAuthenticatedProject(ownerPage, {
      deck: createDemoDeck(),
      label: "trust-presentation-owner",
    });
    const { context, page } = await createIsolatedPage(browser, testInfo);

    try {
      await addAuthenticatedProjectMember(ownerPage, page, {
        label: "trust-presentation-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      const probe = observeTrustBoundary(page);

      await page.goto(`/presentation/${project.projectId}`);
      await expect(page.getByText(/보기 전용/).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: /발표.*시작/ }),
      ).toHaveCount(0);
      expect(presentationSessionMutations(probe)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("a Viewer enters creator-owned rehearsal without flushing the Deck", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const { project } = await createAuthenticatedProject(ownerPage, {
      deck: createDemoDeck(),
      label: "trust-rehearsal-owner",
    });
    const { context, page } = await createIsolatedPage(browser, testInfo);
    const snapshotRequests: Array<Record<string, unknown>> = [];
    const uploadPurposeByFileId = new Map<string, string>();
    let nextFileNumber = 0;
    const baseURL =
      typeof testInfo.project.use.baseURL === "string"
        ? testInfo.project.use.baseURL
        : "http://127.0.0.1:5173";

    try {
      const viewer = await addAuthenticatedProjectMember(ownerPage, page, {
        label: "trust-rehearsal-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      await page.route("**/assets/upload-url", async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        snapshotRequests.push(body);
        const fileId = `file_e2e_snapshot_${++nextFileNumber}`;
        uploadPurposeByFileId.set(fileId, String(body.purpose));
        await route.fulfill({
          json: {
            expiresAt: "2099-01-01T00:00:00.000Z",
            fileId,
            headers: { "content-type": body.mimeType },
            method: "PUT",
            projectId: project.projectId,
            purpose: body.purpose,
            uploadUrl: `${baseURL}/__e2e-upload/${fileId}`,
          },
        });
      });
      await page.route("**/__e2e-upload/*", (route) =>
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
            projectId: project.projectId,
            purpose: uploadPurposeByFileId.get(fileId),
            size: 4,
            url: `/api/v1/projects/${project.projectId}/assets/${fileId}/content`,
          },
        });
      });
      const probe = observeTrustBoundary(page);

      await page.goto(`/project/${project.projectId}`);
      await page.getByRole("button", { name: "리허설" }).click();

      await expect(page).toHaveURL(
        new RegExp(`/rehearsal/${project.projectId}\\?snapshotPreparationId=`),
      );
      await expect(page.getByLabel("리허설 시작 전")).toBeVisible();
      await expect
        .poll(
          () =>
            snapshotRequests.filter(
              (request) => request.purpose === "rehearsal-slide-snapshot",
            ).length,
        )
        .toBeGreaterThan(0);
      expect(projectDeckMutations(probe, project.projectId)).toEqual([]);

      const meResponse = await page.request.get("/api/v1/auth/me");
      expect(meResponse.ok()).toBe(true);
      const me = (await meResponse.json()) as { user: { userId: string } };
      expect(me.user.userId).toBe(viewer.user.userId);
    } finally {
      await context.close();
    }
  });

  test("save failure retries the identical pending patch and exposes recovery", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createDemoDeck(),
      label: "trust-save-retry",
    });
    const patchBodies: string[] = [];
    let patchAttempts = 0;

    await page.route(
      `**/api/v1/projects/${project.projectId}/deck/patches`,
      async (route) => {
        patchAttempts += 1;
        patchBodies.push(route.request().postData() ?? "");
        if (patchAttempts === 1) {
          await route.fulfill({
            body: JSON.stringify({ message: "retryable save failure" }),
            contentType: "application/json",
            status: 500,
          });
          return;
        }
        await route.continue();
      },
    );

    await page.goto(`/project/${project.projectId}`);
    await expect(page.getByLabel("Presentation editor")).toBeVisible();
    const mutationAccepted = await page.evaluate(() => {
      const editorWindow = window as typeof window & {
        __ORBIT_EDITOR_TEST_API__?: {
          updateCurrentSlideStyle: (style: {
            backgroundColor: string;
          }) => boolean;
        };
      };
      return (
        editorWindow.__ORBIT_EDITOR_TEST_API__?.updateCurrentSlideStyle({
          backgroundColor: "#fef3c7",
        }) ?? false
      );
    });
    expect(mutationAccepted).toBe(true);

    await expect(page.getByRole("alert")).toContainText(/저장 실패|retryable/);
    await page.getByRole("button", { name: /다시 시도/ }).click();

    await expect.poll(() => patchAttempts).toBe(2);
    expect(patchBodies[1]).toBe(patchBodies[0]);
    await expect(page.getByText("모두 저장됨", { exact: true })).toBeVisible();
    await expect(page.getByText(/최근 저장|마지막 저장/).first()).toBeVisible();
  });
});
