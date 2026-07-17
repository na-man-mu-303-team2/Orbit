import { useCallback, useEffect, useRef, useState } from "react";

export type FocusedPracticeCapture = { blob: Blob; durationMs: number };

export function useFocusedPracticeAudio(
  maxDurationMs = 300_000,
  audioConstraints: MediaTrackConstraints | true = true,
) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const stopTimer = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [automaticCapture, setAutomaticCapture] = useState<FocusedPracticeCapture | null>(null);

  const stop = useCallback(() => new Promise<FocusedPracticeCapture>((resolve, reject) => {
    const current = recorder.current;
    if (!current || current.state === "inactive") {
      reject(new Error("녹음 중이 아닙니다."));
      return;
    }
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
    stopTimer.current = null;
    current.onstop = () => {
      const blob = new Blob(chunks.current, { type: current.mimeType || "audio/webm" });
      chunks.current = [];
      recorder.current = null;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setRecording(false);
      resolve({ blob, durationMs: Math.min(maxDurationMs, Math.max(1, Date.now() - startedAt.current)) });
    };
    current.stop();
  }), [maxDurationMs]);

  const start = useCallback(async () => {
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    chunks.current = [];
    const next = new MediaRecorder(stream.current, { mimeType: "audio/webm" });
    next.ondataavailable = (event) => { if (event.data.size > 0) chunks.current.push(event.data); };
    next.start(); recorder.current = next; startedAt.current = Date.now(); setRecording(true);
    stopTimer.current = window.setTimeout(() => {
      void stop().then(setAutomaticCapture);
    }, maxDurationMs);
  }, [audioConstraints, maxDurationMs, stop]);
  useEffect(() => () => {
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
    recorder.current?.stop(); stream.current?.getTracks().forEach((track) => track.stop()); chunks.current = [];
  }, []);
  return {
    recording,
    start,
    stop,
    automaticCapture,
    clearAutomaticCapture: () => setAutomaticCapture(null),
  };
}
