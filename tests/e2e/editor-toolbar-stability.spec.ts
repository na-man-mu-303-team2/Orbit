import { createDemoDeck } from "@orbit/editor-core";
import type { Deck } from "@orbit/shared";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAuthenticatedProject } from "./authenticatedProject";

const canvasWidth = 1920;
const canvasHeight = 1080;

type EditorViewport = {
  height: number;
  width: number;
};

type ElementFrameSnapshot = {
  elementId: string;
  height: number;
  width: number;
  x: number;
  y: number;
};

const desktopViewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
] as const satisfies readonly EditorViewport[];

const compactViewports = [
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const satisfies readonly EditorViewport[];

async function openEditor(
  page: Page,
  options: { deck?: Deck; label: string; viewport: EditorViewport },
) {
  await page.setViewportSize(options.viewport);
  const { project } = await createAuthenticatedProject(page, {
    deck: options.deck ?? createDemoDeck(),
    label: options.label,
  });

  await page.goto(`/project/${project.projectId}`);
  await expect(page.getByLabel("Presentation editor")).toBeVisible();
  await expect(page.getByTestId("editor-stage-shell")).toBeVisible();
  await page.getByTestId("editor-stage-shell").scrollIntoViewIfNeeded();
  await settleEditorLayout(page);

  return project;
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

async function selectCanvasElement(
  page: Page,
  elementId: string,
  pointer: "mouse" | "touch" = "mouse",
) {
  const stageShell = page.getByTestId("editor-stage-shell");
  const [stageBox, frame] = await Promise.all([
    stageShell.boundingBox(),
    getElementFrame(page, elementId),
  ]);

  if (!stageBox) {
    throw new Error("Editor stage shell was not rendered.");
  }

  const point = {
    x: stageBox.x + (frame.x + 18) * (stageBox.width / canvasWidth),
    y: stageBox.y + (frame.y + 18) * (stageBox.height / canvasHeight),
  };

  if (pointer === "touch") {
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await page.mouse.click(point.x, point.y);
  }
}

async function getTop(locator: Locator) {
  return locator.evaluate((element) => element.getBoundingClientRect().top);
}

async function getStageTop(page: Page) {
  await settleEditorLayout(page);
  return getTop(page.getByTestId("editor-stage-shell"));
}

async function expectAlignedEditorPaneTops(page: Page) {
  await settleEditorLayout(page);
  const tops = await Promise.all([
    getTop(page.getByTestId("editor-slide-rail-pane")),
    getTop(page.getByTestId("editor-canvas-pane")),
    getTop(page.getByTestId("editor-inspector-pane")),
  ]);

  expect(
    Math.max(...tops) - Math.min(...tops),
    `Editor pane tops should align within 1px: ${tops.join(", ")}`,
  ).toBeLessThanOrEqual(1);
}

async function expectNoHorizontalDocumentOverflow(page: Page) {
  const measurement = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const contentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );

    return {
      contentWidth,
      overflow: Math.ceil(contentWidth - viewportWidth),
      viewportWidth,
    };
  });

  expect(
    measurement.overflow,
    `Horizontal overflow: ${JSON.stringify(measurement)}`,
  ).toBe(0);
}

