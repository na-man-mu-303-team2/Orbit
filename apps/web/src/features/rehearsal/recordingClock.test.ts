import { describe, expect, it } from "vitest";
import { createRecordingClock } from "./recordingClock";

describe("createRecordingClock", () => {
  it("excludes paused intervals from the MediaRecorder timeline", () => {
    let now = 1_000;
    const clock = createRecordingClock(() => now);
    clock.start();
    now = 2_500;
    clock.pause();
    now = 8_000;
    expect(clock.elapsedMs()).toBe(1_500);

    clock.resume();
    now = 9_250;
    expect(clock.elapsedMs()).toBe(2_750);
    clock.stop();
    now = 20_000;
    expect(clock.elapsedMs()).toBe(2_750);
  });

  it("maps a delayed VAD onset back to the active recording clock", () => {
    let now = 100;
    const clock = createRecordingClock(() => now);
    clock.start();
    now = 1_000;
    clock.pause();
    now = 4_000;
    clock.resume();
    now = 4_500;

    expect(clock.elapsedMsAt(4_200)).toBe(1_100);
    expect(clock.elapsedMs()).toBe(1_400);
  });
});
