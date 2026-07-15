import { createDemoDeck } from "@orbit/editor-core";
import type { DeckPatch } from "@orbit/shared";
import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";

import {
  addAuthenticatedProjectMember,
  createAuthenticatedProject,
} from "./authenticatedProject";

const canvasWidth = 1920;
const canvasHeight = 1080;
const primaryModifier = process.platform === "darwin" ? "Meta" : "Control";

type ElementFrameSnapshot = {
  elementId: string;
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

type DeckMutationProbe = {
  deckPuts: Request[];
  patchRequests: Request[];
};

function projectDeckPath(projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/deck`;
}

function isDeckPatchRequest(request: Request, projectId: string) {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === `${projectDeckPath(projectId)}/patches`
  );
}

function readDeckPatch(request: Request) {
  try {
    const body = request.postDataJSON() as { patch?: DeckPatch } | null;
    return body?.patch ?? null;
  } catch {
    return null;
  }
}

function observeDeckMutations(
  page: Page,
  projectId: string,
): DeckMutationProbe {
  const probe: DeckMutationProbe = {
    deckPuts: [],
    patchRequests: [],
  };

  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (isDeckPatchRequest(request, projectId)) {
      probe.patchRequests.push(request);
      return;
    }

    if (request.method() === "PUT" && path === projectDeckPath(projectId)) {
      probe.deckPuts.push(request);
    }
  });

  return probe;
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

async function openEditor(page: Page, projectId: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/project/${projectId}`);
  await expect(page.getByLabel("Presentation editor")).toBeVisible();
  await expect(page.getByTestId("editor-stage-shell")).toBeVisible();
  await settleEditorLayout(page);
}

function zoomControl(page: Page) {
  return page.getByRole("group", { name: "캔버스 확대/축소", exact: true });
}

function zoomOutput(page: Page) {
  return zoomControl(page).getByLabel("현재 확대/축소", { exact: true });
}

async function clickZoomInUntil(page: Page, expected: string) {
  const output = zoomOutput(page);
  const zoomIn = zoomControl(page).getByRole("button", {
    name: "캔버스 확대",
    exact: true,
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await output.textContent())?.trim() === expected) return;
    await zoomIn.click();
  }

  await expect(output).toHaveText(expected);
}

async function expectStageSize(page: Page, width: number, height: number) {
  await expect
    .poll(async () => {
      await settleEditorLayout(page);
      const box = await page.getByTestId("editor-stage-shell").boundingBox();
      return box
        ? {
            height: Math.round(box.height),
            width: Math.round(box.width),
          }
        : null;
    })
    .toEqual({ height, width });
}

async function getElementFrame(page: Page, elementId: string) {
  const rawText =
    (await page.getByTestId("editor-elements-debug").textContent()) ?? "[]";
  const elements = JSON.parse(rawText) as ElementFrameSnapshot[];
  const element = elements.find(
    (candidate) => candidate.elementId === elementId,
  );

  if (!element) {
    throw new Error(
      `Unable to find ${elementId} in element debug payload: ${rawText}`,
    );
  }

  return element;
}

async function selectCanvasElement(page: Page, elementId: string) {
  const [stageBox, frame] = await Promise.all([
    page.getByTestId("editor-stage-shell").boundingBox(),
    getElementFrame(page, elementId),
  ]);

  if (!stageBox) {
    throw new Error("Editor stage shell was not rendered.");
  }

  const scale = stageBox.width / canvasWidth;
  await page.mouse.click(
    stageBox.x + (frame.x + 18) * scale,
    stageBox.y + (frame.y + 18) * scale,
  );
  await expect(page.getByTestId("editor-element-quickbar")).toBeVisible();
}

function slideSelectionButton(page: Page, slideId: string) {
  return page
    .getByLabel("슬라이드 목록", { exact: true })
    .locator(`button[data-slide-id="${slideId}"]`);
}

async function armSaveShortcutDefaultProbe(page: Page) {
  await page.evaluate(() => {
    document.documentElement.dataset.e2eSaveShortcutPrevented = "pending";

    function recordSaveShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        document.documentElement.dataset.e2eSaveShortcutPrevented = String(
          event.defaultPrevented,
        );
        window.removeEventListener("keydown", recordSaveShortcut);
      }
    }

    window.addEventListener("keydown", recordSaveShortcut);
  });
}

