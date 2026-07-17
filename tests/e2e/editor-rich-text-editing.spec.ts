import { expect, test, type Page, type Request } from "@playwright/test";
import { createDemoDeck, normalizeRichTextProps } from "@orbit/editor-core";
import type { Deck, DeckPatch } from "@orbit/shared";

import { createAuthenticatedProject } from "./authenticatedProject";

const canvasWidth = 1920;
const primaryModifier = process.platform === "darwin" ? "Meta" : "Control";

function createRichTextDeck() {
  const deck = createDemoDeck();
  const element = deck.slides[0]?.elements.find(
    (candidate) => candidate.elementId === "el_1",
  );
  if (!element || element.type !== "text") {
    throw new Error("Rich text E2E fixture requires el_1 text.");
  }
  element.props = normalizeRichTextProps({
    ...element.props,
    paragraphs: [
      {
        align: "left",
        indent: 0,
        lineHeight: 1.2,
        runs: [
          { baseline: "normal", text: "Alpha" },
          { baseline: "normal", italic: true, text: " Beta" },
        ],
        spaceAfter: 0,
        spaceBefore: 0,
        text: "Alpha Beta",
      },
    ],
    text: "Alpha Beta",
  });
  return deck;
}

function projectDeckPath(projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/deck`;
}

function isDeckPatchRequest(request: Request, projectId: string) {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === `${projectDeckPath(projectId)}/patches`
  );
}

async function fetchPersistedDeck(page: Page, projectId: string) {
  const response = await page.request.get(projectDeckPath(projectId));
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { deck: Deck }).deck;
}

async function openEditor(page: Page, projectId: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/project/${projectId}`);
  await expect(page.getByLabel("Presentation editor")).toBeVisible();
  await expect(page.getByTestId("editor-stage-shell")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function beginInlineEditing(page: Page, elementId: string) {
  const stage = page.getByTestId("editor-stage-shell");
  const stageBox = await stage.boundingBox();
  const debugText = await page.getByTestId("editor-elements-debug").textContent();
  const frame = (JSON.parse(debugText ?? "[]") as Array<{
    elementId: string;
    x: number;
    y: number;
  }>).find((candidate) => candidate.elementId === elementId);
  if (!stageBox || !frame) throw new Error(`Unable to locate ${elementId}.`);
  const scale = stageBox.width / canvasWidth;
  await page.mouse.dblclick(
    stageBox.x + (frame.x + 20) * scale,
    stageBox.y + (frame.y + 20) * scale,
  );
  const editor = page.getByRole("textbox", { name: "텍스트 편집" });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  return editor;
}

test.describe("B4 IME-safe contentEditable session", () => {
  test("keeps format and typing local, commits once, and cancels Escape", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const { project } = await createAuthenticatedProject(page, {
      deck: createRichTextDeck(),
      label: "rich-text-editing",
    });
    const patchRequests: Request[] = [];
    page.on("request", (request) => {
      if (isDeckPatchRequest(request, project.projectId)) {
        patchRequests.push(request);
      }
    });
    await openEditor(page, project.projectId);

    const editor = await beginInlineEditing(page, "el_1");
    await editor.press("Home");
    await page.keyboard.down("Shift");
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.up("Shift");
    await page.getByRole("button", { name: "굵게", exact: true }).click();

    await expect(editor.locator("[data-text-run-index='0']")).toHaveCSS(
      "font-weight",
      "700",
    );
    expect(patchRequests).toHaveLength(0);

    const fontSizeInput = page.locator('input[aria-label="글자 크기"]');
    await fontSizeInput.click();
    await expect(fontSizeInput).toBeFocused();
    await fontSizeInput.fill("30");
    expect(patchRequests).toHaveLength(0);

    await editor.focus();
    await editor.press("End");
    await editor.pressSequentially(" 한글");
    expect(patchRequests).toHaveLength(0);

    const patchResponsePromise = page.waitForResponse((response) =>
      isDeckPatchRequest(response.request(), project.projectId),
    );
    await editor.press(`${primaryModifier}+Enter`);
    const patchResponse = await patchResponsePromise;
    expect(patchResponse.ok(), await patchResponse.text()).toBe(true);
    await expect(page.getByRole("textbox", { name: "텍스트 편집" })).toHaveCount(
      0,
    );
    expect(patchRequests).toHaveLength(1);

    const patchBody = patchRequests[0]!.postDataJSON() as {
      patch?: DeckPatch;
    };
    expect(patchBody.patch?.operations).toHaveLength(1);
    expect(patchBody.patch?.operations[0]).toMatchObject({
      elementId: "el_1",
      type: "update_element_props",
    });

    await expect
      .poll(async () => {
        const persisted = await fetchPersistedDeck(page, project.projectId);
        const text = persisted.slides[0]?.elements.find(
          (candidate) => candidate.elementId === "el_1",
        );
        return text?.type === "text" ? text.props : null;
      })
      .toMatchObject({
        paragraphs: [
          expect.objectContaining({
            runs: expect.arrayContaining([
              expect.objectContaining({ fontWeight: "bold", text: "Alpha" }),
            ]),
          }),
        ],
        text: "Alpha Beta 한글",
      });

    const cancelEditor = await beginInlineEditing(page, "el_1");
    await cancelEditor.press("End");
    await cancelEditor.pressSequentially(" 버림");
    await cancelEditor.press("Escape");
    await expect(page.getByRole("textbox", { name: "텍스트 편집" })).toHaveCount(
      0,
    );
    expect(patchRequests).toHaveLength(1);

    const persistedAfterCancel = await fetchPersistedDeck(page, project.projectId);
    const textAfterCancel = persistedAfterCancel.slides[0]?.elements.find(
      (candidate) => candidate.elementId === "el_1",
    );
    expect(textAfterCancel?.type === "text" ? textAfterCancel.props.text : null).toBe(
      "Alpha Beta 한글",
    );

    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "실행 취소", exact: true }),
    ).toBeDisabled();
    expect(consoleErrors).toEqual([]);
  });
});
