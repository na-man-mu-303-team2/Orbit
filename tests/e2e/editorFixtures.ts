import { createDemoDeck } from "@orbit/editor-core";
import type { Deck } from "@orbit/shared";
import {
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

export function createSnapshotSafeEditorDeck(): Deck {
  const deck = structuredClone(createDemoDeck());
  const sourceSlide = deck.slides[0];
  if (!sourceSlide) {
    throw new Error("Demo Deck slide fixture is missing.");
  }

  return {
    ...deck,
    title: "ORBIT Snapshot-safe E2E Deck",
    slides: [
      {
        ...sourceSlide,
        animations: [],
        elements: sourceSlide.elements.filter(
          (element) => element.type !== "image",
        ),
        style: {
          ...sourceSlide.style,
          backgroundImage: undefined,
        },
        thumbnailUrl: "",
      },
    ],
  };
}

export async function createIsolatedE2ePage(
  browser: Browser,
  testInfo: TestInfo,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL:
      typeof testInfo.project.use.baseURL === "string"
        ? testInfo.project.use.baseURL
        : "http://127.0.0.1:5173",
  });

  return { context, page: await context.newPage() };
}
