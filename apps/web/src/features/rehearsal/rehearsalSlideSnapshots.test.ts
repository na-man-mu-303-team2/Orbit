import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PreparedRehearsalSlideSnapshotsError,
  clearPreparedRehearsalSlideSnapshots,
  readPreparedRehearsalSlideSnapshots,
  storePreparedRehearsalSlideSnapshots,
} from "./rehearsalSlideSnapshots";

function createSessionStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
}

describe("rehearsal slide snapshot handoff", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createSessionStorage());
    vi.stubGlobal("crypto", { randomUUID: () => "preparation-1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips snapshots only for the matching project, deck, and version", () => {
    const preparationId = storePreparedRehearsalSlideSnapshots({
      deckId: "deck-a",
      deckVersion: 3,
      projectId: "project-a",
      snapshots: [{ fileId: "file-a", slideId: "slide-a" }],
    });

    expect(
      readPreparedRehearsalSlideSnapshots({
        deckId: "deck-a",
        deckVersion: 3,
        preparationId,
        projectId: "project-a",
      }),
    ).toEqual([{ fileId: "file-a", slideId: "slide-a" }]);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "{"],
    [
      "stale",
      JSON.stringify({
        deckId: "deck-a",
        deckVersion: 2,
        projectId: "project-a",
        snapshots: [{ fileId: "file-a", slideId: "slide-a" }],
      }),
    ],
  ])("fails closed for a %s supplied handoff", (_label, serialized) => {
    if (serialized !== undefined) {
      sessionStorage.setItem(
        "orbit.rehearsalSlideSnapshots.v1:preparation-1",
        serialized,
      );
    }

    expect(() =>
      readPreparedRehearsalSlideSnapshots({
        deckId: "deck-a",
        deckVersion: 3,
        preparationId: "preparation-1",
        projectId: "project-a",
      }),
    ).toThrow(PreparedRehearsalSlideSnapshotsError);
    expect(
      sessionStorage.getItem("orbit.rehearsalSlideSnapshots.v1:preparation-1"),
    ).toBeNull();
  });

  it("rejects malformed snapshot entries instead of trusting sessionStorage", () => {
    sessionStorage.setItem(
      "orbit.rehearsalSlideSnapshots.v1:preparation-1",
      JSON.stringify({
        deckId: "deck-a",
        deckVersion: 3,
        projectId: "project-a",
        snapshots: [{ fileId: 3, slideId: "slide-a" }],
      }),
    );

    expect(() =>
      readPreparedRehearsalSlideSnapshots({
        deckId: "deck-a",
        deckVersion: 3,
        preparationId: "preparation-1",
        projectId: "project-a",
      }),
    ).toThrow(PreparedRehearsalSlideSnapshotsError);
  });

  it("clears the supplied handoff after it is consumed or rejected", () => {
    sessionStorage.setItem(
      "orbit.rehearsalSlideSnapshots.v1:preparation-1",
      "prepared",
    );

    clearPreparedRehearsalSlideSnapshots("preparation-1");

    expect(sessionStorage.length).toBe(0);
  });
});
