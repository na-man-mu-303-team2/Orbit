import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultLiveSttEngineId } from "../stt/liveSttEngineRegistry";
import { defaultSpeechTrackingConfig } from "../speech/speechTrackingConfig";
import {
  defaultPresenterSettings,
  loadPresenterSettings,
  presenterDeckSettingsStorageKeyPrefix,
  presenterGlobalSettingsStorageKey,
  savePresenterSettings,
  updatePresenterSettings
} from "./presenterSettings";

describe("presenterSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the agreed global key and defaults from STT and speech tracking config", () => {
    expect(presenterGlobalSettingsStorageKey).toBe("orbit:presenter:global:v1");
    expect(presenterDeckSettingsStorageKeyPrefix).toBe("orbit:presenter:deck:");
    expect(defaultPresenterSettings).toEqual({
      sttEngine: defaultLiveSttEngineId,
      advancePolicy: {
        rehearsal: true,
        live: true,
        threshold: 0.7
      },
      paceAdvice: {
        slowWpm: defaultSpeechTrackingConfig.paceAdvice.slowWpm,
        fastWpm: defaultSpeechTrackingConfig.paceAdvice.fastWpm
      },
      recording: {
        enabled: true
      },
      speechTracking: {
        diceThreshold: defaultSpeechTrackingConfig.diceThreshold,
        matchingTailCharacters: defaultSpeechTrackingConfig.matchingTailCharacters,
        hybridCoverage: defaultSpeechTrackingConfig.hybridCoverage,
        adviceReentryCooldownMs:
          defaultSpeechTrackingConfig.adviceReentryCooldownMs,
        biasPhraseBudget: defaultSpeechTrackingConfig.biasPhraseBudget
      }
    });
  });

  it("does not expose mode, debug transcript, or P4 timing fields as persisted settings", () => {
    const serialized = JSON.stringify(defaultPresenterSettings);

    expect(serialized).not.toContain("mode");
    expect(serialized).not.toContain("showDebugTranscript");
    expect(serialized).not.toContain("debugTranscript");
    expect(serialized).not.toContain("pauseMs");
    expect(serialized).not.toContain("countdownMs");
  });

  it("loads persisted settings with defensive normalization", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      presenterGlobalSettingsStorageKey,
      JSON.stringify({
        sttEngine: "web-speech",
        advancePolicy: {
          rehearsal: false,
          live: true,
          threshold: 0.99
        },
        paceAdvice: {
          slowWpm: 70,
          fastWpm: 150
        },
        recording: {
          enabled: false
        },
        speechTracking: {
          diceThreshold: 0.82,
          matchingTailCharacters: 24,
          hybridCoverage: {
            sentenceWeight: 0.6,
            wordWeight: 0.4,
            correctionWindow: 0.08
          },
          adviceReentryCooldownMs: 20000,
          biasPhraseBudget: 32
        }
      })
    );

    expect(loadPresenterSettings(storage)).toEqual({
      sttEngine: "web-speech",
      advancePolicy: {
        rehearsal: false,
        live: true,
        threshold: 0.95
      },
      paceAdvice: {
        slowWpm: 70,
        fastWpm: 150
      },
      recording: {
        enabled: false
      },
      speechTracking: {
        diceThreshold: 0.82,
        matchingTailCharacters: 24,
        hybridCoverage: {
          sentenceWeight: 0.6,
          wordWeight: 0.4,
          correctionWindow: 0.08
        },
        adviceReentryCooldownMs: 20000,
        biasPhraseBudget: 32
      }
    });
  });

  it("falls back to defaults for corrupt or blocked localStorage", () => {
    const corruptStorage = createMemoryStorage();
    corruptStorage.setItem(presenterGlobalSettingsStorageKey, "{");
    expect(loadPresenterSettings(corruptStorage)).toEqual(defaultPresenterSettings);

    const blockedStorage = {
      getItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      })
    };

    expect(loadPresenterSettings(blockedStorage)).toEqual(defaultPresenterSettings);
    expect(savePresenterSettings({ sttEngine: "moonshine" }, blockedStorage)).toEqual(
      {
        ...defaultPresenterSettings,
        sttEngine: "moonshine"
      }
    );
  });

  it("merges partial updates and persists normalized settings", () => {
    const storage = createMemoryStorage();

    const saved = savePresenterSettings(
      {
        sttEngine: "moonshine",
        advancePolicy: { threshold: 0.4 },
        paceAdvice: { slowWpm: 95 }
      },
      storage
    );

    expect(saved).toMatchObject({
      sttEngine: "moonshine",
      advancePolicy: { threshold: 0.5 },
      paceAdvice: { slowWpm: 95, fastWpm: 130 }
    });
    expect(loadPresenterSettings(storage)).toEqual(saved);

    const updated = updatePresenterSettings(
      (current) => ({
        speechTracking: {
          ...current.speechTracking,
          biasPhraseBudget: current.speechTracking.biasPhraseBudget + 4
        }
      }),
      storage
    );

    expect(updated.speechTracking.biasPhraseBudget).toBe(52);
    expect(loadPresenterSettings(storage)).toEqual(updated);
  });
});

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}
