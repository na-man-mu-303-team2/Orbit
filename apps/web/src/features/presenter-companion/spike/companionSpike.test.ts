import { describe, expect, it } from "vitest";

import {
  calculateLatencySummary,
  collectCompanionSpikePoints,
  companionSpikeChannelName,
  companionSpikeUrl,
  isCompanionSpikeEnabled,
  isCompanionSpikeInk,
  isCompanionSpikeSignal,
} from "./companionSpike";

describe("companionSpike", () => {
  it("enables the host harness only for the explicit query flag", () => {
    expect(isCompanionSpikeEnabled("?companionSpike=1")).toBe(true);
    expect(isCompanionSpikeEnabled("?companionSpike=true")).toBe(false);
    expect(isCompanionSpikeEnabled("")).toBe(false);
  });

  it("builds encoded public and local channel addresses", () => {
    expect(companionSpikeUrl("https://staging.orbit.test", "spike/a")).toBe(
      "https://staging.orbit.test/companion-spike/spike%2Fa",
    );
    expect(companionSpikeChannelName("spike_1")).toBe(
      "orbit:companion-spike:spike_1",
    );
  });

  it("calculates nearest-rank p50 and p95 after filtering invalid samples", () => {
    expect(
      calculateLatencySummary([300, 20, 100, Number.NaN, -1, 40], 10_000),
    ).toEqual({
      count: 4,
      durationMs: 10_000,
      maxMs: 300,
      p50Ms: 40,
      p95Ms: 300,
    });
  });

  it("normalizes coalesced pointer samples and caps a batch at 64 points", () => {
    const samples = Array.from({ length: 70 }, (_, index) => ({
      buttons: 1,
      clientX: 100 + index,
      clientY: 50,
      pressure: index === 69 ? 0.8 : 0,
      timeStamp: 1000 + index,
    }));
    const points = collectCompanionSpikePoints(
      {
        getCoalescedEvents: () => samples,
      } as unknown as PointerEvent,
      { height: 100, left: 100, top: 0, width: 100 },
      1000,
    );

    expect(points).toHaveLength(64);
    expect(points.at(-1)).toEqual({
      pressure: 0.8,
      t: 69,
      x: 0.69,
      y: 0.5,
    });
  });

  it("rejects malformed or out-of-range incoming ink", () => {
    const ink = {
      phase: "move",
      points: [{ pressure: 0.5, t: 10, x: 0.2, y: 0.4 }],
      sentAtMs: 1,
      sequence: 0,
      spikeId: "spike_1",
      strokeId: "stroke_1",
    };
    expect(isCompanionSpikeInk(ink)).toBe(true);
    expect(
      isCompanionSpikeInk({
        ...ink,
        points: [{ pressure: 0.5, t: 10, x: 2, y: 0.4 }],
      }),
    ).toBe(false);
  });

  it("accepts only bounded WebRTC signal shapes", () => {
    expect(
      isCompanionSpikeSignal({
        signal: {
          description: { sdp: "v=0", type: "offer" },
          kind: "description",
        },
        spikeId: "spike_1",
      }),
    ).toBe(true);
    expect(
      isCompanionSpikeSignal({
        signal: { description: { type: "rollback" }, kind: "description" },
        spikeId: "spike_1",
      }),
    ).toBe(false);
  });
});
