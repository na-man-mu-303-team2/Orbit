import { rehearsalAudioPlaybackUrlResponseSchema } from "@orbit/shared";
import { useCallback, useEffect, useRef, useState } from "react";

type PlaybackStatus = "idle" | "loading" | "playing";

type CachedPlaybackUrl = {
  expiresAtMs: number;
  playbackUrl: string;
};

type PlaybackState = {
  error: string | null;
  segmentId: string | null;
  status: PlaybackStatus;
};

const playbackUrlRefreshMarginMs = 30_000;

export function useRehearsalAudioSegmentPlayback(runId: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cachedUrlRef = useRef<CachedPlaybackUrl | null>(null);
  const activeEndSecondsRef = useRef<number | null>(null);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<PlaybackState>({
    error: null,
    segmentId: null,
    status: "idle",
  });

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    const finishPlayback = () => {
      activeEndSecondsRef.current = null;
      setState({ error: null, segmentId: null, status: "idle" });
    };
    audio.addEventListener("timeupdate", () => {
      const endSeconds = activeEndSecondsRef.current;
      if (endSeconds !== null && audio.currentTime >= endSeconds - 0.03) {
        audio.pause();
        finishPlayback();
      }
    });
    audio.addEventListener("ended", finishPlayback);
    audioRef.current = audio;
    return audio;
  }, []);

  const stop = useCallback(() => {
    requestGenerationRef.current += 1;
    activeEndSecondsRef.current = null;
    audioRef.current?.pause();
    setState({ error: null, segmentId: null, status: "idle" });
  }, []);

  const getPlaybackUrl = useCallback(async () => {
    const cached = cachedUrlRef.current;
    if (cached && cached.expiresAtMs - playbackUrlRefreshMarginMs > Date.now()) {
      return cached.playbackUrl;
    }

    const response = await fetch(
      `/api/v1/rehearsals/${encodeURIComponent(runId)}/audio/playback-url`,
    );
    if (response.status === 410) {
      throw new Error("보관 기간이 지나 음성을 재생할 수 없어요.");
    }
    if (!response.ok) {
      throw new Error("음성을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }

    const playback = rehearsalAudioPlaybackUrlResponseSchema.parse(
      await response.json(),
    );
    cachedUrlRef.current = {
      expiresAtMs: Date.parse(playback.expiresAt),
      playbackUrl: playback.playbackUrl,
    };
    return playback.playbackUrl;
  }, [runId]);

  const playSegment = useCallback(
    async (segmentId: string, startSeconds: number, endSeconds: number) => {
      const generation = requestGenerationRef.current + 1;
      requestGenerationRef.current = generation;
      const audio = getAudio();
      audio.pause();
      activeEndSecondsRef.current = null;
      setState({ error: null, segmentId, status: "loading" });

      try {
        const playbackUrl = await getPlaybackUrl();
        if (requestGenerationRef.current !== generation) return;

        if (audio.src !== playbackUrl) {
          audio.src = playbackUrl;
          audio.load();
          await waitForAudioMetadata(audio);
        }
        if (requestGenerationRef.current !== generation) return;

        audio.currentTime = Math.max(0, startSeconds);
        activeEndSecondsRef.current = Math.max(startSeconds, endSeconds);
        await audio.play();
        if (requestGenerationRef.current !== generation) {
          audio.pause();
          return;
        }
        setState({ error: null, segmentId, status: "playing" });
      } catch (error) {
        if (requestGenerationRef.current !== generation) return;
        activeEndSecondsRef.current = null;
        audio.pause();
        setState({
          error:
            error instanceof Error
              ? error.message
              : "음성을 재생하지 못했어요.",
          segmentId: null,
          status: "idle",
        });
      }
    },
    [getAudio, getPlaybackUrl],
  );

  useEffect(
    () => () => {
      requestGenerationRef.current += 1;
      activeEndSecondsRef.current = null;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    },
    [],
  );

  return { ...state, playSegment, stop };
}

function waitForAudioMetadata(audio: HTMLAudioElement) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("음성 파일을 재생할 수 없어요."));
    };
    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("error", handleError);
  });
}
