import { expect, test, type Page } from "@playwright/test";

const canvasWidth = 1920;
const canvasHeight = 1080;

type ElementFrameSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type ElementFrameKey = keyof ElementFrameSnapshot;

function toStagePointer(
  stageBox: { x: number; y: number; width: number; height: number },
  canvasX: number,
  canvasY: number
) {
  const scale = stageBox.width / canvasWidth;

  return {
    scale,
    x: stageBox.x + canvasX * scale,
    y: stageBox.y + canvasY * scale
  };
}

async function getElementFrame(page: Page, elementId: string) {
  const rawText = (await page.getByTestId("editor-elements-debug").textContent()) ?? "[]";
  const elements = JSON.parse(rawText) as Array<
    ElementFrameSnapshot & { elementId: string }
  >;
  const element = elements.find((candidate) => candidate.elementId === elementId);

  if (!element) {
    throw new Error(`Unable to find ${elementId} in element debug payload: ${rawText}`);
  }

  return element;
}

async function expectFrameValueNear(args: {
  page: Page;
  elementId: string;
  key: ElementFrameKey;
  expected: number;
  tolerance?: number;
}) {
  const { elementId, expected, key, page, tolerance = 1 } = args;

  await expect
    .poll(async () => {
      const frame = await getElementFrame(page, elementId);
      return Math.abs(frame[key] - expected) <= tolerance;
    })
    .toBe(true);
}

async function getSlideStyle(page: Page) {
  const rawText = (await page.getByTestId("editor-slide-style-debug").textContent()) ?? "null";
  return JSON.parse(rawText) as {
    backgroundColor: string;
    textColor: string;
    accentColor: string;
  } | null;
}

test.describe("ORBIT-18 ORBIT-107 editor manipulation", () => {
  test("selects, drags, resizes, rotates, and returns to slide background editing", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "편집기 열기" }).click();

    await expect(
      page.getByLabel("Presentation editor")
    ).toBeVisible();

    const stageShell = page.getByTestId("editor-stage-shell");
    await expect(stageShell).toBeVisible();

    const stageBox = await stageShell.boundingBox();

    if (!stageBox) {
      throw new Error("Editor stage shell was not rendered.");
    }

    const initialFrame = await getElementFrame(page, "el_3");
    expect(initialFrame).toMatchObject({
      x: 1120,
      y: 128,
      width: 520,
      height: 300,
      rotation: 0
    });

    const initialSelectionPoint = toStagePointer(
      stageBox,
      initialFrame.x + 18,
      initialFrame.y + 18
    );

    await page.mouse.click(initialSelectionPoint.x, initialSelectionPoint.y);

    const elementQuickBar = page.getByTestId("editor-element-quickbar");
    await expect(elementQuickBar).toBeVisible();
    await expect(elementQuickBar.getByLabel("채우기")).toBeVisible();

    await page.mouse.move(initialSelectionPoint.x, initialSelectionPoint.y);
    await page.mouse.down();
    await page.mouse.move(
      initialSelectionPoint.x + 80 * initialSelectionPoint.scale,
      initialSelectionPoint.y + 60 * initialSelectionPoint.scale,
      { steps: 8 }
    );
    await page.mouse.up();

    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "x",
      expected: 1200
    });
    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "y",
      expected: 188
    });
    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "width",
      expected: 520
    });
    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "height",
      expected: 300
    });

    const draggedFrame = await getElementFrame(page, "el_3");
    const resizeApplied = await page.evaluate(() =>
      window.__ORBIT_EDITOR_TEST_API__?.updateSelectedElementFrame({
        width: 640,
        height: 340
      }) ?? false
    );

    expect(resizeApplied).toBe(true);

    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "x",
      expected: 1200,
      tolerance: 2
    });
    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "y",
      expected: 188,
      tolerance: 2
    });
    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "width",
      expected: 640,
      tolerance: 3
    });
    await expectFrameValueNear({
      page,
      elementId: "el_3",
      key: "height",
      expected: 340,
      tolerance: 3
    });

    const rotationInput = elementQuickBar.getByLabel("회전");
    await rotationInput.fill("45");
    await rotationInput.press("Enter");

    await expect
      .poll(async () => (await getElementFrame(page, "el_3")).rotation)
      .toBe(45);

    await page.getByTestId("editor-canvas-stage").click({
      position: {
        x: stageBox.width - 40,
        y: stageBox.height - 40
      }
    });

    const slideQuickBar = page.getByTestId("editor-slide-quickbar");
    await expect(slideQuickBar).toBeVisible();

    await expect(slideQuickBar.getByLabel("배경색")).toBeVisible();

    const slideStyleApplied = await page.evaluate(() =>
      window.__ORBIT_EDITOR_TEST_API__?.updateCurrentSlideStyle({
        backgroundColor: "#fef3c7"
      }) ?? false
    );

    expect(slideStyleApplied).toBe(true);

    await expect
      .poll(async () => (await getSlideStyle(page))?.backgroundColor)
      .toBe("#fef3c7");
  });
});
