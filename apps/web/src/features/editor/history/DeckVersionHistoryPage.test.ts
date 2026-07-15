import type { DeckSnapshot } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { canRestoreSnapshot, snapshotLabel, snapshotTone } from "./DeckVersionHistoryPage";

const snapshot: DeckSnapshot = {
  snapshotId: "snapshot_history_1",
  projectId: "project_history_1",
  deckId: "deck_history_1",
  version: 1,
  reason: "deck-replaced",
  createdAt: "2026-07-12T00:00:00.000Z",
};

describe("DeckVersionHistoryPage", () => {
  it("Viewer capability에서는 복원 action을 제공하지 않는다", () => {
    expect(canRestoreSnapshot(false, snapshot, 3)).toBe(false);
    expect(canRestoreSnapshot(true, snapshot, 3)).toBe(true);
    expect(canRestoreSnapshot(true, snapshot, 1)).toBe(false);
  });

  it("현재 덱 버전과 다른 최신 스냅샷을 현재 버전으로 표시하지 않는다", () => {
    expect(snapshotLabel(snapshot, 3)).toBe("자동 저장");
    expect(snapshotTone(snapshot, 3)).toBe("neutral");
  });

  it("현재 덱 버전과 일치하는 스냅샷만 현재 버전으로 표시한다", () => {
    expect(snapshotLabel(snapshot, 1)).toBe("현재 버전");
    expect(snapshotTone(snapshot, 1)).toBe("lilac");
  });
});
