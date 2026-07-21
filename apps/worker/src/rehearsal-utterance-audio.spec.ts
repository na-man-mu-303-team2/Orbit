import { describe, expect, it, vi } from "vitest";
import {
  buildFfmpegClipArguments,
  extractRehearsalUtteranceAudioClips,
} from "./rehearsal-utterance-audio";

describe("rehearsal utterance audio", () => {
  it("extracts private recording clips in sequence without a storage write", async () => {
    const sourceAudio = new Uint8Array([1, 2, 3]);
    const runFfmpeg = vi.fn(async (_audio: Uint8Array, args: readonly string[]) =>
      new Uint8Array([Number(args[6]?.split(".")[0] ?? 0)]),
    );

    const clips = await extractRehearsalUtteranceAudioClips({
      audio: sourceAudio,
      boundaries: [
        {
          utteranceId: "utterance-2",
          sequence: 2,
          startMs: 2_000,
          endMs: 3_500,
          commitReason: "silence",
          slideId: "slide_2",
          deckRevision: 1,
        },
        {
          utteranceId: "utterance-1",
          sequence: 1,
          startMs: 0,
          endMs: 1_000,
          commitReason: "silence",
          slideId: "slide_1",
          deckRevision: 1,
        },
      ],
      runFfmpeg,
    });

    expect(clips.map((clip) => clip.utteranceId)).toEqual([
      "utterance-1",
      "utterance-2",
    ]);
    expect(runFfmpeg).toHaveBeenNthCalledWith(
      1,
      sourceAudio,
      expect.arrayContaining(["-ss", "0.000", "-t", "1.000"]),
    );
    expect(clips[0]).toMatchObject({ mimeType: "audio/wav", slideId: "slide_1" });
  });

  it("rejects ranges longer than the in-memory coaching clip cap", () => {
    expect(() => buildFfmpegClipArguments(0, 60.001)).toThrow(
      "Invalid rehearsal utterance clip range.",
    );
  });
});
