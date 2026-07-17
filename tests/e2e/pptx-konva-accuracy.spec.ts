import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const deckRenderPayloadStorageKey = "orbit.deckRenderPayload.v1";
const manifestPath =
  process.env.PPTX_EXPORT_ACCURACY_MANIFEST ??
  process.env.PPTX_KONVA_ACCURACY_MANIFEST ??
  "tmp/pptx-konva-accuracy/run/manifest.json";

type AccuracyManifest = {
  kind?: "deck-pptx-export";
  route: string;
  render?: {
    deviceScaleFactor: number;
    locale: string;
    timezoneId: string;
    viewport: { height: number; width: number };
  };
  rows: Array<{
    candidatePath: string;
    name: string;
    payloadPath: string;
  }>;
  browserCapture?: {
    browserVersion: string;
    deviceScaleFactor: number;
    locale: string;
    timezoneId: string;
    viewport: { height: number; width: number };
  };
};

const manifest = readManifest();

if (manifest?.render) {
  test.use({
    deviceScaleFactor: manifest.render.deviceScaleFactor,
    locale: manifest.render.locale,
    timezoneId: manifest.render.timezoneId,
    viewport: manifest.render.viewport,
  });
}

test.describe("PPTX Konva accuracy render", () => {
  if (!manifest) {
    test.skip(true, `accuracy manifest missing: ${manifestPath}`);
    test("requires an accuracy manifest", () => {});
    return;
  }

  test.beforeAll(async ({ browser }) => {
    if (!manifest.render || manifest.kind !== "deck-pptx-export") return;
    manifest.browserCapture = {
      browserVersion: browser.version(),
      deviceScaleFactor: manifest.render.deviceScaleFactor,
      locale: manifest.render.locale,
      timezoneId: manifest.render.timezoneId,
      viewport: manifest.render.viewport,
    };
    fs.writeFileSync(
      rootPath(manifestPath),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  });

  for (const row of manifest.rows) {
    test(`captures ${row.name}`, async ({ page }) => {
      const payload = fs.readFileSync(rootPath(row.payloadPath), "utf8");
      const candidatePath = rootPath(row.candidatePath);
      fs.mkdirSync(path.dirname(candidatePath), { recursive: true });

      await page.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: deckRenderPayloadStorageKey, value: payload },
      );
      await page.goto(manifest.route);
      if (manifest.kind === "deck-pptx-export") {
        await page.evaluate(() => document.fonts.ready);
        await page.reload({ waitUntil: "load" });
      }

      await expect(page.getByTestId("deck-render-page")).toBeVisible();
      const slide = page.getByTestId("slide-background");
      await expect(slide).toBeVisible();
      await waitForDeterministicSlideRender(page);

      if (manifest.render) {
        const box = await slide.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.width).toBe(manifest.render.viewport.width);
        expect(box?.height).toBe(manifest.render.viewport.height);
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(
          manifest.render.deviceScaleFactor,
        );
      }
      await slide.screenshot({ path: candidatePath });
      expect(fs.existsSync(candidatePath)).toBe(true);
    });
  }
});

function readManifest(): AccuracyManifest | null {
  const absolutePath = rootPath(manifestPath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as AccuracyManifest;
}

function rootPath(value: string) {
  return path.resolve(process.cwd(), value);
}

async function waitForDeterministicSlideRender(
  page: import("@playwright/test").Page,
) {
  await page.evaluate(async (storageKey) => {
    await document.fonts.ready;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as { deck?: unknown }) : null;
    const imageSources: string[] = [];
    if (parsed?.deck && typeof parsed.deck === "object") {
      const deck = parsed.deck as {
        slides?: Array<{
          elements?: Array<{ props?: { src?: unknown }; type?: unknown }>;
          style?: { backgroundImage?: { src?: unknown } };
        }>;
      };
      for (const slide of deck.slides ?? []) {
        const backgroundSource = slide.style?.backgroundImage?.src;
        if (typeof backgroundSource === "string") {
          imageSources.push(backgroundSource);
        }
        for (const element of slide.elements ?? []) {
          const source = element.props?.src;
          if (
            (element.type === "image" || element.type === "svg") &&
            typeof source === "string"
          ) {
            imageSources.push(source);
          }
        }
      }
    }
    await Promise.all(
      [...new Set(imageSources)].map(
        (source) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () =>
              reject(
                new Error(
                  `accuracy image failed to load: ${source.slice(0, 48)}`,
                ),
              );
            image.src = source;
            if (image.complete && image.naturalWidth > 0) resolve();
          }),
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, deckRenderPayloadStorageKey);
}
