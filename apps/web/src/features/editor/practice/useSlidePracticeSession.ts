import type {
  SlidePracticeReport,
  VoiceBaselineMetrics,
  VoiceBaselineRecord,
} from "@orbit/shared";
import { useEffect, useRef, useState } from "react";

import { createLiveSttPort } from "../../rehearsal/stt/liveSttEngineRegistry";
import type { LiveSttPort } from "../../rehearsal/stt/liveSttPort";
import { analyzeKoreanFillers, countSpokenSyllables } from "./fillerAnalyzer";
import { BrowserPcmVoiceAnalyzer } from "./pcmVoiceAnalyzer";
import {
  enqueueOfflinePracticeReport,
  getStableDeviceIdHash,
  getVoiceBaseline,
  persistSlidePracticeReport,
  upsertVoiceBaseline,
} from "./slidePracticeApi";
import { classifyVoiceStyle } from "./voiceStyleClassifier";

type PracticeSessionState = "idle" | "starting" | "recording" | "stopping" | "completed" | "error";

export function useSlidePracticeSession(input: {
  projectId: string;
  deckId: string;
  deckVersion: number;
  slideId: string | null;
  slideOrder: number;
  biasPhrases: string[];
}) {
  const [state, setState] = useState<PracticeSessionState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [report, setReport] = useState<SlidePracticeReport | null>(null);
  const [message, setMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<BrowserPcmVoiceAnalyzer | null>(null);
  const sttRef = useRef<LiveSttPort | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptPartsRef = useRef<string[]>([]);
  const confidencesRef = useRef<number[]>([]);
  const sttEngineRef = useRef<"web-speech" | "openai-realtime" | "none">("none");
  const deviceIdHashRef = useRef<string | null>(null);
  const baselineRef = useRef<VoiceBaselineRecord | null>(null);
  const sessionSnapshotRef = useRef<{
    practiceSessionId: string;
    slideId: string;
    slideOrder: number;
    deckId: string;
    deckVersion: number;
    startedAt: string;
  } | null>(null);

  async function start() {
    if (!input.slideId || state === "starting" || state === "recording") return;
    setState("starting");
    setMessage("");
    setReport(null);
    setInterimTranscript("");
    setFinalTranscript("");
    transcriptPartsRef.current = [];
    confidencesRef.current = [];
    sttEngineRef.current = "none";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      streamRef.current = stream;
      const analyzer = new BrowserPcmVoiceAnalyzer();
      analyzerRef.current = analyzer;
      await analyzer.start(stream);
      const startedAt = Date.now();
      startedAtRef.current = startedAt;
      sessionSnapshotRef.current = {
        practiceSessionId: `slide_practice_${crypto.randomUUID()}`,
        slideId: input.slideId,
        slideOrder: input.slideOrder,
        deckId: input.deckId,
        deckVersion: input.deckVersion,
        startedAt: new Date(startedAt).toISOString(),
      };
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
      setElapsedMs(0);

      try {
        deviceIdHashRef.current = await getStableDeviceIdHash();
        baselineRef.current = await getVoiceBaseline(deviceIdHashRef.current).catch(() => null);
      } catch {
        deviceIdHashRef.current = null;
        baselineRef.current = null;
      }

      const webSpeech = createLiveSttPort("web-speech", { projectId: input.projectId });
      attachStt(webSpeech);
      try {
        await webSpeech.start({
          language: "ko",
          audioSource: stream,
          biasPhrases: input.biasPhrases.map((text) => ({ text, weight: 0.8, source: "keyword" })),
        });
        sttRef.current = webSpeech;
        sttEngineRef.current = "web-speech";
      } catch (webSpeechError) {
        await webSpeech.dispose();
        const fallback = createLiveSttPort("openai-realtime", { projectId: input.projectId });
        attachStt(fallback);
        try {
          await fallback.start({ language: "ko", audioSource: stream });
          sttRef.current = fallback;
          sttEngineRef.current = "openai-realtime";
          setMessage("온디바이스 전사를 사용할 수 없어 서버 실시간 전사로 전환했습니다.");
        } catch {
          await fallback.dispose();
          setMessage(webSpeechError instanceof Error
            ? `${webSpeechError.message} 서버 실시간 전사도 사용할 수 없어 목소리 분석만 계속합니다.`
            : "전사는 사용할 수 없지만 목소리 분석은 계속합니다.");
        }
      }
      setState("recording");
    } catch (error) {
      cleanupMedia();
      setState("error");
      setMessage(error instanceof Error ? error.message : "마이크를 시작하지 못했습니다.");
    }
  }

  async function stop() {
    if (state !== "recording" || !startedAtRef.current || !sessionSnapshotRef.current) return;
    setState("stopping");
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const durationMs = Math.max(1, Date.now() - startedAtRef.current);
    setElapsedMs(durationMs);
    await sttRef.current?.stop().catch(() => undefined);
    await sttRef.current?.dispose();
    sttRef.current = null;
    const transcript = transcriptPartsRef.current.join(" ").trim();
    setFinalTranscript(transcript);
    setInterimTranscript("");
    const syllableCount = countSpokenSyllables(transcript);
    const analyzer = analyzerRef.current;
    if (!analyzer) {
      cleanupMedia();
      setState("error");
      setMessage("음성 분석기를 찾지 못했습니다. 다시 연습해 주세요.");
      return;
    }
    let voice: SlidePracticeReport["voice"];
    try {
      voice = await analyzer.stop(syllableCount);
    } catch {
      cleanupMedia();
      setState("error");
      setMessage("목소리 분석을 완료하지 못했습니다. 다시 연습해 주세요.");
      return;
    } finally {
      analyzerRef.current = null;
      stopTracks();
    }
    const fillers = analyzeKoreanFillers(transcript);
    const qualityReasons: SlidePracticeReport["quality"]["reasons"] = [];
    if (syllableCount < 5 || durationMs < 3_000) qualityReasons.push("insufficient-speech");
    if (sttEngineRef.current === "none") qualityReasons.push("stt-unavailable");
    if (voice.pitchMedianHz === null) qualityReasons.push("pitch-unavailable");
    const qualityState = qualityReasons.includes("insufficient-speech")
      ? "unmeasured"
      : qualityReasons.length > 0 ? "partial" : "measured";
    const snapshot = sessionSnapshotRef.current;
    const nextReport: SlidePracticeReport = {
      reportVersion: 1,
      metricDefinitionVersion: 1,
      classifierVersion: 1,
      practiceSessionId: snapshot.practiceSessionId,
      projectId: input.projectId,
      deckId: snapshot.deckId,
      deckVersion: snapshot.deckVersion,
      slideId: snapshot.slideId,
      slideOrder: snapshot.slideOrder,
      startedAt: snapshot.startedAt,
      durationMs,
      syllableCount,
      meanRecognitionConfidence: confidencesRef.current.length > 0
        ? confidencesRef.current.reduce((total, confidence) => total + confidence, 0) / confidencesRef.current.length
        : null,
      fillers: { policyVersion: 1, totalCount: fillers.totalCount, details: fillers.details },
      voice,
      style: classifyVoiceStyle(voice, baselineRef.current?.metrics ?? null),
      quality: { state: qualityState, reasons: Array.from(new Set(qualityReasons)) },
      source: {
        kind: "browser",
        sttEngine: sttEngineRef.current,
        deviceIdHash: deviceIdHashRef.current,
        baselineVersion: baselineRef.current?.baselineVersion ?? null,
      },
    };
    setReport(nextReport);
    const request = { clientRequestId: crypto.randomUUID(), report: nextReport };
    try {
      await persistSlidePracticeReport(request);
      setMessage("연습 결과를 안전하게 저장했습니다. 전사 원문과 음성은 저장하지 않았습니다.");
    } catch {
      try {
        await enqueueOfflinePracticeReport(request);
        setMessage("오프라인 보관함에 저장했습니다. 연결되면 자동으로 동기화합니다.");
      } catch {
        setMessage("분석은 완료했지만 서버와 오프라인 보관함에 저장하지 못했습니다.");
      }
    }
    void updateBaseline(voice);
    setState("completed");
  }

  function attachStt(port: LiveSttPort) {
    port.onResult((result) => {
      if (result.isFinal) {
        transcriptPartsRef.current.push(result.text);
        setFinalTranscript(transcriptPartsRef.current.join(" "));
        setInterimTranscript("");
        if (typeof result.confidence === "number") confidencesRef.current.push(result.confidence);
      } else {
        setInterimTranscript(result.text);
      }
    });
    port.onError((error) => setMessage(`${error.message} 목소리 분석은 계속합니다.`));
  }

  async function updateBaseline(voice: SlidePracticeReport["voice"]) {
    const deviceIdHash = deviceIdHashRef.current;
    if (!deviceIdHash || voice.activeSpeechMs < 5_000) return;
    const previous = baselineRef.current;
    const sampleCount = Math.min(10_000, (previous?.sampleCount ?? 0) + 1);
    const metrics = mergeBaseline(previous?.metrics ?? null, voice, sampleCount);
    await upsertVoiceBaseline({ deviceIdHash, sampleCount, metrics }).catch(() => undefined);
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function cleanupMedia() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void sttRef.current?.dispose();
    sttRef.current = null;
    void analyzerRef.current?.cancel();
    analyzerRef.current = null;
    stopTracks();
  }

  useEffect(() => cleanupMedia, []);

  useEffect(() => {
    if (state === "recording" && elapsedMs >= 300_000) void stop();
  }, [elapsedMs, state]);

  return {
    state,
    elapsedMs,
    interimTranscript,
    finalTranscript,
    report,
    message,
    start,
    stop,
  };
}

function mergeBaseline(
  previous: VoiceBaselineMetrics | null,
  current: SlidePracticeReport["voice"],
  sampleCount: number,
): VoiceBaselineMetrics {
  const previousWeight = Math.max(0, sampleCount - 1);
  const merge = (oldValue: number | null | undefined, newValue: number | null) => {
    if (newValue === null) return oldValue ?? null;
    if (oldValue === null || oldValue === undefined || previousWeight === 0) return newValue;
    return (oldValue * previousWeight + newValue) / sampleCount;
  };
  return {
    pitchMedianHz: merge(previous?.pitchMedianHz, current.pitchMedianHz),
    pitchSpanHz: merge(previous?.pitchSpanHz, current.pitchSpanHz),
    loudnessDb: merge(previous?.loudnessDb, current.loudnessDb),
    loudnessMadDb: merge(previous?.loudnessMadDb, current.loudnessMadDb),
    syllablesPerSecond: merge(previous?.syllablesPerSecond, current.syllablesPerSecond),
    rhythmRegularity: merge(previous?.rhythmRegularity, current.rhythmRegularity),
  };
}