async function expectNoCriticalOrSeriousAxeViolations(page: Page) {
  const hasAxe = await page.evaluate(
    () => "axe" in (window as typeof window & { axe?: unknown }),
  );
  if (!hasAxe) {
    await page.addScriptTag({
      content: readFileSync(
        resolve("node_modules/axe-core/axe.min.js"),
        "utf8",
      ),
    });
  }

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

async function closeRightPanel(page: Page) {
  const expandButton = page.getByRole("button", {
    name: "오른쪽 패널 펼치기",
    exact: true,
  });
  if (await expandButton.isVisible()) {
    return;
  }

  const closeButton = page.getByRole("button", {
    name: "오른쪽 패널 접기",
    exact: true,
  });
  await expect(closeButton).toBeVisible();
  await closeButton.click();
  await expect(expandButton).toBeVisible();
  await settleEditorLayout(page);
}

function createValidationOverflowDeck() {
  const deck = structuredClone(createDemoDeck());
  const overflowElement = deck.slides[0]?.elements.find(
    (element) => element.elementId === "el_2",
  );

  if (!overflowElement || overflowElement.type !== "text") {
    throw new Error("Validation overflow fixture element el_2 is missing.");
  }

  overflowElement.width = 260;
  overflowElement.height = 18;
  overflowElement.props = {
    ...overflowElement.props,
    fontSize: 48,
    lineHeight: 1.5,
    text: "검사 탭에서 선택 출처를 검증하기 위한 충분히 긴 텍스트입니다.",
  };

  return deck;
}

for (const viewport of desktopViewports) {
  test(`desktop ${viewport.width}x${viewport.height} keeps toolbar geometry and inspector access stable`, async ({
    page,
  }) => {
    await openEditor(page, {
      label: `toolbar-desktop-${viewport.width}x${viewport.height}`,
      viewport,
    });
    await closeRightPanel(page);

    const stageTopBeforeSelection = await getStageTop(page);
    await expectNoHorizontalDocumentOverflow(page);
    await expectNoCriticalOrSeriousAxeViolations(page);

    await selectCanvasElement(page, "el_3");

    const designTab = page.getByRole("tab", { name: "디자인", exact: true });
    await expect(designTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("region", { name: "현재 선택", exact: true }),
    ).toBeVisible();
    const stageTopAfterSelection = await getStageTop(page);

    expect(
      Math.abs(stageTopAfterSelection - stageTopBeforeSelection),
      `Stage Y changed from ${stageTopBeforeSelection} to ${stageTopAfterSelection}`,
    ).toBeLessThanOrEqual(1);
    await expectAlignedEditorPaneTops(page);

    await designTab.focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("region", { name: "현재 선택", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(designTab).toBeFocused();

    await expectNoHorizontalDocumentOverflow(page);
    await expectNoCriticalOrSeriousAxeViolations(page);
  });
}

for (const viewport of compactViewports) {
  test(`compact ${viewport.width}x${viewport.height} keeps selection opt-in and focus reversible`, async ({
    page,
  }) => {
    await openEditor(page, {
      label: `toolbar-compact-${viewport.width}x${viewport.height}`,
      viewport,
    });
    await closeRightPanel(page);

    const stageTopBeforeSelection = await getStageTop(page);
    await expectNoHorizontalDocumentOverflow(page);
    await expectNoCriticalOrSeriousAxeViolations(page);

    await selectCanvasElement(page, "el_3");

    const expandButton = page.getByRole("button", {
      name: "오른쪽 패널 펼치기",
      exact: true,
    });
    const compactTrigger = page.getByRole("button", {
      name: "선택 항목 속성 열기",
      exact: true,
    });
    await expect(expandButton).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "디자인", exact: true }),
    ).toHaveCount(0);
    await expect(compactTrigger).toBeVisible();
    await expect(compactTrigger).toContainText("1개 선택됨");
    await expect(compactTrigger).toHaveAttribute("aria-expanded", "false");

    const stageTopAfterSelection = await getStageTop(page);
    expect(
      Math.abs(stageTopAfterSelection - stageTopBeforeSelection),
      `Stage Y changed from ${stageTopBeforeSelection} to ${stageTopAfterSelection}`,
    ).toBeLessThanOrEqual(1);

    await expectNoHorizontalDocumentOverflow(page);
    await expectNoCriticalOrSeriousAxeViolations(page);

    await compactTrigger.focus();
    await compactTrigger.press("Enter");
    const selectionInspector = page.getByRole("region", {
      name: "현재 선택",
      exact: true,
    });
    await expect(selectionInspector).toBeFocused();
    await selectionInspector.press("Escape");
    await expect(compactTrigger).toBeFocused();
    await expect(expandButton).toBeVisible();
  });
}

test("validation-origin repair keeps AI inspection tabs selected", async ({
  page,
}) => {
  await openEditor(page, {
    deck: createValidationOverflowDeck(),
    label: "toolbar-validation-origin",
    viewport: { width: 1024, height: 768 },
  });

  const aiTab = page.getByRole("tab", { name: "AI 코치", exact: true });
  const validationTab = page.getByRole("tab", { name: "검사", exact: true });
  const designTab = page.getByRole("tab", { name: "디자인", exact: true });
  await validationTab.click();
  await expect(aiTab).toHaveAttribute("aria-selected", "true");
  await expect(validationTab).toHaveAttribute("aria-selected", "true");

  const overflowItem = page
    .getByTestId("editor-validation-item")
    .filter({ hasText: "텍스트가 상자 높이를 넘을 수 있습니다." })
    .first();
  await expect(overflowItem).toBeVisible();
  await overflowItem
    .getByRole("button", { name: "글자 줄이기", exact: true })
    .click();

  await expect(
    page.locator('[aria-label="현재 선택"][data-selection-mode="element"]'),
  ).toHaveCount(1);
  await expect(aiTab).toHaveAttribute("aria-selected", "true");
  await expect(validationTab).toHaveAttribute("aria-selected", "true");
  await expect(designTab).toHaveAttribute("aria-selected", "false");
});

test.describe("compact coarse pointer target", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps the compact selection trigger at least 44 by 44 pixels", async ({
    page,
  }) => {
    await openEditor(page, {
      label: "toolbar-compact-coarse-target",
      viewport: { width: 390, height: 844 },
    });
    await closeRightPanel(page);
    await selectCanvasElement(page, "el_3");

    const compactTrigger = page.getByRole("button", {
      name: "선택 항목 속성 열기",
      exact: true,
    });
    await expect(compactTrigger).toBeVisible();
    const box = await compactTrigger.boundingBox();
    if (!box) {
      throw new Error("Compact selection trigger was not rendered.");
    }

    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
