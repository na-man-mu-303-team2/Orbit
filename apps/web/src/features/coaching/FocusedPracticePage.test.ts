import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("FocusedPracticePage recording timeline", () => {
  it("anchors range transitions after the recorder has started", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/features/coaching/FocusedPracticePage.tsx"),
      "utf8",
    );

    expect(source).toContain(
      'if (!audio.recording) { await audio.start(); prepareRecordingTarget(); setStatus("녹음 중"); return; }',
    );
    expect(source).not.toContain(
      'if (!audio.recording) { prepareRecordingTarget(); await audio.start();',
    );
  });
});
