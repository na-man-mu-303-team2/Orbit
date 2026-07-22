import { expect, test } from "@playwright/test";

const importedPretendardWeights = [200, 500, 600, 800] as const;

test.describe("PPTX imported font availability", () => {
  test("loads every canonical Pretendard variant weight in Chromium", async ({
    page
  }) => {
    await page.goto("/");

    const result = await page.evaluate(async (weights) => {
      const sample = "가나다 Orbit";
      const loadedCounts: Record<string, number> = {};
      const checks: Record<string, boolean> = {};

      for (const weight of weights) {
        const descriptor = `${weight} 16px "Pretendard"`;
        loadedCounts[String(weight)] = (
          await document.fonts.load(descriptor, sample)
        ).length;
        checks[String(weight)] = document.fonts.check(descriptor, sample);
      }

      const pretendardFaces = [...document.fonts]
        .filter((face) => face.family.replaceAll('"', "") === "Pretendard")
        .map((face) => ({ status: face.status, weight: face.weight }));

      return { checks, loadedCounts, pretendardFaces };
    }, importedPretendardWeights);

    for (const weight of importedPretendardWeights) {
      expect(result.loadedCounts[String(weight)]).toBeGreaterThan(0);
      expect(result.checks[String(weight)]).toBe(true);
    }
    expect(result.pretendardFaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "loaded", weight: "45 920" })
      ])
    );
  });
});
