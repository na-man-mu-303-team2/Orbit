import { describe, expect, it } from "vitest";
import {
  createKdhHomeProjectDeck,
  getKdhHomeProjectSeeds,
} from "./kdh-home-project-seed";

describe("kdh home project seed", () => {
  it("creates ten distinct one-slide decks with bundled presentation covers", () => {
    const seeds = getKdhHomeProjectSeeds();
    const decks = seeds.map(createKdhHomeProjectDeck);

    expect(seeds).toHaveLength(10);
    expect(new Set(seeds.map((seed) => seed.projectId)).size).toBe(10);
    expect(new Set(seeds.map((seed) => seed.title)).size).toBe(10);
    expect(decks.map((deck) => deck.slides.length)).toEqual(Array(10).fill(1));
    expect(
      decks.every((deck) =>
        deck.slides[0]?.style.backgroundImage?.src.startsWith(
          "/assets/home-project-covers/",
        ),
      ),
    ).toBe(true);
    expect(new Set(seeds.map((seed) => seed.imageUrl)).size).toBe(10);
    expect(seeds.every((seed) => seed.imageUrl.endsWith(".webp"))).toBe(true);
    expect(
      decks.every((deck) => deck.slides[0]?.style.backgroundImage?.alt === ""),
    ).toBe(true);
    expect(
      decks.every((deck) => deck.slides[0]?.style.backgroundImage?.opacity === 1),
    ).toBe(true);
    expect(seeds.every((seed) => seed.legacyImageUrl.startsWith("https://"))).toBe(
      true,
    );
  });
});
