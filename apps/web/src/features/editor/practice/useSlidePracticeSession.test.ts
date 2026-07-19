import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  describePracticeQuality,
  formatPracticePace,
  getSlidePracticeStartLabel,
  SlidePracticeRuntimeNotice,
} from "./SlidePracticePanel";
import { countSpokenSyllables } from "./fillerAnalyzer";
import {
  createPracticeTranscriptState,
  finalizePracticeTranscript,
  getSlidePracticeErrorMessage,
  prepareSlidePracticeStart,
  resolveSlidePracticeRuntimeState,
  shouldUpdateVoiceBaseline,
  slidePracticeDisabledMessage,
  slidePracticeRuntimeUnavailableMessage,
  updatePracticeTranscript,
} from "./useSlidePracticeSession";

describe("slide practice transcript finalization", () => {
  it("final 없이 종료된 마지막 interim 전사를 분석 입력으로 보존한다", () => {
    const transcript = updatePracticeTranscript(createPracticeTranscriptState(), {
      isFinal: false,
      text: " 발표를 시작하겠습니다 ",
    });

    expect(finalizePracticeTranscript(transcript)).toBe("발표를 시작하겠습니다");
  });

  it("stop 중 final이 도착하면 같은 interim을 중복해서 합치지 않는다", () => {
    const interim = updatePracticeTranscript(createPracticeTranscriptState(), {
      isFinal: false,
      text: "발표를 시작하겠습니다",
    });
    const final = updatePracticeTranscript(interim, {
      isFinal: true,
      text: "발표를 시작하겠습니다",
    });

    expect(final.interim).toBe("");
    expect(finalizePracticeTranscript(final)).toBe("발표를 시작하겠습니다");
  });

  it("완료된 문장 뒤의 마지막 interim 문장을 함께 보존한다", () => {
    const first = updatePracticeTranscript(createPracticeTranscriptState(), {
      isFinal: true,
      text: "첫 번째 문장입니다",
    });
    const second = updatePracticeTranscript(first, {
      isFinal: false,
      text: "두 번째 문장입니다",
    });

    expect(finalizePracticeTranscript(second)).toBe("첫 번째 문장입니다 두 번째 문장입니다");
  });
});

describe("slide practice feature gate guidance", () => {
  it("서버의 비활성화 403 메시지를 사용자 안내로 바꾼다", () => {
    expect(
      getSlidePracticeErrorMessage(
        new Error("Slide practice is not enabled."),
        "연습 녹음을 완료하지 못했습니다.",
      ),
    ).toBe(slidePracticeDisabledMessage);
  });

  it("활성, 비활성, 조회 실패 runtime config를 서로 다른 상태로 구분한다", async () => {
    await expect(resolveSlidePracticeRuntimeState(async () => ({
      slidePracticeEnabled: true,
    }))).resolves.toBe("enabled");
    await expect(resolveSlidePracticeRuntimeState(async () => ({
      slidePracticeEnabled: false,
    }))).resolves.toBe("disabled");
    await expect(resolveSlidePracticeRuntimeState(async () => {
      throw new Error("runtime config unavailable");
    })).resolves.toBe("unavailable");
  });

  it.each(["checking", "disabled", "unavailable"] as const)(
    "%s 상태에서는 저장 준비, 장치 식별, 마이크 시작을 모두 막는다",
    async (runtimeState) => {
      const beforeStart = vi.fn(async () => undefined);
      const getDeviceIdHash = vi.fn(async () => "device-hash");
      const startAudio = vi.fn(async () => "stream");

      await expect(prepareSlidePracticeStart({
        runtimeState,
        beforeStart,
        getDeviceIdHash,
        startAudio,
      })).rejects.toThrow();

      expect(beforeStart).not.toHaveBeenCalled();
      expect(getDeviceIdHash).not.toHaveBeenCalled();
      expect(startAudio).not.toHaveBeenCalled();
    },
  );

  it("활성 상태에서는 기존 녹음 준비 순서를 유지한다", async () => {
    const calls: string[] = [];

    await expect(prepareSlidePracticeStart({
      runtimeState: "enabled",
      beforeStart: async () => { calls.push("before-start"); },
      getDeviceIdHash: async () => {
        calls.push("device-id");
        return "device-hash";
      },
      startAudio: async () => {
        calls.push("audio-start");
        return "stream";
      },
    })).resolves.toEqual({ deviceIdHash: "device-hash", stream: "stream" });

    expect(calls).toEqual(["before-start", "device-id", "audio-start"]);
  });

  it("비활성과 조회 실패를 다른 안내로 표시하고 조회 실패에 재시도를 제공한다", () => {
    const disabledHtml = renderToStaticMarkup(
      createElement(SlidePracticeRuntimeNotice, {
        onRetry: vi.fn(),
        runtimeState: "disabled",
      }),
    );
    const unavailableHtml = renderToStaticMarkup(
      createElement(SlidePracticeRuntimeNotice, {
        onRetry: vi.fn(),
        runtimeState: "unavailable",
      }),
    );

    expect(disabledHtml).toContain(slidePracticeDisabledMessage);
    expect(disabledHtml).not.toContain("설정 다시 확인");
    expect(unavailableHtml).toContain(slidePracticeRuntimeUnavailableMessage);
    expect(unavailableHtml).toContain("설정 다시 확인");
    expect(getSlidePracticeStartLabel("idle", "checking")).toBe("연습 기능 확인 중…");
    expect(getSlidePracticeStartLabel("idle", "unavailable")).toBe("설정 확인 필요");
  });
});

describe("slide practice insufficient speech guidance", () => {
  it("전사가 비었을 때 0.0 대신 측정 안 됨을 표시한다", () => {
    expect(formatPracticePace(0, 0)).toBe("측정 안 됨");
  });

  it("최소 음절과 연습 시간 기준을 사용자 문장으로 설명한다", () => {
    const message = describePracticeQuality({
      durationMs: 2_500,
      reasons: ["insufficient-speech"],
      syllableCount: 4,
    });

    expect(countSpokenSyllables("음 어 그 로")).toBe(4);
    expect(message).toContain("전사된 음절이 4개입니다");
    expect(message).toContain("5음절 이상");
    expect(message).toContain("3초 이상");
    expect(message).not.toContain("insufficient-speech");
  });

  it("측정 불충분 결과는 개인 목소리 기준값에 합치지 않는다", () => {
    expect(shouldUpdateVoiceBaseline("unmeasured", 10_000)).toBe(false);
    expect(shouldUpdateVoiceBaseline("measured", 4_999)).toBe(false);
    expect(shouldUpdateVoiceBaseline("partial", 5_000)).toBe(true);
  });
});
