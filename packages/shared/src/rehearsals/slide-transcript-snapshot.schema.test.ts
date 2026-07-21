import { describe, expect, it } from "vitest";

import { slideTranscriptSnapshotsSchema } from "./slide-transcript-snapshot.schema";

describe("slideTranscriptSnapshotsSchema", () => {
  it("accepts cumulative transcript snapshots for repeated slide visits", () => {
    const snapshots = slideTranscriptSnapshotsSchema.parse([
      {
        slideId: "slide_1",
        slideNum: 1,
        visitedVer: 2,
        transcript: "첫 문장 두 번째 문장",
        visitedAt: "2026-07-20T04:00:00.000Z",
        capturedAt: "2026-07-20T04:01:00.000Z",
        reason: "slide-change",
      },
    ]);

    expect(snapshots[0]).toMatchObject({
      slideId: "slide_1",
      visitedVer: 2,
      reason: "slide-change",
    });
  });

  it("rejects misspelled visit fields", () => {
    const result = slideTranscriptSnapshotsSchema.safeParse([
      {
        slideId: "slide_1",
        slideNum: 1,
        vistiedVer: 1,
        transcript: "첫 문장",
        vistiedAt: "2026-07-20T04:00:00.000Z",
        capturedAt: "2026-07-20T04:01:00.000Z",
        reason: "rehearsal-end",
      },
    ]);

    expect(result.success).toBe(false);
  });
});
