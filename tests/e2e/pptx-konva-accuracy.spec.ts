import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const deckRenderPayloadStorageKey = "orbit.deckRenderPayload.v1";
const manifestPath =
  process.env.PPTX_KONVA_ACCURACY_MANIFEST ??
  "tmp/pptx-konva-accuracy/run/manifest.json";

type AccuracyManifest = {
  route: string;
  rows: Array<{
    candidatePath: string;
    name: string;
    payloadPath: string;
  }>;
};

const manifest = readManifest();

test.describe("PPTX Konva accuracy render", () => {
  if (!manifest) {
    test.skip(true, `accuracy manifest missing: ${manifestPath}`);
    return;
  }

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

      await expect(page.getByTestId("deck-render-page")).toBeVisible();
      const slide = page.getByTestId("slide-background");
      await expect(slide).toBeVisible();
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
