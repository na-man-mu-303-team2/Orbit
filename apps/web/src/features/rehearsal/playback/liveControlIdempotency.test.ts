import { describe, expect, it } from "vitest";

import {
  createLiveControlIdempotencyGate,
  createLiveControlIdempotencyKey
} from "./liveControlIdempotency";

const scope = {
  sessionId: "session_1",
  slideId: "slide_1",
  slideRevision: 4,
  utteranceId: "item_1",
  contentIndex: 0
};

describe("liveControlIdempotency", () => {
  it("partial과 final의 같은 target을 한 번만 claim한다", () => {
    const gate = createLiveControlIdempotencyGate();

    expect(gate.claim(scope, "action:act_1")).toBe(true);
    expect(gate.claim(scope, "action:act_1")).toBe(false);
    expect(gate.claim(scope, "action:act_2")).toBe(true);
  });

  it("utterance, content index, slide revision을 서로 다른 실행 범위로 구분한다", () => {
    const baseKey = createLiveControlIdempotencyKey(scope, "cue:emphasis");

    expect(
      createLiveControlIdempotencyKey(
        { ...scope, utteranceId: "item_2" },
        "cue:emphasis"
      )
    ).not.toBe(baseKey);
    expect(
      createLiveControlIdempotencyKey(
        { ...scope, contentIndex: 1 },
        "cue:emphasis"
      )
    ).not.toBe(baseKey);
    expect(
      createLiveControlIdempotencyKey(
        { ...scope, slideRevision: 5 },
        "cue:emphasis"
      )
    ).not.toBe(baseKey);
  });

  it("오래된 key를 제거해 registry 크기를 제한한다", () => {
    const gate = createLiveControlIdempotencyGate({ maxEntries: 2 });

    gate.claim(scope, "action:act_1");
    gate.claim(scope, "action:act_2");
    gate.claim(scope, "action:act_3");

    expect(gate.size()).toBe(2);
    expect(gate.claim(scope, "action:act_1")).toBe(true);
  });
});
