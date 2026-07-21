import type { RehearsalUtteranceBoundary } from "@orbit/shared";
import { spawn } from "node:child_process";

export type RehearsalUtteranceAudioClip = {
  utteranceId: string;
  sequence: number;
  slideId: string | null;
  audio: Uint8Array;
  mimeType: "audio/wav";
};

type FfmpegRunner = (
  audio: Uint8Array,
  args: readonly string[],
) => Promise<Uint8Array>;

export async function extractRehearsalUtteranceAudioClips(input: {
  audio: Uint8Array;
  boundaries: readonly RehearsalUtteranceBoundary[];
  runFfmpeg?: FfmpegRunner;
}): Promise<RehearsalUtteranceAudioClip[]> {
  const runFfmpeg = input.runFfmpeg ?? runFfmpegInMemory;
  const clips: RehearsalUtteranceAudioClip[] = [];

  for (const boundary of [...input.boundaries].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const startSeconds = boundary.startMs / 1_000;
    const durationSeconds = (boundary.endMs - boundary.startMs) / 1_000;
    const audio = await runFfmpeg(
      input.audio,
      buildFfmpegClipArguments(startSeconds, durationSeconds),
    );
    clips.push({
      utteranceId: boundary.utteranceId,
      sequence: boundary.sequence,
      slideId: boundary.slideId,
      audio,
      mimeType: "audio/wav",
    });
  }

  return clips;
}

export function buildFfmpegClipArguments(
  startSeconds: number,
  durationSeconds: number,
) {
  if (
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 60
  ) {
    throw new Error("Invalid rehearsal utterance clip range.");
  }

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-ss",
    formatFfmpegSeconds(startSeconds),
    "-t",
    formatFfmpegSeconds(durationSeconds),
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    "pipe:1",
  ] as const;
}

async function runFfmpegInMemory(
  audio: Uint8Array,
  args: readonly string[],
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", [...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output: Buffer[] = [];
    process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    process.once("error", () => {
      reject(new Error("Rehearsal utterance clip extraction failed to start."));
    });
    process.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Rehearsal utterance clip extraction failed with code ${code ?? "unknown"}.`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(output));
    });
    process.stdin.end(Buffer.from(audio));
  });
}

function formatFfmpegSeconds(value: number) {
  return value.toFixed(3);
}
