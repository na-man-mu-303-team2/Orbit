import { describe, expect, it } from "vitest";

import { databaseOptions } from "./data-source";

describe("databaseOptions", () => {
  it("keeps TypeORM query logging disabled to protect user content", () => {
    expect(databaseOptions.logging).toBe(false);
  });
});
