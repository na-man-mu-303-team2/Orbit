import { describe, expect, it } from "vitest";

import {
  activityResponseRetentionJobPayloadSchema,
  activityResponseRetentionJobResultSchema,
} from "./activity-retention.schema";

describe("activity response retention contracts", () => {
  it("accepts an internal session retention job and result", () => {
    expect(
      activityResponseRetentionJobPayloadSchema.parse({
        jobId: "job_activity_retention_session_1",
        projectId: "project_1",
        presentationSessionId: "session_1",
      }),
    ).toMatchObject({ presentationSessionId: "session_1" });
    expect(
      activityResponseRetentionJobResultSchema.parse({
        presentationSessionId: "session_1",
        outcome: "retained-aggregate",
        snapshotCount: 2,
        deletedResponseCount: 10,
      }),
    ).toMatchObject({ snapshotCount: 2, deletedResponseCount: 10 });
  });

  it("rejects unknown retention payload fields", () => {
    expect(
      activityResponseRetentionJobPayloadSchema.safeParse({
        jobId: "job_1",
        projectId: "project_1",
        presentationSessionId: "session_1",
        rawResponse: "must-not-be-queued",
      }).success,
    ).toBe(false);
  });
});
