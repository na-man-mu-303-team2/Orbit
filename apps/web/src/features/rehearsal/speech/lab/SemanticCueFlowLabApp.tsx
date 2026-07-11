import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  demoIds,
  semanticCueSchema,
  type GetDeckResponse,
  type Job,
  type Project,
  type RehearsalRunMeta,
  type RehearsalSemanticCueDecision,
  type SemanticCapabilityEvent,
  type SemanticCue
} from "@orbit/shared";

import { buildP3SessionSlides } from "../../RehearsalWorkspace";
import { SemanticCueDebugPanel } from "../../panel/SemanticCueDebugPanel";
import { createLiveSttPort } from "../../stt/liveSttEngineRegistry";
import type {
  LiveSttEngineId,
  LiveSttPort,
  LiveSttResult
} from "../../stt/liveSttPort";
import { getE5EmbeddingService } from "../e5EmbeddingService";
import { createBrowserTransformersSemanticCueNliProvider } from "../browserSemanticCueNliProvider";
import {
  createP3RehearsalSession,
  type P3RehearsalSession,
  type P3RehearsalSessionSlide
} from "../p3RehearsalSession";
import type { SemanticCueDebugEvent } from "../semanticCueDebugEvents";
import {
  createSemanticCueEmbeddingIndex,
  type SemanticCueEmbeddingIndex
} from "../semanticCueEmbeddingIndex";
import type { SemanticCueNliProvider } from "../semanticCueNliProvider";
import {
  createSemanticCueRuntime,
  type SemanticCueRuntime
} from "../semanticCueRuntime";
import {
  semanticCueRuntimeConfig,
  type SemanticCueRuntimeConfig
} from "../semanticCueRuntimeConfig";
import {
  defaultSemanticCueCombinerConfig,
  type SemanticCueCombinerConfig
} from "../semanticCueScoreCombiner";
import type { SpeechTrackerSnapshot, SpeechTrackingEvent } from "../speechTrackingEvents";
import { LabConfigPanel } from "./LabConfigPanel";
import {
  LAB_NLI_MODEL_ID,
  createManualEmbeddingIndex,
  createManualNliProvider,
  defaultManualCueScores,
  describeError,
  loadLabJson,
  loadLabString,
  saveLabString,
  type ManualCueScores
} from "./labShared";
import { ScoreInput } from "./SemanticCueLabApp";

type InputMode = "script" | "mic";
type EmbeddingMode = "manual" | "real";
type NliMode = "off" | "manual" | "real";
type SessionStatus = "idle" | "running" | "paused" | "stopped" | "failed";

type EventLogEntry = {
  id: number;
  at: string;
  slideId: string;
  type: string;
  detail: string;
};

type CueStatusMap = Record<
  string,
  Pick<
    RehearsalSemanticCueDecision,
    "label" | "finalScore" | "measurementMode" | "fallbackUsed" | "reasonCodes"
  > & { at: string }
>;

const sttEngineOptions: { id: LiveSttEngineId; label: string }[] = [
  { id: "web-speech", label: "Web Speech (다운로드 없음)" },
  { id: "sherpa", label: "Sherpa (온디바이스)" },
  { id: "moonshine", label: "Moonshine (온디바이스)" },
  { id: "openai-realtime", label: "OpenAI Realtime (API 필요)" }
];

