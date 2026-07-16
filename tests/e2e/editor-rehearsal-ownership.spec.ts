import type {
  AssetUploadUrlResponse,
  RehearsalRun,
  UploadedFile,
} from "@orbit/shared";
import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

import {
  addAuthenticatedProjectMember,
  createAuthenticatedProject,
} from "./authenticatedProject";
import {
  createIsolatedE2ePage,
  createSnapshotSafeEditorDeck,
} from "./editorFixtures";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==",
  "base64",
);
const audioBytes = Buffer.from("orbit-e2e-audio");

type ActorPage = {
  context: BrowserContext | null;
  label: string;
  page: Page;
};

async function parseJson<T>(response: APIResponse | Response): Promise<T> {
  const text = await response.text();
  expect(response.ok(), text).toBe(true);
  return JSON.parse(text) as T;
}

async function expectStatus(
  responsePromise: Promise<APIResponse>,
  status: number,
) {
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(status);
}

async function uploadToLocalProxy(
  page: Page,
  upload: AssetUploadUrlResponse,
  body: Buffer,
) {
  const target = new URL(upload.uploadUrl);
  const requestUrl = target.pathname.startsWith("/api/")
    ? `${target.pathname}${target.search}`
    : upload.uploadUrl;
  const response = await page.request.fetch(requestUrl, {
    data: body,
    headers: upload.headers,
    method: upload.method,
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function createRun(
  page: Page,
  projectId: string,
  body: Record<string, unknown>,
) {
  return parseJson<{ run: RehearsalRun }>(
    await page.request.post(
      `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsals`,
      { data: body },
    ),
  );
}

async function createAudioUpload(page: Page, runId: string) {
  return parseJson<{ run: RehearsalRun; upload: AssetUploadUrlResponse }>(
    await page.request.post(
      `/api/v1/rehearsals/${encodeURIComponent(runId)}/audio/upload-url`,
      {
        data: {
          mimeType: "audio/webm",
          originalName: "ownership-e2e.webm",
          size: audioBytes.byteLength,
        },
      },
    ),
  );
}

function snapshotContentPath(projectId: string, fileId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsal-slide-snapshots/${encodeURIComponent(fileId)}/content`;
}

function genericContentPath(projectId: string, fileId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(fileId)}/content`;
}

async function installNavigationRecorder(page: Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __ORBIT_OWNERSHIP_NAVIGATIONS__?: string[];
    };
    target.__ORBIT_OWNERSHIP_NAVIGATIONS__ = [];
    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = (...args: Parameters<History["pushState"]>) => {
      const url = args[2];
      if (url !== undefined && url !== null) {
        target.__ORBIT_OWNERSHIP_NAVIGATIONS__?.push(String(url));
      }
      return originalPushState(...args);
    };
  });
}

async function rehearsalNavigationCount(page: Page, projectId: string) {
  return page.evaluate((expectedPathname) => {
    const target = window as typeof window & {
      __ORBIT_OWNERSHIP_NAVIGATIONS__?: string[];
    };
    return (target.__ORBIT_OWNERSHIP_NAVIGATIONS__ ?? []).filter(
      (url) =>
        new URL(url, window.location.origin).pathname === expectedPathname,
    ).length;
  }, `/rehearsal/${projectId}`);
}

