import { createDemoDeck } from "@orbit/editor-core";
import { expect, test, type Page } from "@playwright/test";

import { createAuthenticatedProject } from "./authenticatedProject";

const canvasWidth = 1920;

type ElementFrameSnapshot = {
  elementId: string;
  height: number;
  width: number;
  x: number;
  y: number;
};

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
  options: { height: number; label: string; width: number },
) {
  await page.setViewportSize({ height: options.height, width: options.width });
  const { project } = await createAuthenticatedProject(page, {
    deck: createDemoDeck(),
    label: options.label,
  });

  await page.goto(`/project/${project.projectId}`);
  await expect(page.getByLabel("Presentation editor")).toBeVisible();
  await expect(page.getByTestId("editor-stage-shell")).toBeVisible();
  await settleEditorLayout(page);
}

async function getElementFrame(page: Page, elementId: string) {
  const rawText =
    (await page.getByTestId("editor-elements-debug").textContent()) ?? "[]";
  const elements = JSON.parse(rawText) as ElementFrameSnapshot[];
  const element = elements.find(
    (candidate) => candidate.elementId === elementId,
  );

  if (!element) {
    throw new Error(`Unable to find ${elementId} in ${rawText}`);
  }

  return element;
}

async function selectCanvasElement(
  page: Page,
  elementId: string,
  options: { append?: boolean } = {},
) {
  const [stageBox, frame] = await Promise.all([
    page.getByTestId("editor-stage-shell").boundingBox(),
    getElementFrame(page, elementId),
  ]);
  if (!stageBox) throw new Error("Editor stage shell was not rendered.");

  const scale = stageBox.width / canvasWidth;
  if (options.append) await page.keyboard.down("Shift");
  await page.mouse.click(
    stageBox.x + (frame.x + 18) * scale,
    stageBox.y + (frame.y + 18) * scale,
  );
  if (options.append) await page.keyboard.up("Shift");
}

test.describe("selection inspector focus contract", () => {
  test("desktop canvas selection opens properties and keeps Escape in one layer", async ({
    page,
  }) => {
    await openEditor(page, {
      height: 900,
      label: "selection-inspector-desktop",
      width: 1440,
    });

    await selectCanvasElement(page, "el_1");
    const propertiesTab = page.getByRole("tab", {
      name: "속성",
      exact: true,
    });
    const inspector = page.getByRole("region", {
      name: "현재 선택",
      exact: true,
    });
    await expect(propertiesTab).toHaveAttribute("aria-selected", "true");
    await expect(inspector).toHaveAttribute("data-selection-mode", "element");

    await selectCanvasElement(page, "el_2", { append: true });
    await expect(inspector).toHaveAttribute("data-selection-mode", "multi");
    await expect(inspector).toContainText("선택한 요소 2개 속성");
    await expect(
      page.getByTestId("editor-multi-selection-quickbar"),
    ).toBeVisible();

    await inspector.focus();
    await inspector.press("Escape");
    await expect(propertiesTab).toBeFocused();
    await expect(propertiesTab).toHaveAttribute("aria-expanded", "true");
  });

  test("compact selection stays opt-in and Escape returns focus to its trigger", async ({
    page,
  }) => {
    await openEditor(page, {
      height: 1024,
      label: "selection-inspector-compact",
      width: 768,
    });

    await selectCanvasElement(page, "el_1");
    const trigger = page.getByRole("button", {
      name: "선택 항목 속성 열기",
      exact: true,
    });
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("1개 선택됨");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute(
      "aria-controls",
      "editor-selection-inspector-pane",
    );

    await trigger.click();
    const inspector = page.getByRole("region", {
      name: "현재 선택",
      exact: true,
    });
    await expect(inspector).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await inspector.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
