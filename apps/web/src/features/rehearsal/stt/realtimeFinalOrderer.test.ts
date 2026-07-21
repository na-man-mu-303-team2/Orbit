import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RealtimeFinalOrderer,
  type OrderedRealtimeFinal
} from "./realtimeFinalOrderer";

describe("RealtimeFinalOrderer", () => {
  afterEach(() => vi.useRealTimers());

  it("out-of-order final을 commit sequence 순서로 방출한다", () => {
    const results: OrderedRealtimeFinal<string>[] = [];
    const orderer = new RealtimeFinalOrderer<string>((result) =>
      results.push(result)
    );

    orderer.push(2, "둘째");
    orderer.push(1, "첫째");

    expect(results).toEqual([
      { sequence: 1, value: "첫째", reorderTimedOut: false },
      { sequence: 2, value: "둘째", reorderTimedOut: false }
    ]);
  });

  it("선행 final 누락 시 2초 뒤 다음 결과를 timeout metadata와 방출한다", () => {
    vi.useFakeTimers();
    const results: OrderedRealtimeFinal<string>[] = [];
    const orderer = new RealtimeFinalOrderer<string>(
      (result) => results.push(result),
      2000
    );

    orderer.push(2, "둘째");
    vi.advanceTimersByTime(1999);
    expect(results).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(results).toEqual([
      { sequence: 2, value: "둘째", reorderTimedOut: true }
    ]);
  });

  it("reset 이후 stale final과 timeout을 제거한다", () => {
    vi.useFakeTimers();
    const results: OrderedRealtimeFinal<string>[] = [];
    const orderer = new RealtimeFinalOrderer<string>((result) =>
      results.push(result)
    );
    orderer.push(2, "stale");
    orderer.reset();
    vi.advanceTimersByTime(2000);
    orderer.push(1, "fresh");

    expect(results).toEqual([
      { sequence: 1, value: "fresh", reorderTimedOut: false }
    ]);
  });
});
