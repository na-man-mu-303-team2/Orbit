import { createDemoDeck } from "@orbit/editor-core";
import type { Deck, DeckPatch } from "@orbit/shared";
import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

import {
  addAuthenticatedProjectMember,
  createAuthenticatedProject,
} from "./authenticatedProject";

type SlideOperationType = "add_slide" | "delete_slide" | "reorder_slides";

type CapturedPatch = {
  patch: DeckPatch;
  request: Request;
};

type DeckPersistenceProbe = {
  deckPuts: Request[];
  userPatches: CapturedPatch[];
};

function createSlideRailDeck(): Deck {
  const deck = structuredClone(createDemoDeck());
  deck.slides.push({
    slideId: "slide_3",
    order: 3,
    title: "Closing",
    thumbnailUrl: "",
    style: {
      layout: "closing",
      backgroundColor: deck.theme.backgroundColor,
      textColor: deck.theme.textColor,
      accentColor: deck.theme.accentColor,
    },
    speakerNotes: "마지막 슬라이드입니다.",
    elements: [],
    keywords: [],
    semanticCues: [],
    animations: [],
    actions: [],
  });
  return deck;
}

function projectDeckPath(projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/deck`;
}

function readPatch(request: Request): DeckPatch | null {
  try {
    const body = request.postDataJSON() as { patch?: DeckPatch } | null;
    return body?.patch ?? null;
  } catch {
    return null;
  }
}

function isUserSlidePatchRequest(
  request: Request,
  projectId: string,
  operationType?: SlideOperationType,
) {
  const url = new URL(request.url());
  if (
    request.method() !== "POST" ||
    url.pathname !== `${projectDeckPath(projectId)}/patches`
  ) {
    return false;
  }

  const patch = readPatch(request);
  return Boolean(
    patch &&
    patch.source === "user" &&
    (!operationType ||
      patch.operations.some((operation) => operation.type === operationType)),
  );
}

function observeDeckPersistence(
  page: Page,
  projectId: string,
): DeckPersistenceProbe {
  const probe: DeckPersistenceProbe = {
    deckPuts: [],
    userPatches: [],
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "PUT" &&
      url.pathname === projectDeckPath(projectId)
    ) {
      probe.deckPuts.push(request);
      return;
    }

    if (!isUserSlidePatchRequest(request, projectId)) return;
    const patch = readPatch(request);
    if (patch) probe.userPatches.push({ patch, request });
  });

  return probe;
}

function waitForUserPatchResponse(
  page: Page,
  projectId: string,
  operationType: SlideOperationType,
  options: { timeout?: number } = {},
) {
  return page.waitForResponse(
    (response) =>
      isUserSlidePatchRequest(response.request(), projectId, operationType),
    options,
  );
}

function waitForDeckPutResponse(page: Page, projectId: string) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "PUT" &&
      new URL(request.url()).pathname === projectDeckPath(projectId)
    );
  });
}

async function expectSuccessfulResponse(response: Response) {
  expect(response.ok(), await response.text()).toBe(true);
}

async function fetchPersistedDeck(page: Page, projectId: string) {
  const response = await page.request.get(projectDeckPath(projectId));
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { deck: Deck }).deck;
}

async function expectPersistedSlideOrder(
  page: Page,
  projectId: string,
  expectedSlideIds: string[],
) {
  await expect
    .poll(
      async () =>
        (await fetchPersistedDeck(page, projectId)).slides.map(
          (slide) => slide.slideId,
        ),
      { message: "서버에 저장된 슬라이드 순서가 일치해야 합니다." },
    )
    .toEqual(expectedSlideIds);
}

function slideRail(page: Page) {
  return page.getByLabel("슬라이드 목록", { exact: true });
}

function slideSelectionButton(page: Page, slideId: string) {
  return slideRail(page).locator(`button[data-slide-id="${slideId}"]`);
}

async function getRailSlideIds(page: Page) {
  return slideRail(page)
    .locator("button[data-slide-id]")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-slide-id")),
    );
}

async function expectRailSlideOrder(page: Page, expectedSlideIds: string[]) {
  await expect.poll(() => getRailSlideIds(page)).toEqual(expectedSlideIds);
}

async function openSlideMenu(page: Page, title: string) {
  const menuButton = page.getByRole("button", {
    name: `${title} 메뉴`,
    exact: true,
  });
  await menuButton.click();
  return menuButton;
}

function slideMenuAction(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function slideOperationCount(
  probe: DeckPersistenceProbe,
  operationType: SlideOperationType,
) {
  return probe.userPatches.filter(({ patch }) =>
    patch.operations.some((operation) => operation.type === operationType),
  ).length;
}

function getOnlySlideOperation(
  probe: DeckPersistenceProbe,
  operationType: SlideOperationType,
) {
  const matchingPatches = probe.userPatches.filter(({ patch }) =>
    patch.operations.some((operation) => operation.type === operationType),
  );
  expect(matchingPatches).toHaveLength(1);

  const operation = matchingPatches[0]?.patch.operations.find(
    (candidate) => candidate.type === operationType,
  );
  if (!operation) {
    throw new Error(`${operationType} operation was not captured.`);
  }
  return operation;
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

test.describe("P0-3 slide rail persistence", () => {
  test("duplicates a slide immediately after its source and persists it across reload", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createSlideRailDeck(),
      label: "slide-rail-duplicate",
    });
    const probe = observeDeckPersistence(page, project.projectId);
    await page.goto(`/project/${project.projectId}`);
    await expect(slideRail(page)).toBeVisible();

    await openSlideMenu(page, "Opening");
    const patchResponsePromise = waitForUserPatchResponse(
      page,
      project.projectId,
      "add_slide",
    );
    await slideMenuAction(page, "복제").click();
    await expectSuccessfulResponse(await patchResponsePromise);

    const operation = getOnlySlideOperation(probe, "add_slide");
    expect(operation.type).toBe("add_slide");
    if (operation.type !== "add_slide") return;

    const duplicateId = operation.slide.slideId;
    const expectedOrder = ["slide_1", duplicateId, "slide_2", "slide_3"];
    expect(operation.slide.title).toBe("Opening 복사본");
    await expectRailSlideOrder(page, expectedOrder);
    await expect(slideSelectionButton(page, duplicateId)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(slideSelectionButton(page, duplicateId)).toHaveAttribute(
      "aria-current",
      /^(page|true)$/,
    );
    await expect(slideSelectionButton(page, duplicateId)).toHaveAccessibleName(
      /Opening 복사본/,
    );

    await expectPersistedSlideOrder(page, project.projectId, expectedOrder);
    const persisted = await fetchPersistedDeck(page, project.projectId);
    expect(persisted.slides[1]).toMatchObject({
      slideId: duplicateId,
      order: 2,
      title: "Opening 복사본",
    });

    await page.reload();
    await expect(slideRail(page)).toBeVisible();
    await expectRailSlideOrder(page, expectedOrder);
    await expect(slideSelectionButton(page, duplicateId)).toHaveAccessibleName(
      /Opening 복사본/,
    );
  });

  test("deletes without confirmation and restores the persisted slide with one Undo", async ({
    page,
  }) => {
    const initialOrder = ["slide_1", "slide_2", "slide_3"];
    const { project } = await createAuthenticatedProject(page, {
      deck: createSlideRailDeck(),
      label: "slide-rail-delete-undo",
    });
    const probe = observeDeckPersistence(page, project.projectId);
    let dialogCount = 0;
    page.on("dialog", async (dialog) => {
      dialogCount += 1;
      await dialog.accept();
    });

    await page.goto(`/project/${project.projectId}`);
    await expect(slideRail(page)).toBeVisible();
    await openSlideMenu(page, "Data Contract");

    const deleteResponsePromise = waitForUserPatchResponse(
      page,
      project.projectId,
      "delete_slide",
    );
    await slideMenuAction(page, "삭제").click();
    await expectSuccessfulResponse(await deleteResponsePromise);

    expect(dialogCount).toBe(0);
    expect(slideOperationCount(probe, "delete_slide")).toBe(1);
    const deleteOperation = getOnlySlideOperation(probe, "delete_slide");
    expect(deleteOperation).toMatchObject({
      slideId: "slide_2",
      type: "delete_slide",
    });
    await expect(
      page.getByText("슬라이드가 삭제되었습니다", { exact: true }),
    ).toBeVisible();
    await expectPersistedSlideOrder(page, project.projectId, [
      "slide_1",
      "slide_3",
    ]);

    const undoPutResponsePromise = waitForDeckPutResponse(
      page,
      project.projectId,
    );
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    await expectSuccessfulResponse(await undoPutResponsePromise);

    expect(probe.deckPuts).toHaveLength(1);
    const undoBody = probe.deckPuts[0]?.postDataJSON() as { deck?: Deck };
    expect(undoBody.deck?.slides.map((slide) => slide.slideId)).toEqual(
      initialOrder,
    );
    await expectPersistedSlideOrder(page, project.projectId, initialOrder);

    await page.reload();
    await expect(slideRail(page)).toBeVisible();
    await expectRailSlideOrder(page, initialOrder);
    await expect(slideSelectionButton(page, "slide_2")).toHaveAccessibleName(
      /Data Contract/,
    );
  });

  test("commits one pointer reorder patch and keeps the order after reload", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createSlideRailDeck(),
      label: "slide-rail-pointer-reorder",
    });
    const probe = observeDeckPersistence(page, project.projectId);
    await page.goto(`/project/${project.projectId}`);
    await expect(slideRail(page)).toBeVisible();

    const handle = page.getByRole("button", {
      name: "Data Contract 드래그하여 이동",
      exact: true,
    });
    const target = slideSelectionButton(page, "slide_3");
    const handleBox = await handle.boundingBox();
    const targetBox = await target.boundingBox();
    if (!handleBox || !targetBox) {
      throw new Error("슬라이드 drag 좌표를 계산하지 못했습니다.");
    }

    const reorderResponsePromise = waitForUserPatchResponse(
      page,
      project.projectId,
      "reorder_slides",
    );
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height * 0.75,
      { steps: 8 },
    );
    await expect(
      slideRail(page).locator(
        '[data-slide-rail-drop-indicator="true"], .slide-rail-drop-indicator',
      ),
    ).toBeVisible();
    await page.mouse.up();
    await expectSuccessfulResponse(await reorderResponsePromise);

    const expectedOrder = ["slide_1", "slide_3", "slide_2"];
    expect(slideOperationCount(probe, "reorder_slides")).toBe(1);
    const reorderOperation = getOnlySlideOperation(probe, "reorder_slides");
    expect(reorderOperation.type).toBe("reorder_slides");
    if (reorderOperation.type === "reorder_slides") {
      expect(
        [...reorderOperation.slideOrders]
          .sort((left, right) => left.order - right.order)
          .map(({ slideId }) => slideId),
      ).toEqual(expectedOrder);
    }
    await expectRailSlideOrder(page, expectedOrder);
    await expectPersistedSlideOrder(page, project.projectId, expectedOrder);

    await page.reload();
    await expect(slideRail(page)).toBeVisible();
    await expectRailSlideOrder(page, expectedOrder);
  });

  test("cancels pointer reorder without mutation and preserves selection", async ({
    page,
  }) => {
    const initialOrder = ["slide_1", "slide_2", "slide_3"];
    const { project } = await createAuthenticatedProject(page, {
      deck: createSlideRailDeck(),
      label: "slide-rail-pointer-cancel",
    });
    const probe = observeDeckPersistence(page, project.projectId);
    await page.goto(`/project/${project.projectId}`);
    await expect(slideRail(page)).toBeVisible();

    const selectedSlide = slideSelectionButton(page, "slide_2");
    await selectedSlide.click();
    await expect(selectedSlide).toHaveAttribute("aria-selected", "true");
    const handle = page.getByRole("button", {
      name: "Data Contract 드래그하여 이동",
      exact: true,
    });
    const target = slideSelectionButton(page, "slide_3");
    const handleBox = await handle.boundingBox();
    const targetBox = await target.boundingBox();
    if (!handleBox || !targetBox) {
      throw new Error("슬라이드 drag 좌표를 계산하지 못했습니다.");
    }

    const unexpectedReorderResponse = waitForUserPatchResponse(
      page,
      project.projectId,
      "reorder_slides",
      { timeout: 750 },
    );
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height * 0.75,
      { steps: 8 },
    );
    await expect(
      slideRail(page).locator(
        '[data-slide-rail-drop-indicator="true"], .slide-rail-drop-indicator',
      ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();

    await expect(unexpectedReorderResponse).rejects.toThrow();
    expect(slideOperationCount(probe, "reorder_slides")).toBe(0);
    await expectRailSlideOrder(page, initialOrder);
    await expect(selectedSlide).toHaveAttribute("aria-selected", "true");
    await expectPersistedSlideOrder(page, project.projectId, initialOrder);
  });

  test("supports keyboard rail navigation and persists menu reorder", async ({
    page,
  }) => {
    const { project } = await createAuthenticatedProject(page, {
      deck: createSlideRailDeck(),
      label: "slide-rail-keyboard-reorder",
    });
    const probe = observeDeckPersistence(page, project.projectId);
    await page.goto(`/project/${project.projectId}`);
    await expect(slideRail(page)).toBeVisible();

    const first = slideSelectionButton(page, "slide_1");
    const second = slideSelectionButton(page, "slide_2");
    const third = slideSelectionButton(page, "slide_3");
    await second.focus();
    await second.press("ArrowUp");
    await expect(first).toBeFocused();
    await first.press("ArrowUp");
    await expect(first).toBeFocused();
    await first.press("ArrowDown");
    await expect(second).toBeFocused();
    await second.press("End");
    await expect(third).toBeFocused();
    await third.press("ArrowDown");
    await expect(third).toBeFocused();
    await third.press("Home");
    await expect(first).toBeFocused();

    const menuButton = page.getByRole("button", {
      name: "Data Contract 메뉴",
      exact: true,
    });
    await menuButton.focus();
    await menuButton.press("Enter");
    const reorderResponsePromise = waitForUserPatchResponse(
      page,
      project.projectId,
      "reorder_slides",
    );
    await slideMenuAction(page, "아래로 이동").press("Enter");
    await expectSuccessfulResponse(await reorderResponsePromise);

    const expectedOrder = ["slide_1", "slide_3", "slide_2"];
    expect(slideOperationCount(probe, "reorder_slides")).toBe(1);
    await expectRailSlideOrder(page, expectedOrder);
    await expectPersistedSlideOrder(page, project.projectId, expectedOrder);

    await openSlideMenu(page, "Data Contract");
    await expect(slideMenuAction(page, "아래로 이동")).toBeDisabled();
    await expect(slideMenuAction(page, "위로 이동")).toBeEnabled();

    await page.reload();
    await expect(slideRail(page)).toBeVisible();
    await expectRailSlideOrder(page, expectedOrder);
  });

  test("lets a Viewer navigate the rail without exposing or sending mutations", async ({
    browser,
    page: ownerPage,
  }, testInfo) => {
    const { project } = await createAuthenticatedProject(ownerPage, {
      deck: createSlideRailDeck(),
      label: "slide-rail-viewer-owner",
    });
    const { context, page } = await createIsolatedPage(browser, testInfo);

    try {
      await addAuthenticatedProjectMember(ownerPage, page, {
        label: "slide-rail-viewer",
        projectId: project.projectId,
        role: "viewer",
      });
      const probe = observeDeckPersistence(page, project.projectId);

      await page.goto(`/project/${project.projectId}`);
      await expect(slideRail(page)).toBeVisible();
      const first = slideSelectionButton(page, "slide_1");
      const second = slideSelectionButton(page, "slide_2");
      await first.focus();
      await first.press("ArrowDown");
      await expect(second).toBeFocused();
      await expect(second).toHaveAttribute("aria-selected", "true");

      await expect(
        page.getByRole("button", { name: "슬라이드 추가", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: / 메뉴$/ })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: / 드래그하여 이동$/ }),
      ).toHaveCount(0);
      await expect(
        page.getByText("슬라이드가 삭제되었습니다", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "실행 취소", exact: true }),
      ).toHaveCount(0);

      expect(probe.userPatches).toEqual([]);
      expect(probe.deckPuts).toEqual([]);
      await expectPersistedSlideOrder(page, project.projectId, [
        "slide_1",
        "slide_2",
        "slide_3",
      ]);
    } finally {
      await context.close();
    }
  });
});
