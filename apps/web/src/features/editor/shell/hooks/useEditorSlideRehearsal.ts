import type { Slide } from "@orbit/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LiveSttAudioLevelEvent } from "../../../rehearsal/liveStt";
import { createLiveSttPort } from "../../../rehearsal/stt/liveSttEngineRegistry";
import {
  type LiveSttBiasPhrase,
  type LiveSttEngineId,
  type LiveSttPort,
  normalizeLiveSttBiasPhrases
} from "../../../rehearsal/stt/liveSttPort";
import { fetchLiveSttRuntimeConfig } from "../../../rehearsal/stt/liveSttRuntimeConfig";
import { normalizeLiveTranscriptText } from "../../../rehearsal/stt/liveTranscriptText";

export type EditorSlideRehearsalStatus =
  | "idle"
  | "starting"
  | "listening"
  | "stopped"
  | "error";

export type EditorSlideRehearsalState = {
  activeSlideId: string | null;
  audioLevelPercent: number;
  elapsedSeconds: number;
  engineId: LiveSttEngineId | null;
  errorMessage: string | null;
  finalTranscript: string;
  hitKeywordIds: string[];
  interimTranscript: string;
  status: EditorSlideRehearsalStatus;
};

const initialState: EditorSlideRehearsalState = {
  activeSlideId: null,
  audioLevelPercent: 0,
  elapsedSeconds: 0,
  engineId: null,
  errorMessage: null,
  finalTranscript: "",
  hitKeywordIds: [],
  interimTranscript: "",
  status: "idle"
};

const microphoneAudioConstraints: MediaTrackConstraints = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true
};

