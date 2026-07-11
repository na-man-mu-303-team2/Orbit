import { describe, expect, it } from "vitest";

import { workerDatabaseLogging } from "./database";

describe("workerDatabaseOptions", () => {
  it("keeps TypeORM query logging disabled to protect job payloads", () => {
    expect(workerDatabaseLogging).toBe(false);
  });
});
