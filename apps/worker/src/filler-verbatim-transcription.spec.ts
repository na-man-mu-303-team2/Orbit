import { describe, expect, it, vi } from "vitest";
import {
  buildKoreanFillerVerbatimPrompt,
  koreanFillerVerbatimPromptVersion,
  transcribeMiniFillerUtterances,
} from "./filler-verbatim-transcription";
import type { RehearsalUtteranceAudioClip } from "./rehearsal-utterance-audio";

describe("mini filler verbatim transcription", () => {
  it("keeps the versioned verbatim rules and merges bounded pronunciation terms", () => {
    const prompt = buildKoreanFillerVerbatimPrompt([
      { source: "ORBIT", aliases: ["오르빗"] },
    ]);

    expect(koreanFillerVerbatimPromptVersion).toBe(
      "korean-filler-verbatim-v1",
    );
    expect(prompt).toContain("교정하거나 매끄럽게 바꾸지 마세요");
    expect(prompt).toContain("음, 어, 으, 아");
    expect(prompt).toContain("추측하지 마세요");
    expect(prompt).toContain("ORBIT: 오르빗");
  });

  it("uses concurrency two and restores utterance sequence after out-of-order responses", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return new Response(JSON.stringify({ text: file.name }));
    });
    const pending = transcribeMiniFillerUtterances({
      apiKey: "test-key",
      clips: [clip(3), clip(1), clip(2)],
      fetcher: fetcher as unknown as typeof fetch,
      model: "gpt-4o-mini-transcribe",
    });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]?.();
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[0]?.();
    releases[2]?.();

    const results = await pending;
    expect(maximumActive).toBe(2);
    expect(results.map((result) => result.sequence)).toEqual([1, 2, 3]);
    const firstForm = fetcher.mock.calls[0]?.[1]?.body as FormData;
    expect(firstForm.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(firstForm.get("language")).toBe("ko");
    expect(firstForm.get("response_format")).toBe("json");
  });

  it("retries one transient failure and degrades only the failed utterance", async () => {
    const events: unknown[] = [];
    const attempts = new Map<string, number>();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const file = (init?.body as FormData).get("file") as File;
      const attempt = (attempts.get(file.name) ?? 0) + 1;
      attempts.set(file.name, attempt);
      if (file.name === "utterance-1.wav" && attempt === 1) {
        return new Response("busy", { status: 503 });
      }
      if (file.name === "utterance-2.wav") {
        return new Response("bad", { status: 400 });
      }
      return new Response(JSON.stringify({ text: "음 결과" }));
    });

    const results = await transcribeMiniFillerUtterances({
      apiKey: "test-key",
      clips: [clip(1), clip(2)],
      fetcher: fetcher as unknown as typeof fetch,
      model: "gpt-4o-mini-transcribe",
      onEvent: (event) => events.push(event),
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      expect.objectContaining({ sequence: 1, status: "completed" }),
      expect.objectContaining({
        sequence: 2,
        status: "failed",
        errorCode: "FILLER_VERBATIM_REQUEST_REJECTED",
      }),
    ]);
    expect(events.at(-1)).toMatchObject({
      status: "degraded",
      completedUtterances: 1,
      utteranceCount: 2,
    });
    expect(JSON.stringify(events)).not.toContain("음 결과");
  });

  it("uses a 30-second abort signal and retries a timeout once", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      throw new DOMException("timed out", "TimeoutError");
    });

    const [result] = await transcribeMiniFillerUtterances({
      apiKey: "test-key",
      clips: [clip(1)],
      fetcher: fetcher as unknown as typeof fetch,
      model: "gpt-4o-mini-transcribe",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(result).toMatchObject({
      status: "failed",
      errorCode: "FILLER_VERBATIM_TIMEOUT",
    });
  });
});

function clip(sequence: number): RehearsalUtteranceAudioClip {
  return {
    utteranceId: `utterance-${sequence}`,
    sequence,
    slideId: `slide_${sequence}`,
    audio: new Uint8Array([sequence]),
    mimeType: "audio/wav",
  };
}