export function useEditorSlideRehearsal(args: { projectId: string }) {
  const [state, setState] = useState<EditorSlideRehearsalState>(initialState);
  const portRef = useRef<LiveSttPort | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const sessionRef = useRef(0);
  const committedTranscriptRef = useRef("");
  const activeSlideRef = useRef<Slide | null>(null);

  const releaseResources = useCallback(async () => {
    const port = portRef.current;
    const stream = streamRef.current;
    portRef.current = null;
    streamRef.current = null;
    unsubscribeRef.current.splice(0).forEach((unsubscribe) => unsubscribe());

    if (port) {
      await port.stop().catch(() => undefined);
      await Promise.resolve(port.dispose()).catch(() => undefined);
    }
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const start = useCallback(
    async (slide: Slide) => {
      const sessionId = sessionRef.current + 1;
      sessionRef.current = sessionId;
      await releaseResources();
      if (sessionRef.current !== sessionId) return;

      activeSlideRef.current = slide;
      committedTranscriptRef.current = "";
      setState({
        ...initialState,
        activeSlideId: slide.slideId,
        status: "starting"
      });

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저에서는 마이크 입력을 사용할 수 없습니다.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneAudioConstraints,
          video: false
        });
        if (sessionRef.current !== sessionId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const runtimeConfig = await fetchLiveSttRuntimeConfig();
        if (sessionRef.current !== sessionId) return;

        const port = createLiveSttPort(runtimeConfig.liveSttEngine, {
          projectId: args.projectId,
          onAudioLevel: (level) => {
            if (sessionRef.current !== sessionId) return;
            setState((current) => ({
              ...current,
              audioLevelPercent: getEditorLiveAudioLevelPercent(level)
            }));
          }
        });
        portRef.current = port;

        unsubscribeRef.current = [
          port.onResult((result) => {
            if (sessionRef.current !== sessionId) return;

            if (result.isFinal) {
              committedTranscriptRef.current = appendTranscript(
                committedTranscriptRef.current,
                result.text
              );
            }
            const finalTranscript = committedTranscriptRef.current;
            const interimTranscript = result.isFinal ? "" : result.text.trim();
            const transcript = appendTranscript(finalTranscript, interimTranscript);
            const activeSlide = activeSlideRef.current;

            setState((current) => ({
              ...current,
              finalTranscript,
              hitKeywordIds: activeSlide
                ? getHitSlideKeywordIds(activeSlide, transcript)
                : [],
              interimTranscript
            }));
          }),
          port.onError((error) => {
            if (sessionRef.current !== sessionId) return;
            sessionRef.current += 1;
            void releaseResources();
            setState((current) => ({
              ...current,
              audioLevelPercent: 0,
              errorMessage: error.message || "음성 인식을 계속할 수 없습니다.",
              status: "error"
            }));
          })
        ];

        await port.start({
          audioSource: stream,
          biasPhrases: buildEditorSlideRehearsalBiasPhrases(slide),
          language: "ko"
        });
        if (sessionRef.current !== sessionId) return;

        setState((current) => ({
          ...current,
          engineId: runtimeConfig.liveSttEngine,
          status: "listening"
        }));
      } catch (error) {
        if (sessionRef.current !== sessionId) return;
        await releaseResources();
        setState((current) => ({
          ...current,
          audioLevelPercent: 0,
          errorMessage: getSlideRehearsalErrorMessage(error),
          status: "error"
        }));
      }
    },
    [args.projectId, releaseResources]
  );

  const enter = useCallback(
    (slide: Slide) => {
      sessionRef.current += 1;
      void releaseResources();
      activeSlideRef.current = slide;
      committedTranscriptRef.current = "";
      setState({
        ...initialState,
        activeSlideId: slide.slideId,
        status: "idle"
      });
    },
    [releaseResources]
  );

  const stop = useCallback(async () => {
    sessionRef.current += 1;
    await releaseResources();
    setState((current) => ({
      ...current,
      audioLevelPercent: 0,
      interimTranscript: "",
      status: current.activeSlideId ? "stopped" : "idle"
    }));
  }, [releaseResources]);

  const exit = useCallback(async () => {
    sessionRef.current += 1;
    await releaseResources();
    activeSlideRef.current = null;
    committedTranscriptRef.current = "";
    setState(initialState);
  }, [releaseResources]);

  useEffect(() => {
    if (state.status !== "listening") return;
    const timer = window.setInterval(() => {
      setState((current) => ({
        ...current,
        elapsedSeconds: current.elapsedSeconds + 1
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.status]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      void releaseResources();
    },
    [releaseResources]
  );

  return { enter, exit, start, state, stop };
}

export function buildEditorSlideRehearsalBiasPhrases(
  slide: Slide
): LiveSttBiasPhrase[] {
  const phrases: LiveSttBiasPhrase[] = slide.keywords.flatMap((keyword) => [
    {
      canonicalText: keyword.text,
      keywordId: keyword.keywordId,
      source: "keyword" as const,
      text: keyword.text,
      weight: 1
    },
    ...keyword.synonyms.map((text) => ({
      canonicalText: keyword.text,
      keywordId: keyword.keywordId,
      source: "synonym" as const,
      text,
      weight: 0.9
    })),
    ...keyword.abbreviations.map((text) => ({
      canonicalText: keyword.text,
      keywordId: keyword.keywordId,
      source: "abbreviation" as const,
      text,
      weight: 0.9
    }))
  ]);

  if (slide.title.trim()) {
    phrases.push({ source: "title", text: slide.title, weight: 0.75 });
  }

  slide.speakerNotes
    .split(/[.!?\n]+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 5)
    .forEach((text) => {
      phrases.push({
        source: "speaker-notes",
        text: text.slice(0, 80),
        weight: 0.45
      });
    });

  return normalizeLiveSttBiasPhrases(phrases).slice(0, 32);
}

export function getHitSlideKeywordIds(slide: Slide, transcript: string) {
  const normalizedTranscript = normalizeLiveTranscriptText(transcript);
  if (!normalizedTranscript) return [];

  return slide.keywords
    .filter((keyword) =>
      [keyword.text, ...keyword.synonyms, ...keyword.abbreviations].some(
        (term) => {
          const normalizedTerm = normalizeLiveTranscriptText(term);
          return Boolean(normalizedTerm) && normalizedTranscript.includes(normalizedTerm);
        }
      )
    )
    .map((keyword) => keyword.keywordId);
}

export function getEditorLiveAudioLevelPercent(
  level: LiveSttAudioLevelEvent | null
) {
  if (!level) return 0;
  return Math.min(100, Math.max(0, ((level.rmsDb + 55) / 55) * 100));
}

function appendTranscript(current: string, addition: string) {
  const next = addition.trim();
  if (!next) return current.trim();
  return current.trim() ? `${current.trim()} ${next}` : next;
}

function getSlideRehearsalErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "마이크 권한이 필요합니다. 브라우저 설정에서 마이크 사용을 허용해 주세요.";
    }
    if (error.name === "NotFoundError") {
      return "사용할 수 있는 마이크를 찾지 못했습니다.";
    }
  }

  return error instanceof Error
    ? error.message
    : "슬라이드 리허설을 시작하지 못했습니다.";
}
