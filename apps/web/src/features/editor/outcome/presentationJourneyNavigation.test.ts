import { describe, expect, it, vi } from "vitest";

import {
  createPresentationJourneyNavigationCoordinator,
  type PresentationJourneyNavigationResult,
  type PresentationJourneySaveOutcome,
} from "./presentationJourneyNavigation";

describe("createPresentationJourneyNavigationCoordinator", () => {
  it("runs save, optional preparation, and navigation in order", async () => {
    const calls: string[] = [];
    const coordinator = createPresentationJourneyNavigationCoordinator({
      navigate: async (destination) => {
        calls.push(`navigate:${destination}`);
      },
      prepare: async (destination) => {
        calls.push(`prepare:${destination}`);
      },
      save: async (destination) => {
        calls.push(`save:${destination}`);
        return { status: "saved" };
      },
    });

    await expect(coordinator.navigate("rehearsal")).resolves.toEqual({
      destination: "rehearsal",
      status: "navigated",
    });
    expect(calls).toEqual([
      "save:rehearsal",
      "prepare:rehearsal",
      "navigate:rehearsal",
    ]);
  });

  it.each([
    ["save-error", "저장 서버에 연결하지 못했습니다."],
    ["version-conflict", "다른 변경을 확인한 뒤 다시 시도해 주세요."],
    ["content-changed", "새 편집 내용을 저장한 뒤 다시 시도해 주세요."],
  ] as const)(
    "returns the %s save block without preparation or navigation",
    async (reason, recoveryMessage) => {
      const prepare = vi.fn();
      const navigate = vi.fn();
      const coordinator = createPresentationJourneyNavigationCoordinator({
        navigate,
        prepare,
        save: async () => ({
          reason,
          recoveryMessage,
          status: "blocked",
        }),
      });

      await expect(coordinator.navigate("presentation")).resolves.toEqual({
        destination: "presentation",
        reason,
        recoveryMessage,
        status: "blocked",
      });
      expect(prepare).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("ignores same-tick duplicates before the first save resolves", async () => {
    let releaseSave: ((outcome: PresentationJourneySaveOutcome) => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<PresentationJourneySaveOutcome>((resolve) => {
          releaseSave = resolve;
        }),
    );
    const prepare = vi.fn();
    const navigate = vi.fn();
    const coordinator = createPresentationJourneyNavigationCoordinator({
      navigate,
      prepare,
      save,
    });

    const first = coordinator.navigate("brief");
    const duplicate = coordinator.navigate("brief");

    await expect(duplicate).resolves.toEqual({
      destination: "brief",
      status: "ignored-duplicate",
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    releaseSave?.({ status: "saved" });
    await expect(first).resolves.toEqual({
      destination: "brief",
      status: "navigated",
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("maps a thrown save failure to a blocked result and releases the lock", async () => {
    const save = vi
      .fn<() => Promise<PresentationJourneySaveOutcome>>()
      .mockRejectedValueOnce(new Error("저장 요청이 실패했습니다."))
      .mockResolvedValueOnce({ status: "saved" });
    const navigate = vi.fn();
    const coordinator = createPresentationJourneyNavigationCoordinator({
      navigate,
      save,
    });

    await expect(coordinator.navigate("brief")).resolves.toEqual({
      destination: "brief",
      reason: "save-error",
      recoveryMessage: "저장 요청이 실패했습니다.",
      status: "blocked",
    });
    await expect(coordinator.navigate("brief")).resolves.toEqual({
      destination: "brief",
      status: "navigated",
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("maps a thrown preparation failure to a blocked result and releases the lock", async () => {
    const prepare = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("snapshot 준비에 실패했습니다."))
      .mockResolvedValueOnce();
    const navigate = vi.fn();
    const coordinator = createPresentationJourneyNavigationCoordinator({
      navigate,
      prepare,
      save: async () => ({ status: "saved" }),
    });

    await expect(coordinator.navigate("rehearsal")).resolves.toEqual({
      destination: "rehearsal",
      reason: "preparation-error",
      recoveryMessage: "snapshot 준비에 실패했습니다.",
      status: "blocked",
    });
    expect(navigate).not.toHaveBeenCalled();

    await expect(coordinator.navigate("rehearsal")).resolves.toEqual({
      destination: "rehearsal",
      status: "navigated",
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("supports a Viewer caller with a no-op saved save step", async () => {
    const save = vi.fn(async () => ({ status: "saved" as const }));
    const navigate = vi.fn();
    const coordinator = createPresentationJourneyNavigationCoordinator({
      navigate,
      save,
    });

    const result: PresentationJourneyNavigationResult =
      await coordinator.navigate("rehearsal");

    expect(result).toEqual({
      destination: "rehearsal",
      status: "navigated",
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("rehearsal");
  });
});
