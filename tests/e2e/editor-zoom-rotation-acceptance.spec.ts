import { createDemoDeck } from "@orbit/editor-core";
import type { Deck, DeckElement } from "@orbit/shared";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { writeFileSync } from "node:fs";

import { createAuthenticatedProject } from "./authenticatedProject";

const canvasWidth = 1920;
const canvasHeight = 1080;

type ZoomPercent = 50 | 100 | 200;

type RotatedFixtureElement = {
  elementId: string;
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

function createRotatedElementDeck(): Deck {
  const deck = structuredClone(createDemoDeck());
  const slide = deck.slides[0];
  const existingText = slide?.elements.find(
    (element): element is Extract<DeckElement, { type: "text" }> =>
      element.type === "text",
  );
  const existingImage = slide?.elements.find(
    (element): element is Extract<DeckElement, { type: "image" }> =>
      element.type === "image",
  );

  if (!slide || !existingText || !existingImage) {
    throw new Error(
      "Rotated editor fixture requires a text and image element.",
    );
  }

  const textElement = {
    ...existingText,
    elementId: "el_rotated_text",
    height: 130,
    rotation: -12,
    width: 560,
    x: 180,
    y: 150,
    props: {
      ...existingText.props,
      fontSize: 48,
      text: "회전 텍스트 · Zoom QA",
    },
  } satisfies Extract<DeckElement, { type: "text" }>;
  const imageElement = {
    ...existingImage,
    elementId: "el_rotated_image",
    height: 300,
    rotation: 14,
    width: 520,
    x: 1_100,
    y: 110,
  } satisfies Extract<DeckElement, { type: "image" }>;
  const tableElement = {
    elementId: "el_rotated_table",
    height: 300,
    locked: false,
    opacity: 1,
    props: {
      borderColor: "#64748B",
      borderWidth: 2,
      columnWidths: [300, 300, 300],
      rowHeights: [100, 100, 100],
      rows: [
        [tableCell("분기"), tableCell("사용자"), tableCell("전환율")],
        [tableCell("Q1"), tableCell("1,240"), tableCell("18%")],
        [tableCell("Q2"), tableCell("1,680"), tableCell("24%")],
      ],
    },
    rotation: -8,
    type: "table",
    visible: true,
    width: 900,
    x: 360,
    y: 610,
    zIndex: 2,
  } satisfies Extract<DeckElement, { type: "table" }>;

  slide.elements = [textElement, imageElement, tableElement];
  slide.style = {
    ...slide.style,
    backgroundColor: "#F8FAFC",
    backgroundImage: undefined,
  };
  return deck;
}

function tableCell(text: string) {
  return {
    align: "center" as const,
    borderColor: "#94A3B8",
    borderWidth: 1,
    colSpan: 1,
    fill:
      text === "분기" || text === "사용자" || text === "전환율"
        ? "#EDE9FE"
        : "#FFFFFF",
    fontSize: 22,
    fontWeight: "normal" as const,
    rowSpan: 1,
    text,
    verticalAlign: "middle" as const,
  };
}

async function settleEditorLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    });
  });
}

function zoomControl(page: Page) {
  return page.getByRole("group", { name: "캔버스 확대/축소", exact: true });
}

async function setZoom(page: Page, zoomPercent: ZoomPercent) {
  await zoomControl(page)
    .getByRole("button", { name: "100%로 보기", exact: true })
    .click();

  const direction = zoomPercent < 100 ? "캔버스 축소" : "캔버스 확대";
  const output = zoomControl(page).getByLabel("현재 확대/축소", {
    exact: true,
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await output.textContent())?.trim() === `${zoomPercent}%`) break;
    await zoomControl(page)
      .getByRole("button", { name: direction, exact: true })
      .click();
  }

  await expect(output).toHaveText(`${zoomPercent}%`);
  await expect(page.getByTestId("editor-canvas-pane")).toHaveAttribute(
    "data-zoom-percent",
    String(zoomPercent),
  );
  await expect
    .poll(async () => {
      await settleEditorLayout(page);
      const box = await page.getByTestId("editor-stage-shell").boundingBox();
      return box
        ? { height: Math.round(box.height), width: Math.round(box.width) }
        : null;
    })
    .toEqual({
      height: Math.round((canvasHeight * zoomPercent) / 100),
      width: Math.round((canvasWidth * zoomPercent) / 100),
    });
}

function rotatedHitPoint(element: RotatedFixtureElement) {
  const radians = (element.rotation * Math.PI) / 180;
  const localX = element.width / 2;
  const localY =
    element.elementId === "el_rotated_text"
      ? Math.min(24, element.height / 4)
      : element.height / 2;
  return {
    x: element.x + Math.cos(radians) * localX - Math.sin(radians) * localY,
    y: element.y + Math.sin(radians) * localX + Math.cos(radians) * localY,
  };
}

async function selectRotatedElement(
  page: Page,
  element: RotatedFixtureElement,
  zoomPercent: ZoomPercent,
) {
  const center = rotatedHitPoint(element);
  const scale = zoomPercent / 100;
  await page.getByTestId("editor-canvas-pane").evaluate(
    (pane, target) => {
      pane.scrollLeft = Math.max(0, target.x - pane.clientWidth / 2);
      pane.scrollTop = Math.max(0, target.y - pane.clientHeight / 2);
    },
    { x: center.x * scale, y: center.y * scale },
  );
  await settleEditorLayout(page);

  const stageBox = await page.getByTestId("editor-stage-shell").boundingBox();
  if (!stageBox) throw new Error("Editor stage shell was not rendered.");

  await page.mouse.click(
    stageBox.x + center.x * scale,
    stageBox.y + center.y * scale,
  );
  const quickBar = page.getByTestId("editor-element-quickbar");
  await expect(quickBar).toBeVisible();
  await expect(quickBar.getByLabel("회전", { exact: true })).toHaveValue(
    String(((element.rotation % 360) + 360) % 360),
  );
}

async function captureStageEvidence(
  page: Page,
  testInfo: TestInfo,
  zoomPercent: ZoomPercent,
) {
  const path = testInfo.outputPath(`v1-rotated-elements-${zoomPercent}.png`);
  const dataUrl = await page
    .getByTestId("editor-canvas-stage")
    .locator(".konva-canvas-layer canvas")
    .first()
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL("image/png"));
  writeFileSync(path, Buffer.from(dataUrl.split(",")[1]!, "base64"));
  await testInfo.attach(`V1 rotated elements ${zoomPercent}%`, {
    contentType: "image/png",
    path,
  });
}

test("keeps rotated text, image, and table selectable at 50%, 100%, and 200%", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  const deck = createRotatedElementDeck();
  const { project } = await createAuthenticatedProject(page, {
    deck,
    label: "editor-v1-zoom-rotation",
  });
  await page.goto(`/project/${project.projectId}`);
  await expect(page.getByLabel("Presentation editor")).toBeVisible();
  await expect(page.getByTestId("editor-stage-shell")).toBeVisible();

  const elements = deck.slides[0]!.elements as RotatedFixtureElement[];
  for (const zoomPercent of [50, 100, 200] as const) {
    await setZoom(page, zoomPercent);
    for (const element of elements) {
      await selectRotatedElement(page, element, zoomPercent);
    }
    await captureStageEvidence(page, testInfo, zoomPercent);
  }
});
