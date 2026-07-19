import type { Slide } from "@orbit/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { createSpeechTracker, type SpeechTracker } from "../rehearsal/speech/speechTracker";
import type { SpeechTrackerSnapshot } from "../rehearsal/speech/speechTrackingEvents";
import { createLiveSttPort } from "../rehearsal/stt/liveSttEngineRegistry";
import type { LiveSttPort } from "../rehearsal/stt/liveSttPort";
import { normalizeLiveSttBiasPhrases } from "../rehearsal/stt/liveSttPort";
import { fetchLiveSttRuntimeConfig } from "../rehearsal/stt/liveSttRuntimeConfig";

type PresentationSpeechState = {
  error: string | null;
  snapshot: SpeechTrackerSnapshot | null;
  status: "idle" | "starting" | "listening" | "stopped" | "error";
  wordsPerMinute: number;
};

const initialState: PresentationSpeechState = {
  error: null,
  snapshot: null,
  status: "idle",
  wordsPerMinute: 0,
};

export function usePresentationSpeech(projectId?: string) {
  const [state, setState] = useState(initialState);
  const portRef = useRef<LiveSttPort | null>(null);
  const trackerRef = useRef<SpeechTracker | null>(null);
  const slideRef = useRef<Slide | null>(null);
  const startedAtRef = useRef(0);
  const finalWordCountRef = useRef(0);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  const enterSlide = useCallback((slide: Slide) => {
    slideRef.current = slide;
    trackerRef.current = createSpeechTracker({
      keywords: slide.keywords,
      slideId: slide.slideId,
      speakerNotes: slide.speakerNotes,
    });
    setState((current) => ({
      ...current,
      snapshot: trackerRef.current?.snapshot() ?? null,
    }));
    void Promise.resolve(
      portRef.current?.updateBiasPhrases(buildPresentationBiasPhrases(slide)),
    ).catch(() => undefined);
  }, []);

  const stop = useCallback(async () => {
    const port = portRef.current;
    portRef.current = null;
    const unsubscribers = unsubscribersRef.current.splice(0);
    if (port) {
      await port.stop().catch(() => undefined);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      await Promise.resolve(port.dispose()).catch(() => undefined);
    } else {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    }
    setState((current) => ({ ...current, status: "stopped" }));
  }, []);

  const start = useCallback(
    async (stream: MediaStream, slide: Slide) => {
      await stop();
      enterSlide(slide);
      setState((current) => ({ ...current, error: null, status: "starting" }));
      try {
        const runtimeConfig = await fetchLiveSttRuntimeConfig();
        const port = createLiveSttPort(runtimeConfig.liveSttEngine, { projectId });
        portRef.current = port;
        startedAtRef.current = Date.now();
        finalWordCountRef.current = 0;
        unsubscribersRef.current = [
          port.onResult((result) => {
            const tracker = trackerRef.current;
            if (!tracker) return;
            tracker.acceptResult(result);
            if (result.isFinal) {
              finalWordCountRef.current += result.text.trim().split(/\s+/).filter(Boolean).length;
            }
            const elapsedMinutes = Math.max((Date.now() - startedAtRef.current) / 60_000, 1 / 60);
            setState((current) => ({
              ...current,
              snapshot: tracker.snapshot(),
              wordsPerMinute: Math.round(finalWordCountRef.current / elapsedMinutes),
            }));
          }),
          port.onError((error) => {
            setState((current) => ({
              ...current,
              error: error.message || "실시간 음성 인식을 계속할 수 없습니다.",
              status: "error",
            }));
          }),
        ];
        await port.start({
          audioSource: stream,
          biasPhrases: buildPresentationBiasPhrases(slide),
          language: "ko",
        });
        setState((current) => ({ ...current, status: "listening" }));
      } catch (cause) {
        await stop();
        setState((current) => ({
          ...current,
          error: cause instanceof Error ? cause.message : "실시간 음성 인식을 시작하지 못했습니다.",
          status: "error",
        }));
      }
    },
    [enterSlide, projectId, stop],
  );

  useEffect(() => () => void stop(), [stop]);

  return { enterSlide, start, state, stop };
}

function buildPresentationBiasPhrases(slide: Slide) {
  return normalizeLiveSttBiasPhrases([
    ...slide.keywords.flatMap((keyword) => [
      { canonicalText: keyword.text, keywordId: keyword.keywordId, source: "keyword" as const, text: keyword.text, weight: 1 },
      ...keyword.synonyms.map((text) => ({ canonicalText: keyword.text, keywordId: keyword.keywordId, source: "synonym" as const, text, weight: 0.9 })),
      ...keyword.abbreviations.map((text) => ({ canonicalText: keyword.text, keywordId: keyword.keywordId, source: "abbreviation" as const, text, weight: 0.9 })),
    ]),
    ...(slide.title.trim() ? [{ source: "title" as const, text: slide.title, weight: 0.75 }] : []),
  ]).slice(0, 32);
}