async function expectSaveShortcutPrevented(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.e2eSaveShortcutPrevented ?? null,
      ),
    )
    .toBe("true");
}

test.describe("P1-2 canvas productivity", () => {
  test("keeps zoom local while 100%, 200%, internal scrolling, and Fit remain deterministic", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createDemoDeck(),
      label: "canvas-productivity-zoom",
    });
    const probe = observeDeckMutations(page, project.projectId);
    await openEditor(page, project.projectId);

    const control = zoomControl(page);
    await expect(control).toBeVisible();
    await control
      .getByRole("button", { name: "100%로 보기", exact: true })
      .click();
    await expect(zoomOutput(page)).toHaveText("100%");
    await expectStageSize(page, canvasWidth, canvasHeight);

    await page.reload();
    await expect(page.getByTestId("editor-stage-shell")).toBeVisible();
    await expect(zoomOutput(page)).toHaveText("100%");
    await expectStageSize(page, canvasWidth, canvasHeight);

    await clickZoomInUntil(page, "200%");
    await expect(
      zoomControl(page).getByRole("button", {
        name: "캔버스 확대",
        exact: true,
      }),
    ).toBeDisabled();
    await expectStageSize(page, canvasWidth * 2, canvasHeight * 2);

    const scrollMetrics = await page
      .getByTestId("editor-canvas-pane")
      .evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        element.scrollTop = element.scrollHeight;
        return {
          clientHeight: element.clientHeight,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          scrollLeft: element.scrollLeft,
          scrollTop: element.scrollTop,
          scrollWidth: element.scrollWidth,
        };
      });
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(
      scrollMetrics.clientWidth,
    );
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(
      scrollMetrics.clientHeight,
    );
    expect(scrollMetrics.scrollLeft).toBeGreaterThan(0);
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);

    const documentOverflow = await page.evaluate(() => ({
      contentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ),
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(documentOverflow.contentWidth).toBeLessThanOrEqual(
      documentOverflow.viewportWidth,
    );

    await zoomControl(page)
      .getByRole("button", { name: "캔버스에 맞추기", exact: true })
      .click();
    await settleEditorLayout(page);

    const fitGeometry = await page
      .getByTestId("editor-canvas-pane")
      .evaluate((pane) => {
        const stage = pane.querySelector<HTMLElement>(
          '[data-testid="editor-stage-shell"]',
        );
        if (!stage) return null;
        const paneRect = pane.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        return {
          centerDeltaX: Math.abs(
            stageRect.left +
              stageRect.width / 2 -
              (paneRect.left + pane.clientLeft + pane.clientWidth / 2),
          ),
          centerDeltaY: Math.abs(
            stageRect.top +
              stageRect.height / 2 -
              (paneRect.top + pane.clientTop + pane.clientHeight / 2),
          ),
          fitsHeight: stageRect.height <= pane.clientHeight,
          fitsWidth: stageRect.width <= pane.clientWidth,
        };
      });
    expect(fitGeometry).not.toBeNull();
    expect(fitGeometry?.fitsWidth).toBe(true);
    expect(fitGeometry?.fitsHeight).toBe(true);
    expect(fitGeometry?.centerDeltaX).toBeLessThanOrEqual(2);
    expect(fitGeometry?.centerDeltaY).toBeLessThanOrEqual(2);
    expect(probe.patchRequests).toEqual([]);
    expect(probe.deckPuts).toEqual([]);
  });

  test("nudges one selected element with one patch and one Undo/Redo entry", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createDemoDeck(),
      label: "canvas-productivity-nudge",
    });
    const probe = observeDeckMutations(page, project.projectId);
    await openEditor(page, project.projectId);
    await selectCanvasElement(page, "el_3");

    const initialFrame = await getElementFrame(page, "el_3");
    const patchResponsePromise = page.waitForResponse((response) =>
      isDeckPatchRequest(response.request(), project.projectId),
    );
    await page.keyboard.press("ArrowRight");
    const patchResponse = await patchResponsePromise;
    expect(patchResponse.ok(), await patchResponse.text()).toBe(true);

    await expect
      .poll(async () => (await getElementFrame(page, "el_3")).x)
      .toBe(initialFrame.x + 1);
    expect(probe.patchRequests).toHaveLength(1);
    expect(readDeckPatch(probe.patchRequests[0]!)).toMatchObject({
      source: "user",
      operations: [
        {
          elementId: "el_3",
          frame: { x: initialFrame.x + 1, y: initialFrame.y },
          type: "update_element_frame",
        },
      ],
    });

    const undoButton = page.getByRole("button", {
      name: "실행 취소",
      exact: true,
    });
    const redoButton = page.getByRole("button", {
      name: "다시 실행",
      exact: true,
    });
    await undoButton.click();
    await expect
      .poll(async () => (await getElementFrame(page, "el_3")).x)
      .toBe(initialFrame.x);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeEnabled();

    await redoButton.click();
    await expect
      .poll(async () => (await getElementFrame(page, "el_3")).x)
      .toBe(initialFrame.x + 1);
    await expect(redoButton).toBeDisabled();
    expect(probe.patchRequests).toHaveLength(1);
  });

  test("suppresses canvas nudge while an editor input owns focus", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createDemoDeck(),
      label: "canvas-productivity-input",
    });
    const probe = observeDeckMutations(page, project.projectId);
    await openEditor(page, project.projectId);
    await selectCanvasElement(page, "el_3");
    const initialFrame = await getElementFrame(page, "el_3");

    const rotationInput = page
      .getByTestId("editor-element-quickbar")
      .getByLabel("회전", { exact: true });
    await rotationInput.focus();
    await expect(rotationInput).toBeFocused();
    await rotationInput.press("ArrowRight");
    await settleEditorLayout(page);

    expect(await getElementFrame(page, "el_3")).toEqual(initialFrame);
    expect(probe.patchRequests).toEqual([]);
    expect(probe.deckPuts).toEqual([]);
  });

  test("handles Page navigation and prevents the browser save shortcut for an owner", async ({
    page,
  }) => {
    const { deck, project } = await createAuthenticatedProject(page, {
      deck: createDemoDeck(),
      label: "canvas-productivity-owner-commands",
    });
    await openEditor(page, project.projectId);
    const firstSlideId = deck!.slides[0]!.slideId;
    const secondSlideId = deck!.slides[1]!.slideId;
    const canvasPane = page.getByTestId("editor-canvas-pane");

    await canvasPane.focus();
    await page.keyboard.press("PageDown");
    await expect(slideSelectionButton(page, secondSlideId)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("PageUp");
    await expect(slideSelectionButton(page, firstSlideId)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const lastSavedAt = page.getByLabel("마지막 저장 시각", { exact: true });
    await expect(lastSavedAt).toHaveText("불러온 파일");
    await armSaveShortcutDefaultProbe(page);
    await page.keyboard.press(`${primaryModifier}+S`);
    await expectSaveShortcutPrevented(page);
    await expect(lastSavedAt).toContainText("마지막 저장");
  });

  test("lets an accepted Viewer zoom and navigate while every mutation shortcut stays local", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const { deck, project } = await createAuthenticatedProject(ownerPage, {
      deck: createDemoDeck(),
      label: "canvas-productivity-viewer-owner",
    });
    const { context, page } = await createIsolatedPage(browser, testInfo);

    try {
      await addAuthenticatedProjectMember(ownerPage, page, {
        label: "canvas-productivity-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      const probe = observeDeckMutations(page, project.projectId);
      await openEditor(page, project.projectId);

      await expect(
        page.getByRole("button", { name: "저장", exact: true }),
      ).toHaveCount(0);
      await zoomControl(page)
        .getByRole("button", { name: "100%로 보기", exact: true })
        .click();
      await expect(zoomOutput(page)).toHaveText("100%");

      const firstSlideId = deck!.slides[0]!.slideId;
      const secondSlideId = deck!.slides[1]!.slideId;
      await page.getByTestId("editor-canvas-pane").focus();
      await page.keyboard.press("PageDown");
      await expect(slideSelectionButton(page, secondSlideId)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.keyboard.press("PageUp");
      await expect(slideSelectionButton(page, firstSlideId)).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Delete");
      await page.keyboard.press(`${primaryModifier}+D`);
      await armSaveShortcutDefaultProbe(page);
      await page.keyboard.press(`${primaryModifier}+S`);
      await expectSaveShortcutPrevented(page);
      await settleEditorLayout(page);

      expect(probe.patchRequests).toEqual([]);
      expect(probe.deckPuts).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
