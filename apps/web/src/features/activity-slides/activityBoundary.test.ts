import { describe, expect, it } from "vitest";

import {
  acceptActivityRevision,
  activityApi,
  activityQueryKeys,
  type ActivitySurfaceRole
} from "./index";

describe("activity-slides public boundary", () => {
  it("exposes API, query and rendering contracts from one production module", () => {
    const role: ActivitySurfaceRole = "audience";
    expect(role).toBe("audience");
    expect(activityApi.getAudienceActivity).toBeTypeOf("function");
    expect(activityApi.getAudienceActiveActivity).toBeTypeOf("function");
    expect(activityQueryKeys.audienceActivity("session_1", "activity_1")).toEqual([
      "activity-slides",
      "audience-activity",
      "session_1",
      "activity_1"
    ]);
    expect(acceptActivityRevision(null, { revision: 1, value: true }).value).toBe(true);
  });
});