test.describe("Editor rehearsal creator ownership", () => {
  test("Viewer A owns the real snapshot and audio lifecycle while every other project role receives 404", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    test.slow();
    const { deck, project } = await createAuthenticatedProject(ownerPage, {
      deck: createSnapshotSafeEditorDeck(),
      label: "ownership-owner",
    });
    if (!deck) throw new Error("Snapshot-safe Deck was not created.");

    const isolatedActors = await Promise.all(
      [
        { label: "ownership-editor", role: "editor" as const },
        { label: "ownership-viewer-a", role: "viewer" as const },
        { label: "ownership-viewer-b", role: "viewer" as const },
      ].map(async ({ label, role }) => {
        const isolated = await createIsolatedE2ePage(browser, testInfo);
        await addAuthenticatedProjectMember(ownerPage, isolated.page, {
          label,
          projectId: project.projectId,
          role,
        });
        return { ...isolated, label };
      }),
    );
    const [editor, viewerA, viewerB] = isolatedActors;

    try {
      const snapshotUploadRequest = viewerA.page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          request.method() === "POST" &&
          url.pathname.endsWith("/assets/upload-url")
        );
      });
      const snapshotCompleteResponse = viewerA.page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "POST" &&
            url.pathname.endsWith("/assets/complete") &&
            response.ok()
          );
        },
      );

      await viewerA.page.goto(`/project/${project.projectId}`);
      await expect(
        viewerA.page.getByLabel("Presentation editor"),
      ).toBeVisible();
      await viewerA.page.getByRole("button", { name: "리허설" }).click();

      const uploadRequestBody = (
        await snapshotUploadRequest
      ).postDataJSON() as {
        purpose: string;
      };
      const snapshot = await parseJson<UploadedFile>(
        await snapshotCompleteResponse,
      );
      expect(uploadRequestBody.purpose).toBe("rehearsal-slide-snapshot");
      expect(snapshot).toMatchObject({
        projectId: project.projectId,
        purpose: "rehearsal-slide-snapshot",
        url: snapshotContentPath(project.projectId, snapshot.fileId),
      });
      await expect(viewerA.page).toHaveURL(
        new RegExp(`/rehearsal/${project.projectId}\\?snapshotPreparationId=`),
      );

      const ownSnapshotResponse = await viewerA.page.request.get(
        snapshotContentPath(project.projectId, snapshot.fileId),
      );
      expect(ownSnapshotResponse.status()).toBe(200);
      expect(ownSnapshotResponse.headers()["content-type"]).toContain(
        "image/png",
      );
      expect(ownSnapshotResponse.headers()["cache-control"]).toBe(
        "private, no-store",
      );
      expect(ownSnapshotResponse.headers()["x-content-type-options"]).toBe(
        "nosniff",
      );
      expect((await ownSnapshotResponse.body()).byteLength).toBeGreaterThan(0);
      await expectStatus(
        viewerA.page.request.get(
          genericContentPath(project.projectId, snapshot.fileId),
        ),
        404,
      );

      const { run } = await createRun(viewerA.page, project.projectId, {
        deckId: deck.deckId,
        expectedDeckVersion: deck.version,
        semanticEvaluationMode: "full",
        slideSnapshots: [
          { fileId: snapshot.fileId, slideId: deck.slides[0]!.slideId },
        ],
      });
      expect(run.evaluationSnapshot?.slides[0]?.thumbnailUrl).toBe(
        snapshotContentPath(project.projectId, snapshot.fileId),
      );

      const ownRunResponse = await viewerA.page.request.get(
        `/api/v1/rehearsals/${encodeURIComponent(run.runId)}`,
      );
      expect(ownRunResponse.status()).toBe(200);
      const ownReportResponse = await viewerA.page.request.get(
        `/api/v1/rehearsals/${encodeURIComponent(run.runId)}/report`,
      );
      expect(ownReportResponse.status()).toBe(200);

      const audio = await createAudioUpload(viewerA.page, run.runId);
      await uploadToLocalProxy(viewerA.page, audio.upload, audioBytes);
      const completedAudio = await parseJson<{ run: RehearsalRun }>(
        await viewerA.page.request.post(
          `/api/v1/rehearsals/${encodeURIComponent(run.runId)}/audio/complete`,
          { data: { fileId: audio.upload.fileId } },
        ),
      );
      expect(completedAudio.run.audioFileId).toBe(audio.upload.fileId);
      await expectStatus(
        viewerA.page.request.get(
          genericContentPath(project.projectId, audio.upload.fileId),
        ),
        404,
      );

      const otherActors: ActorPage[] = [
        { context: null, label: "owner", page: ownerPage },
        editor,
        viewerB,
      ];
      for (const actor of otherActors) {
        await expectStatus(
          actor.page.request.get(
            `/api/v1/rehearsals/${encodeURIComponent(run.runId)}`,
          ),
          404,
        );
        await expectStatus(
          actor.page.request.get(
            `/api/v1/rehearsals/${encodeURIComponent(run.runId)}/report`,
          ),
          404,
        );
        await expectStatus(
          actor.page.request.get(
            snapshotContentPath(project.projectId, snapshot.fileId),
          ),
          404,
        );
      }

      for (const actor of [
        { context: null, label: "owner", page: ownerPage },
        editor,
        viewerA,
        viewerB,
      ] satisfies ActorPage[]) {
        const assets = await parseJson<UploadedFile[]>(
          await actor.page.request.get(
            `/api/v1/projects/${encodeURIComponent(project.projectId)}/assets`,
          ),
        );
        expect(
          assets.some(
            (asset) =>
              asset.fileId === snapshot.fileId ||
              asset.fileId === audio.upload.fileId,
          ),
          actor.label,
        ).toBe(false);
      }

      await expectStatus(
        ownerPage.request.post(
          `/api/v1/projects/${encodeURIComponent(project.projectId)}/assets/upload-url`,
          {
            data: {
              mimeType: "audio/webm",
              originalName: "generic-audio.webm",
              purpose: "rehearsal-audio",
              size: audioBytes.byteLength,
            },
          },
        ),
        400,
      );

      const ownerRun = (
        await createRun(ownerPage, project.projectId, {
          deckId: deck.deckId,
          semanticEvaluationMode: "delivery-only",
        })
      ).run;
      const ownerAudio = await createAudioUpload(ownerPage, ownerRun.runId);
      await uploadToLocalProxy(ownerPage, ownerAudio.upload, audioBytes);
      await expectStatus(
        ownerPage.request.post(
          `/api/v1/projects/${encodeURIComponent(project.projectId)}/assets/complete`,
          { data: { fileId: ownerAudio.upload.fileId } },
        ),
        404,
      );
    } finally {
      await Promise.all(isolatedActors.map(({ context }) => context.close()));
    }
  });

  test("a failed snapshot asset load sends no upload, run, or audio request and a retry succeeds once", async ({
    browser,
    page: ownerPage,
  }, testInfo: TestInfo) => {
    test.slow();
    const sourceDeck = createSnapshotSafeEditorDeck();
    sourceDeck.slides[0]!.style.backgroundImage = {
      alt: "retry fixture",
      fit: "cover",
      opacity: 0,
      src: "/__e2e-snapshot-retry.png",
    };
    const { project } = await createAuthenticatedProject(ownerPage, {
      deck: sourceDeck,
      label: "snapshot-retry-owner",
    });
    const viewer = await createIsolatedE2ePage(browser, testInfo);

    try {
      await addAuthenticatedProjectMember(ownerPage, viewer.page, {
        label: "snapshot-retry-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      let imageAvailable = false;
      await viewer.page.route("**/__e2e-snapshot-retry.png", (route) =>
        route.fulfill(
          imageAvailable
            ? { body: tinyPng, contentType: "image/png", status: 200 }
            : { body: "missing", status: 404 },
        ),
      );
      const apiRequests: Request[] = [];
      viewer.page.on("request", (request) => {
        const pathname = new URL(request.url()).pathname;
        if (
          request.method() === "POST" &&
          (pathname.endsWith("/assets/upload-url") ||
            pathname.endsWith("/rehearsals") ||
            pathname.includes("/audio/"))
        ) {
          apiRequests.push(request);
        }
      });

      await installNavigationRecorder(viewer.page);
      await viewer.page.goto(`/project/${project.projectId}`);
      await expect(viewer.page.getByLabel("Presentation editor")).toBeVisible();
      await viewer.page.getByRole("button", { name: "리허설" }).click();
      await expect(viewer.page.getByRole("alert")).toContainText(
        /슬라이드 이미지 1개를 불러오지 못했습니다/,
      );
      await expect(viewer.page).toHaveURL(`/project/${project.projectId}`);
      expect(apiRequests).toEqual([]);
      expect(
        await rehearsalNavigationCount(viewer.page, project.projectId),
      ).toBe(0);

      imageAvailable = true;
      const completeResponse = viewer.page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/assets/complete") &&
          response.ok(),
      );
      await viewer.page.getByRole("button", { name: "리허설" }).click();
      const snapshot = await parseJson<UploadedFile>(await completeResponse);
      await expect(viewer.page).toHaveURL(
        new RegExp(`/rehearsal/${project.projectId}\\?snapshotPreparationId=`),
      );
      expect(
        apiRequests.filter((request) =>
          new URL(request.url()).pathname.endsWith("/assets/upload-url"),
        ),
      ).toHaveLength(1);
      expect(
        apiRequests.filter((request) =>
          new URL(request.url()).pathname.endsWith("/rehearsals"),
        ),
      ).toHaveLength(0);
      expect(
        apiRequests.filter((request) =>
          new URL(request.url()).pathname.includes("/audio/"),
        ),
      ).toHaveLength(0);
      expect(snapshot.url).toBe(
        snapshotContentPath(project.projectId, snapshot.fileId),
      );
      expect(
        await rehearsalNavigationCount(viewer.page, project.projectId),
      ).toBe(1);
    } finally {
      await viewer.context.close();
    }
  });
});
