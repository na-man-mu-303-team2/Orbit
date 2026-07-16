import { describe, expect, it } from "vitest";

import { acceptActivityRevision } from "./activityRevision";

describe("acceptActivityRevision", () => {
  it("ignores an out-of-order lower revision", () => {
    const current = { revision: 5, value: "fresh" };

    expect(acceptActivityRevision(current, { revision: 4, value: "stale" })).toBe(
      current
    );
    expect(acceptActivityRevision(current, { revision: 6, value: "new" })).toEqual({
      revision: 6,
      value: "new"
    });
  });
});