export function SemanticCueFlowLabApp() {
  const [slidesJson, setSlidesJson] = useState(() =>
    loadLabString("flowSlides", "[]")
  );
  const [scriptText, setScriptText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("script");
  const [sttEngine, setSttEngine] = useState<LiveSttEngineId>("web-speech");
  const [scriptIntervalMs, setScriptIntervalMs] = useState(800);

  const [runtimeConfig, setRuntimeConfig] = useState<SemanticCueRuntimeConfig>(
    () => loadLabJson("runtimeConfig", semanticCueRuntimeConfig)
  );
  const [combinerConfig, setCombinerConfig] =
    useState<SemanticCueCombinerConfig>(() =>
      loadLabJson("combinerConfig", defaultSemanticCueCombinerConfig)
    );
  const [embeddingMode, setEmbeddingMode] = useState<EmbeddingMode>("manual");
  const [nliMode, setNliMode] = useState<NliMode>("manual");
  const [manualScores, setManualScores] = useState<
    Record<string, ManualCueScores>
  >({});
  const [modelStatus, setModelStatus] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [approveSuggestedCues, setApproveSuggestedCues] = useState(true);
  const [loadedDeckInfo, setLoadedDeckInfo] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState("");
  const [editingCueId, setEditingCueId] = useState<string | null>(null);

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [slideIndex, setSlideIndex] = useState(0);
  const [snapshot, setSnapshot] = useState<SpeechTrackerSnapshot | null>(null);
  const [interimText, setInterimText] = useState("");
  const [finalSegments, setFinalSegments] = useState<LiveSttResult[]>([]);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [debugEvents, setDebugEvents] = useState<SemanticCueDebugEvent[]>([]);
  const [capabilityEvents, setCapabilityEvents] = useState<
    SemanticCapabilityEvent[]
  >([]);
  const [cueStatus, setCueStatus] = useState<CueStatusMap>({});
  const [runMeta, setRunMeta] = useState<RehearsalRunMeta | null>(null);
  const [flowError, setFlowError] = useState("");
  const [playingScript, setPlayingScript] = useState(false);
  const [playedLineCount, setPlayedLineCount] = useState(0);

  const sessionRef = useRef<P3RehearsalSession | null>(null);
  const portRef = useRef<LiveSttPort | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unsubscribeInterimRef = useRef<(() => void) | null>(null);
  const scriptCancelRef = useRef(false);
  const scriptClockMsRef = useRef(0);
  const eventIdRef = useRef(0);
  const manualScoresRef = useRef(manualScores);
  manualScoresRef.current = manualScores;
  const realEmbeddingIndexRef = useRef<SemanticCueEmbeddingIndex | null>(null);
  const realNliProviderRef = useRef<SemanticCueNliProvider | null>(null);

  useEffect(() => saveLabString("flowSlides", slidesJson), [slidesJson]);
  useEffect(
    () => saveLabString("runtimeConfig", JSON.stringify(runtimeConfig)),
    [runtimeConfig]
  );
  useEffect(
    () => saveLabString("combinerConfig", JSON.stringify(combinerConfig)),
    [combinerConfig]
  );

  const slidesParse = useMemo(() => parseSlides(slidesJson), [slidesJson]);
  const slides = slidesParse.ok ? slidesParse.slides : [];
  const currentSlide = slides[slideIndex];
  const running = status === "running";
  const sessionActive = status === "running" || status === "paused";

  const buildRuntime = useCallback(async (): Promise<SemanticCueRuntime> => {
    let embeddingIndex: SemanticCueEmbeddingIndex | undefined;
    if (embeddingMode === "real") {
      if (!realEmbeddingIndexRef.current) {
        setModelStatus("E5 임베딩 모델 로딩 중…");
        const service = await getE5EmbeddingService();
        realEmbeddingIndexRef.current = createSemanticCueEmbeddingIndex({
          embeddingService: service
        });
      }
      embeddingIndex = realEmbeddingIndexRef.current;
    } else {
      embeddingIndex = createManualEmbeddingIndex(() => manualScoresRef.current);
    }

    let provider: SemanticCueNliProvider | undefined;
    if (nliMode === "real") {
      if (!realNliProviderRef.current) {
        setModelStatus("NLI 모델 로딩 중… (최초 1회, 수백 MB)");
        const realProvider = createBrowserTransformersSemanticCueNliProvider({
          modelId: LAB_NLI_MODEL_ID,
          loadOnEvaluate: true
        });
        const info = await realProvider.load();
        if (info.status !== "ready") {
          throw new Error(`NLI 로드 실패: ${info.error ?? info.status}`);
        }
        realNliProviderRef.current = realProvider;
      }
      provider = realNliProviderRef.current;
    } else if (nliMode === "manual") {
      provider = createManualNliProvider(() => manualScoresRef.current);
    }
    setModelStatus("");

    const runtime = createSemanticCueRuntime({
      enabled: nliMode !== "off",
      deckId: "deck_flow_lab",
      nliMode: "active",
      config: runtimeConfig,
      combinerConfig,
      ...(provider === undefined ? {} : { provider }),
      embeddingIndex
    });

    return {
      prepareSlide: runtime.prepareSlide,
      evaluateFinalResult: async (input) => {
        const result = await runtime.evaluateFinalResult(input);
        if (result.decisions.length > 0) {
          setCueStatus((current) => {
            const next = { ...current };
            for (const decision of result.decisions) {
              next[decision.cueId] = {
                label: decision.label,
                finalScore: decision.finalScore,
                measurementMode: decision.measurementMode,
                fallbackUsed: decision.fallbackUsed,
                reasonCodes: decision.reasonCodes,
                at: decision.at ?? new Date().toISOString()
              };
            }
            return next;
          });
        }
        return result;
      }
    };
  }, [embeddingMode, nliMode, runtimeConfig, combinerConfig]);

  const loadProjects = useCallback(async () => {
    setProjectLoading(true);
    setProjectError("");
    try {
      const response = await fetch(
        `/api/v1/workspaces/${demoIds.workspaceId}/projects`,
        { credentials: "include" }
      );
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "로그인이 필요합니다. 같은 브라우저에서 메인 앱(/login)에 먼저 로그인하세요."
        );
      }
      if (!response.ok) {
        throw new Error(`프로젝트 목록 로드 실패 (HTTP ${response.status})`);
      }
      const list = (await response.json()) as Project[];
      setProjects(list);
      if (list.length > 0 && !list.some((p) => p.projectId === selectedProjectId)) {
        setSelectedProjectId(list[0]?.projectId ?? "");
      }
      if (list.length === 0) {
        setProjectError("워크스페이스에 프로젝트가 없습니다.");
      }
    } catch (error) {
      setProjectError(describeError(error));
    } finally {
      setProjectLoading(false);
    }
  }, [selectedProjectId]);

  const loadDeckFromProject = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    setProjectLoading(true);
    setProjectError("");
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/deck`,
        { credentials: "include" }
      );
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "이 프로젝트에 접근 권한이 없거나 로그인이 만료되었습니다."
        );
      }
      if (response.status === 404) {
        throw new Error("이 프로젝트에는 아직 덱이 없습니다.");
      }
      if (!response.ok) {
        throw new Error(`덱 로드 실패 (HTTP ${response.status})`);
      }
      const payload = (await response.json()) as GetDeckResponse;
      const deck = payload.deck;
      const sessionSlides = buildP3SessionSlides(deck);
      const titleBySlideId = new Map(
        deck.slides.map((slide) => [slide.slideId, slide.title])
      );

      let totalCues = 0;
      let usableCues = 0;
      let derivedKeywordSlides = 0;
      const flowSlides = sessionSlides.map((slide) => {
        const cues = (slide.semanticCues ?? []).map((cue) => {
          totalCues += 1;
          const promoted =
            approveSuggestedCues && cue.reviewStatus === "suggested"
              ? { ...cue, reviewStatus: "approved" as const, freshness: "current" as const }
              : cue;
          if (promoted.reviewStatus === "approved" && promoted.freshness === "current") {
            usableCues += 1;
          }
          return promoted;
        });
        let keywords = slide.keywords ?? [];
        if (keywords.length === 0 && cues.length > 0) {
          keywords = deriveTrackerKeywordsFromCues(cues, slide.slideId);
          if (keywords.length > 0) {
            derivedKeywordSlides += 1;
          }
        }
        return {
          ...slide,
          title: titleBySlideId.get(slide.slideId) ?? "",
          keywords,
          semanticCues: cues
        };
      });

      setSlidesJson(JSON.stringify(flowSlides, null, 2));
      const notesScript = sessionSlides
        .map((slide) => slide.speakerNotes.trim())
        .filter((notes) => notes.length > 0)
        .join("\n");
      if (notesScript) {
        setScriptText(notesScript);
      }
      setManualScores({});
      const projectTitle =
        projects.find((p) => p.projectId === selectedProjectId)?.title ??
        selectedProjectId;
      setLoadedDeckInfo(
        `"${projectTitle}" 덱 로드 완료 — 슬라이드 ${flowSlides.length}개, 큐 ${totalCues}개 중 판별 대상 ${usableCues}개` +
          (totalCues === 0
            ? " ⚠ 큐 없음: 아래 '필수 발화 포인트 추출 요청'으로 추출하세요"
            : usableCues === 0
              ? " ⚠ 판별 대상 0개: approved+current 큐가 없습니다"
              : "") +
          (derivedKeywordSlides > 0
            ? ` · 키워드 없는 슬라이드 ${derivedKeywordSlides}개는 큐에서 자동 파생`
            : "")
      );
      setEditingCueId(null);
    } catch (error) {
      setProjectError(describeError(error));
      setLoadedDeckInfo("");
    } finally {
      setProjectLoading(false);
    }
  }, [selectedProjectId, approveSuggestedCues, projects]);

  const requestCueExtraction = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    setExtracting(true);
    setProjectError("");
    setExtractionStatus("필수 발화 포인트 추출 작업 요청 중…");
    try {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(selectedProjectId)}/deck/semantic-cues`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ force: true })
        }
      );
      if (response.status === 401 || response.status === 403) {
        throw new Error("이 프로젝트에 쓰기 권한이 없거나 로그인이 만료되었습니다.");
      }
      if (!response.ok) {
        throw new Error(
          `추출 요청 실패 (HTTP ${response.status}): ${await response.text()}`
        );
      }
      let { job } = (await response.json()) as { job: Job };
      const timeoutAt = Date.now() + 180_000;
      while (job.status === "queued" || job.status === "running") {
        if (Date.now() > timeoutAt) {
          throw new Error(
            "추출 작업 타임아웃 — 워커(@orbit/worker)가 실행 중인지 확인하세요."
          );
        }
        setExtractionStatus(
          `추출 중… ${job.status} ${job.progress}%${job.message ? ` · ${job.message}` : ""}`
        );
        await sleep(1_500);
        const jobResponse = await fetch(
          `/api/jobs/${encodeURIComponent(job.jobId)}`,
          { credentials: "include" }
        );
        if (!jobResponse.ok) {
          throw new Error("추출 작업 상태 조회에 실패했습니다.");
        }
        job = (await jobResponse.json()) as Job;
      }
      if (job.status === "failed") {
        throw new Error(`추출 실패: ${job.error?.message ?? "unknown"}`);
      }
      setExtractionStatus("추출 완료 — 덱을 다시 불러옵니다…");
      await loadDeckFromProject();
      setExtractionStatus("추출 완료 · 덱 갱신됨");
    } catch (error) {
      setExtractionStatus("");
      setProjectError(describeError(error));
    } finally {
      setExtracting(false);
    }
  }, [selectedProjectId, loadDeckFromProject]);

  const pushEvents = useCallback((events: SpeechTrackingEvent[]) => {
    if (events.length === 0) {
      return;
    }
    setEventLog((current) => {
      const additions = events.map((event) => ({
        id: ++eventIdRef.current,
        at: new Date().toLocaleTimeString("ko-KR"),
        slideId: "slideId" in event ? event.slideId : "",
        type: event.type,
        detail: summarizeTrackingEvent(event)
      }));
      return [...additions.reverse(), ...current].slice(0, 120);
    });
  }, []);

  const startSession = useCallback(async () => {
    if (!slidesParse.ok) {
      return;
    }
    setFlowError("");
    setRunMeta(null);
    setEventLog([]);
    setDebugEvents([]);
    setCapabilityEvents([]);
    setCueStatus({});
    setFinalSegments([]);
    setPlayedLineCount(0);
    scriptClockMsRef.current = 0;

    const startSlideIndex = Math.min(
      Math.max(slideIndex, 0),
      slidesParse.slides.length - 1
    );
    try {
      const runtime = await buildRuntime();
      const port =
        inputMode === "mic" ? createLiveSttPort(sttEngine) : createNullSttPort();
      portRef.current = port;

      const session = createP3RehearsalSession({
        slides: slidesParse.slides,
        port,
        semanticCueRuntime: runtime,
        isSemanticMatchingEnabled: () => true,
        onEvents: pushEvents,
        onSnapshot: setSnapshot,
        onSemanticCueDebugEvent: (event) =>
          setDebugEvents((current) => [...current, event].slice(-80)),
        onSemanticCapabilityEvent: (event) =>
          setCapabilityEvents((current) => [...current, event].slice(-80))
      });
      sessionRef.current = session;

      if (inputMode === "mic") {
        unsubscribeInterimRef.current = port.onResult((result) => {
          if (result.isFinal) {
            setInterimText("");
            setFinalSegments((current) => [...current, result].slice(-40));
          } else {
            setInterimText(result.text);
          }
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        streamRef.current = stream;
        await session.start({ audioSource: stream, slideIndex: startSlideIndex });
      } else {
        await session.start({
          audioSource: new MediaStream(),
          slideIndex: startSlideIndex
        });
      }
      setSlideIndex(startSlideIndex);
      setStatus("running");
    } catch (error) {
      setFlowError(`세션 시작 실패: ${describeError(error)}`);
      setStatus("failed");
      await teardownPort();
    }
  }, [slidesParse, inputMode, sttEngine, buildRuntime, pushEvents, slideIndex]);

  const stopSession = useCallback(async () => {
    scriptCancelRef.current = true;
    setPlayingScript(false);
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    try {
      const meta = await session.stop();
      setRunMeta(meta);
    } catch (error) {
      setFlowError(`세션 종료 실패: ${describeError(error)}`);
    }
    await teardownPort();
    setStatus("stopped");
    setInterimText("");
  }, []);

  async function teardownPort() {
    unsubscribeInterimRef.current?.();
    unsubscribeInterimRef.current = null;
    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try {
        await port.dispose();
      } catch {
        // ignore
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }

  const goToSlide = useCallback(
    (nextIndex: number) => {
      const session = sessionRef.current;
      if (!session || nextIndex < 0 || nextIndex >= slides.length) {
        return;
      }
      session.enterSlide(nextIndex);
      setSlideIndex(nextIndex);
    },
    [slides.length]
  );

  const playScript = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || status !== "running") {
      return;
    }
    const lines = scriptText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    scriptCancelRef.current = false;
    setPlayingScript(true);
    setPlayedLineCount(0);
    for (const [index, line] of lines.entries()) {
      if (scriptCancelRef.current) {
        break;
      }
      const startMs = scriptClockMsRef.current;
      const endMs = startMs + Math.max(line.length * 90, 800);
      scriptClockMsRef.current = endMs + 200;
      const result: LiveSttResult = {
        text: line,
        isFinal: true,
        timestampMs: [startMs, endMs]
      };
      session.acceptResult(result);
      setFinalSegments((current) => [...current, result].slice(-40));
      setPlayedLineCount(index + 1);
      if (index < lines.length - 1) {
        await sleep(scriptIntervalMs);
      }
    }
    setPlayingScript(false);
  }, [scriptText, scriptIntervalMs, status]);

  const sendSingleLine = useCallback(
    (line: string) => {
      const session = sessionRef.current;
      const trimmed = line.trim();
      if (!session || status !== "running" || !trimmed) {
        return;
      }
      const startMs = scriptClockMsRef.current;
      const endMs = startMs + Math.max(trimmed.length * 90, 800);
      scriptClockMsRef.current = endMs + 200;
      const result: LiveSttResult = {
        text: trimmed,
        isFinal: true,
        timestampMs: [startMs, endMs]
      };
      session.acceptResult(result);
      setFinalSegments((current) => [...current, result].slice(-40));
    },
    [status]
  );

  useEffect(
    () => () => {
      scriptCancelRef.current = true;
      void teardownPort();
    },
    []
  );

  const [adHocLine, setAdHocLine] = useState("");
  const allCues = slides.flatMap((slide) => slide.semanticCues ?? []);

  const writeSlides = useCallback((nextSlides: FlowLabSlide[]) => {
    setSlidesJson(JSON.stringify(nextSlides, null, 2));
  }, []);

  const saveCue = useCallback(
    (cueId: string, nextCue: SemanticCue) => {
      writeSlides(
        slides.map((slide) => ({
          ...slide,
          semanticCues: (slide.semanticCues ?? []).map((cue) =>
            cue.cueId === cueId ? nextCue : cue
          )
        }))
      );
      setEditingCueId(null);
    },
    [slides, writeSlides]
  );

  const deleteCue = useCallback(
    (cueId: string) => {
      writeSlides(
        slides.map((slide) => ({
          ...slide,
          semanticCues: (slide.semanticCues ?? []).filter(
            (cue) => cue.cueId !== cueId
          )
        }))
      );
      setEditingCueId(null);
    },
    [slides, writeSlides]
  );

  const addCue = useCallback(() => {
    if (!currentSlide) {
      return;
    }
    const newCueId = `scue_manual_${Date.now()}`;
    const newCue: SemanticCue = semanticCueSchema.parse({
      cueId: newCueId,
      slideId: currentSlide.slideId,
      meaning: "여기에 필수 발화 포인트의 의미를 적으세요",
      reportLabel: "새 발화 포인트",
      reviewStatus: "approved",
      freshness: "current",
      origin: "manual",
      required: true,
      priority: 2,
      nliHypotheses: ["발표자는 ...라고 설명했다"]
    });
    writeSlides(
      slides.map((slide) =>
        slide.slideId === currentSlide.slideId
          ? { ...slide, semanticCues: [...(slide.semanticCues ?? []), newCue] }
          : slide
      )
    );
    setEditingCueId(newCueId);
  }, [currentSlide, slides, writeSlides]);

  return (
    <div className="lab-root">
      <header className="lab-header">
        <h1>Semantic Cue Flow Lab</h1>
        <p>
          실제 리허설 파이프라인(p3RehearsalSession: STT → 트래커 → 증거 윈도 →
          큐 판별)을 유저 플로우 그대로 실행하는 실험 페이지 — 단위 실험은{" "}
          <a href="/semantic-cue-lab.html">Semantic Cue Lab</a> 사용. (개발 전용,
          파라미터 튜닝은 두 페이지가 공유됩니다)
        </p>
      </header>

      <div className="lab-columns">
        <section className="lab-panel">
          <h2>1. 슬라이드 덱 정의</h2>
          <h3>프로젝트에서 불러오기 (실제 PPT 덱)</h3>
          <div className="lab-row">
            <button
              type="button"
              disabled={projectLoading || sessionActive}
              onClick={() => void loadProjects()}
            >
              프로젝트 목록 불러오기
            </button>
            {projects.length > 0 && (
              <>
                <select
                  value={selectedProjectId}
                  disabled={projectLoading || sessionActive}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.projectId} value={project.projectId}>
                      {project.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="lab-primary"
                  disabled={projectLoading || sessionActive || !selectedProjectId}
                  onClick={() => void loadDeckFromProject()}
                >
                  {projectLoading ? "불러오는 중…" : "덱 불러오기"}
                </button>
              </>
            )}
          </div>
          {projects.length > 0 && (
            <label className="lab-check">
              <input
                type="checkbox"
                checked={approveSuggestedCues}
                disabled={sessionActive}
                onChange={(event) => setApproveSuggestedCues(event.target.checked)}
              />
              suggested 큐를 실험용으로 approved·current 처리 (프로덕션은 승인된
              큐만 판별)
            </label>
          )}
          {projectError && <p className="lab-error">{projectError}</p>}
          {loadedDeckInfo && <p className="lab-hint">{loadedDeckInfo}</p>}

          <h3>슬라이드 JSON (직접 편집 가능)</h3>
          <textarea
            className="lab-json"
            value={slidesJson}
            spellCheck={false}
            rows={14}
            disabled={sessionActive}
            onChange={(event) => setSlidesJson(event.target.value)}
          />
          {!slidesParse.ok && <p className="lab-error">{slidesParse.error}</p>}
          {slidesParse.ok && (
            <p className="lab-hint">
              슬라이드 {slides.length}개 · 큐 {allCues.length}개 파싱 완료
            </p>
          )}

          <h2>2. 입력 / 모델</h2>
          <div className="lab-field-grid">
            <label className="lab-field">
              발화 입력 방식
              <select
                value={inputMode}
                disabled={sessionActive}
                onChange={(event) => setInputMode(event.target.value as InputMode)}
              >
                <option value="script">스크립트 시뮬레이션 (마이크 불필요)</option>
                <option value="mic">실시간 마이크 STT</option>
              </select>
            </label>
            {inputMode === "mic" && (
              <label className="lab-field">
                STT 엔진
                <select
                  value={sttEngine}
                  disabled={sessionActive}
                  onChange={(event) =>
                    setSttEngine(event.target.value as LiveSttEngineId)
                  }
                >
                  {sttEngineOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="lab-field">
              임베딩
              <select
                value={embeddingMode}
                disabled={sessionActive}
                onChange={(event) =>
                  setEmbeddingMode(event.target.value as EmbeddingMode)
                }
              >
                <option value="manual">수동 점수</option>
                <option value="real">실제 E5</option>
              </select>
            </label>
            <label className="lab-field">
              NLI
              <select
                value={nliMode}
                disabled={sessionActive}
                onChange={(event) => setNliMode(event.target.value as NliMode)}
              >
                <option value="manual">수동 점수</option>
                <option value="real">실제 브라우저 NLI</option>
                <option value="off">끔</option>
              </select>
            </label>
          </div>
          {modelStatus && <p className="lab-hint">{modelStatus}</p>}

          {(embeddingMode === "manual" || nliMode === "manual") &&
            allCues.length > 0 && (
              <>
                <h3>수동 점수 (큐별)</h3>
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>큐</th>
                      {embeddingMode === "manual" && <th>retrieval</th>}
                      {nliMode === "manual" && (
                        <>
                          <th>entailment</th>
                          <th>contradiction</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {allCues.map((cue) => {
                      const scores =
                        manualScores[cue.cueId] ?? defaultManualCueScores;
                      const update = (patch: Partial<ManualCueScores>) => {
                        setManualScores((current) => ({
                          ...current,
                          [cue.cueId]: { ...scores, ...patch }
                        }));
                      };
                      return (
                        <tr key={cue.cueId}>
                          <td title={cue.meaning}>
                            {cue.reportLabel ?? cue.cueId}
                          </td>
                          {embeddingMode === "manual" && (
                            <td>
                              <ScoreInput
                                value={scores.retrieval}
                                onChange={(value) => update({ retrieval: value })}
                              />
                            </td>
                          )}
                          {nliMode === "manual" && (
                            <>
                              <td>
                                <ScoreInput
                                  value={scores.entailment}
                                  onChange={(value) =>
                                    update({ entailment: value })
                                  }
                                />
                              </td>
                              <td>
                                <ScoreInput
                                  value={scores.contradiction}
                                  onChange={(value) =>
                                    update({ contradiction: value })
                                  }
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

          <LabConfigPanel
            runtimeConfig={runtimeConfig}
            combinerConfig={combinerConfig}
            onRuntimeConfigChange={setRuntimeConfig}
            onCombinerConfigChange={setCombinerConfig}
            defaultOpen={false}
          />
          {sessionActive && (
            <p className="lab-hint">
              파라미터/모델 변경은 다음 세션 시작 시 적용됩니다.
            </p>
          )}
        </section>

        <section className="lab-panel">
          <h2>3. 리허설 세션</h2>
          <div className="lab-row">
            {!sessionActive ? (
              <button
                type="button"
                className="lab-primary"
                disabled={!slidesParse.ok}
                onClick={() => void startSession()}
              >
                ▶ 리허설 시작
              </button>
            ) : (
              <button
                type="button"
                className="lab-rec"
                onClick={() => void stopSession()}
              >
                ■ 리허설 종료
              </button>
            )}
            <span className={`lab-status lab-status-${status}`}>
              상태: {status}
            </span>
          </div>
          {flowError && <p className="lab-error">{flowError}</p>}

          {slides.length > 0 && (
            <>
              <h3>슬라이드 진행 (발표자 플로우)</h3>
              <div className="lab-row lab-wrap">
                {slides.map((slide, index) => (
                  <button
                    key={slide.slideId}
                    type="button"
                    className={
                      index === slideIndex
                        ? "lab-slide-chip current"
                        : "lab-slide-chip"
                    }
                    disabled={index === slideIndex || (sessionActive && !running)}
                    onClick={() =>
                      running ? goToSlide(index) : setSlideIndex(index)
                    }
                  >
                    {index + 1}. {slideTitle(slide, index)}
                  </button>
                ))}
              </div>
            </>
          )}

          {inputMode === "script" && (
            <>
              <h3>발표 대본 (스크립트 시뮬레이션)</h3>
              <textarea
                className="lab-transcript"
                rows={6}
                value={scriptText}
                onChange={(event) => setScriptText(event.target.value)}
                placeholder="리허설 시작 전에도 자유롭게 수정할 수 있습니다. 한 줄 = 최종 STT 세그먼트 하나로 전달됩니다."
              />
              <div className="lab-row">
                {!playingScript ? (
                  <button
                    type="button"
                    className="lab-primary"
                    disabled={!running}
                    title={running ? "" : "리허설 시작 후 재생할 수 있습니다"}
                    onClick={() => void playScript()}
                  >
                    스크립트 재생
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      scriptCancelRef.current = true;
                    }}
                  >
                    재생 중지 ({playedLineCount}줄 전송됨)
                  </button>
                )}
                <label className="lab-field">
                  줄 간격(ms)
                  <input
                    type="number"
                    step={100}
                    min={0}
                    value={scriptIntervalMs}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 0) {
                        setScriptIntervalMs(value);
                      }
                    }}
                  />
                </label>
              </div>
              {running && (
                <div className="lab-row">
                  <input
                    type="text"
                    className="lab-adhoc"
                    placeholder="한 줄 즉시 전송 (Enter)"
                    value={adHocLine}
                    onChange={(event) => setAdHocLine(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        sendSingleLine(adHocLine);
                        setAdHocLine("");
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}
          {running && inputMode === "mic" && interimText && (
            <p className="lab-interim">인식 중: {interimText}</p>
          )}

          {currentSlide && (
            <>
              <h3>
                핵심 발화 맥락 체크리스트 — {slideTitle(currentSlide, slideIndex)}{" "}
                {sessionActive ? "(실시간)" : "(시작 전 미리보기)"}
              </h3>
              {(currentSlide.semanticCues ?? []).length === 0 ? (
                <p className="lab-hint">이 슬라이드에는 정의된 큐가 없습니다.</p>
              ) : (
                <ul className="lab-cue-checklist">
                  {(currentSlide.semanticCues ?? []).map((cue) => {
                    const decision = cueStatus[cue.cueId];
                    const label = decision?.label;
                    const state =
                      label === "covered"
                        ? "done"
                        : label === "partial"
                          ? "partial"
                          : label === "contradicted"
                            ? "contradicted"
                            : "pending";
                    const mark =
                      state === "done"
                        ? "✓"
                        : state === "partial"
                          ? "◐"
                          : state === "contradicted"
                            ? "✕"
                            : "○";
                    const usable =
                      cue.reviewStatus === "approved" &&
                      cue.freshness === "current";
                    return (
                      <li
                        key={cue.cueId}
                        className={`lab-cue-item ${state}${usable ? "" : " unusable"}`}
                        title={
                          decision
                            ? `${decision.reasonCodes.join(", ")} · ${decision.measurementMode}${decision.fallbackUsed ? " · fallback" : ""}`
                            : usable
                              ? "아직 판정 없음"
                              : "approved+current가 아니라 판별 대상에서 제외됩니다"
                        }
                      >
                        <span className="lab-cue-mark">{mark}</span>
                        <span className="lab-cue-text">
                          <strong>{cue.reportLabel ?? cue.cueId}</strong>
                          {" — "}
                          {cue.meaning}
                        </span>
                        {decision && (
                          <small>
                            {decision.label} · {decision.finalScore}
                            {decision.fallbackUsed ? " · fallback" : ""}
                          </small>
                        )}
                        {!usable && <small>제외됨</small>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {sessionActive && snapshot && (
                <p className="lab-hint">
                  키워드 적중 {snapshot.hitKeywordIds.length}개 · 문장 커버리지{" "}
                  {Math.round(snapshot.sentenceCoverage * 100)}% · 유효 커버리지{" "}
                  {Math.round(snapshot.effectiveCoverage * 100)}%
                </p>
              )}
            </>
          )}

          {finalSegments.length > 0 && (
            <details>
              <summary>최종 STT 세그먼트 ({finalSegments.length})</summary>
              <ol className="lab-segments">
                {finalSegments.map((segment, index) => (
                  <li key={index}>
                    [{Math.round(segment.timestampMs[0] / 1000)}s] {segment.text}
                  </li>
                ))}
              </ol>
            </details>
          )}

          {eventLog.length > 0 && (
            <details open>
              <summary>트래킹 이벤트 ({eventLog.length})</summary>
              <ul className="lab-event-log">
                {eventLog.map((entry) => (
                  <li key={entry.id}>
                    <code>{entry.type}</code> {entry.detail}{" "}
                    <small>
                      {entry.slideId} · {entry.at}
                    </small>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <h2>4. 디버그 타임라인 (리허설 디버그 패널)</h2>
          <SemanticCueDebugPanel
            capabilityEvents={capabilityEvents}
            events={debugEvents}
            onCopyJson={(json) => void navigator.clipboard?.writeText(json)}
            onExportJson={(json) => downloadJson(json, "semantic-cue-flow-lab")}
          />

          {debugEvents.length > 0 && (
            <details>
              <summary>큐 판별 디버그 이벤트 원본 ({debugEvents.length})</summary>
              <pre className="lab-pre">
                {JSON.stringify(debugEvents.slice(-5), null, 2)}
              </pre>
            </details>
          )}

          {runMeta && (
            <>
              <h3>세션 결과 (runMeta)</h3>
              <pre className="lab-pre">{JSON.stringify(runMeta, null, 2)}</pre>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type FlowLabSlide = P3RehearsalSessionSlide & { title?: string };

type SlidesParseResult =
  | { ok: true; slides: FlowLabSlide[] }
  | { ok: false; error: string };

const flowCueArraySchema = semanticCueSchema.array();

function parseSlides(json: string): SlidesParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return { ok: false, error: `JSON 파싱 실패: ${describeError(error)}` };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "슬라이드 JSON은 배열이어야 합니다" };
  }

  const slides: FlowLabSlide[] = [];
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "object" || value === null) {
      return { ok: false, error: `슬라이드 ${index}: 객체가 아닙니다` };
    }
    const slide = value as Record<string, unknown>;
    if (typeof slide.slideId !== "string" || !slide.slideId.startsWith("slide_")) {
      return {
        ok: false,
        error: `슬라이드 ${index}: slideId는 "slide_"로 시작해야 합니다`
      };
    }
    if (typeof slide.speakerNotes !== "string") {
      return { ok: false, error: `슬라이드 ${index}: speakerNotes 누락` };
    }
    const cueParse = flowCueArraySchema.safeParse(slide.semanticCues ?? []);
    if (!cueParse.success) {
      const issue = cueParse.error.issues[0];
      return {
        ok: false,
        error: `슬라이드 ${index} 큐 스키마 오류: ${issue?.path.join(".") ?? ""} — ${issue?.message ?? "unknown"}`
      };
    }
    const keywordsRaw = Array.isArray(slide.keywords) ? slide.keywords : [];
    const keywords = keywordsRaw.map((keyword, keywordIndex) => {
      const item = keyword as Record<string, unknown>;
      return {
        keywordId:
          typeof item.keywordId === "string"
            ? item.keywordId
            : `kw_flow_${index}_${keywordIndex}`,
        text: typeof item.text === "string" ? item.text : "",
        synonyms: toStringArray(item.synonyms),
        abbreviations: toStringArray(item.abbreviations)
      };
    });
    slides.push({
      slideId: slide.slideId,
      speakerNotes: slide.speakerNotes,
      keywords,
      semanticCues: dedupeCuesForSlide(cueParse.data, slide.slideId),
      ...(typeof slide.title === "string" && slide.title
        ? { title: slide.title }
        : {}),
      ...(isStringArray(slide.controlPhrases)
        ? { controlPhrases: slide.controlPhrases }
        : {}),
      ...(isStringArray(slide.cuePhrases)
        ? { cuePhrases: slide.cuePhrases }
        : {}),
      ...(isStringArray(slide.legacyPhrases)
        ? { legacyPhrases: slide.legacyPhrases.filter(Boolean) }
        : {})
    });
  }
  return { ok: true, slides };
}

function dedupeCuesForSlide(cues: SemanticCue[], slideId: string) {
  return cues.filter((cue) => cue.slideId === slideId);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function slideTitle(slide: FlowLabSlide, index: number) {
  if (slide.title) {
    return slide.title.slice(0, 20);
  }
  const excerpt = slide.speakerNotes.trim().slice(0, 14);
  return excerpt
    ? `${slide.slideId.replace("slide_", "")} · ${excerpt}…`
    : `슬라이드 ${index + 1}`;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function summarizeTrackingEvent(event: SpeechTrackingEvent) {
  switch (event.type) {
    case "keyword-hit":
      return `keyword=${event.keywordId}`;
    case "keyword-missing":
      return `keyword=${event.keywordId}`;
    case "sentence-covered":
      return `sentence=${event.sentenceId} (${event.matchKind})`;
    case "coverage-updated":
      return `coverage=${Math.round(event.effectiveCoverage * 100)}%`;
    case "ad-lib-detected":
      return `"${event.text.slice(0, 30)}"`;
    default:
      return "";
  }
}

function createNullSttPort(): LiveSttPort {
  return {
    engineId: "web-speech",
    capabilities: {
      onDevice: true,
      streaming: false,
      keywordBiasing: false,
      languages: ["ko"]
    },
    async start() {
      // script simulation: results are injected via session.acceptResult
    },
    async stop() {
      // no-op
    },
    updateBiasPhrases() {
      // no-op
    },
    onResult() {
      return () => {};
    },
    onError() {
      return () => {};
    },
    dispose() {
      // no-op
    }
  };
}

function downloadJson(json: string, name: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
