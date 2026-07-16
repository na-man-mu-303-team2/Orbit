import { describe, expect, it } from "vitest";

import { getActivityPrimaryCommand } from "./ActivityPresenterPanel";

describe("ActivityPresenterPanel", () => {
  it("maps every runtime state to one primary presenter command", () => {
    expect(getActivityPrimaryCommand("draft")).toEqual({
      label: "응답 열기",
      nextStatus: "open"
    });
    expect(getActivityPrimaryCommand("open")).toEqual({
      label: "응답 마감",
      nextStatus: "closed"
    });
    expect(getActivityPrimaryCommand("closed")).toEqual({
      label: "결과 공개",
      nextStatus: "results"
    });
    expect(getActivityPrimaryCommand("results")).toEqual({
      label: "결과 숨기기",
      nextStatus: "closed"
    });
  });
});
