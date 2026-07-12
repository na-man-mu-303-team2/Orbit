import type { Deck, FocusedPracticeAttempt, PracticePlanResponse } from "@orbit/shared";
import {
  IconArrowLeft,
  IconCircleCheck,
  IconMicrophone,
  IconRefresh,
  IconSparkles,
  IconSquare,
} from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { OrbitButton, OrbitStatus } from "../../design-system";
import { fetchProjectDeck } from "../rehearsal/keywords/keywordEditorApi";
import { fetchPracticePlan } from "./practicePlanApi";
import { completeFocusedSession, createFocusedSession, getFocusedSession, submitFocusedAudio } from "./focusedPracticeApi";
import { useFocusedPracticeAudio, type FocusedPracticeCapture } from "./useFocusedPracticeAudio";
import "./focused-practice.css";

const FocusedSlidePreview = lazy(() => import("./FocusedSlidePreview"));

export function FocusedPracticePage(props: {
  goalId: string;
  preview?: { attempts: FocusedPracticeAttempt[]; deck: Deck; plan: Extract<PracticePlanResponse, { status: "ready" }>; stabilized?: boolean };
  projectId: string;
  sourceFullRunId: string;
}) {
  const sessionStorageKey = `orbit.focused.${props.goalId}`;
  const requestStorageKey = `${sessionStorageKey}.request`;
  const [plan, setPlan] = useState<Extract<PracticePlanResponse, { status: "ready" }> | null>(props.preview?.plan ?? null);
  const [deck, setDeck] = useState<Deck | null>(props.preview?.deck ?? null);
  const [sessionId, setSessionId] = useState(() => props.preview ? "preview-session" : sessionStorage.getItem(sessionStorageKey));
  const [attempts, setAttempts] = useState<FocusedPracticeAttempt[]>(props.preview?.attempts ?? []); const [stabilized, setStabilized] = useState(props.preview?.stabilized ?? false);
  const [status, setStatus] = useState(props.preview ? "연습 가능" : "준비 중"); const [error, setError] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(props.preview ? "ready" : "loading");
  const [reloadKey, setReloadKey] = useState(0);
  const audio = useFocusedPracticeAudio();

  useEffect(() => { if (props.preview) return; void (async () => {
    try {
      setLoadState("loading"); setError(""); setStatus("준비 중");
      const nextPlan = await fetchPracticePlan(props.projectId, props.sourceFullRunId);
      if (nextPlan.status !== "ready") throw new Error("연습 계획이 준비되지 않았습니다.");
      setPlan(nextPlan);
      void fetchProjectDeck(props.projectId).then((response) => setDeck(response.deck)).catch(() => undefined);
      let id = sessionId;
      if (!id) {
        let requestId = sessionStorage.getItem(requestStorageKey);
        if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem(requestStorageKey, requestId); }
        const session = await createFocusedSession(props.projectId, nextPlan, props.goalId, requestId);
        id = session.practiceSessionId; sessionStorage.setItem(sessionStorageKey, id); setSessionId(id);
      }
      const current = await getFocusedSession(id); setAttempts(current.attempts); setStabilized(current.stabilization.find((item) => item.goalId === props.goalId)?.stabilized ?? false); setStatus("연습 가능"); setLoadState("ready");
    } catch (cause) { sessionStorage.removeItem(sessionStorageKey); setSessionId(null); setError(cause instanceof Error ? cause.message : "부분 연습을 준비하지 못했습니다."); setLoadState("error"); }
  })(); }, [props.goalId, props.projectId, props.sourceFullRunId, reloadKey]);
  const goal = plan?.goals.find((item) => item.goalId === props.goalId);
  const processing = attempts.some((attempt) => ["uploading", "queued", "processing"].includes(attempt.status));

  async function submitCapture(capture: FocusedPracticeCapture) {
    setStatus("업로드 중");
    const slideId = goal?.targetScope?.type === "slide" ? goal.targetScope.slideId : "slide-unknown";
    await submitFocusedAudio(sessionId!, capture.blob, capture.durationMs, slideId); setStatus("분석 중");
    const poll = window.setInterval(() => { void getFocusedSession(sessionId!).then((value) => {
      setAttempts(value.attempts); const active = value.attempts.at(-1);
      if (active && ["succeeded", "failed", "cancelled"].includes(active.status)) { window.clearInterval(poll); setStatus("다시 연습 가능"); setStabilized(value.stabilization.find((item) => item.goalId === props.goalId)?.stabilized ?? false); }
    }).catch((cause: unknown) => { window.clearInterval(poll); setError(cause instanceof Error ? cause.message : "분석 상태를 불러오지 못했습니다."); }); }, 1000);
  }

  useEffect(() => {
    if (!audio.automaticCapture || !sessionId || !goal) return;
    const capture = audio.automaticCapture;
    audio.clearAutomaticCapture();
    setStatus("5분 제한으로 녹음을 끝냈습니다.");
    void submitCapture(capture).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "녹음을 처리하지 못했습니다.");
      setStatus("다시 시도");
    });
  }, [audio.automaticCapture, goal, sessionId]);

  async function toggleRecording() {
    try {
      if (props.preview) {
        if (status !== "녹음 중") { setStatus("녹음 중"); return; }
        setAttempts((current) => [...current, {
          attemptId: `preview-attempt-${current.length + 1}`,
          attemptNumber: current.length + 1,
          status: "succeeded",
          result: current.length ? "passed" : "needs-retry",
          durationMs: 16_000,
        } as FocusedPracticeAttempt]);
        setStatus("다시 연습 가능");
        return;
      }
      if (!audio.recording) { await audio.start(); setStatus("녹음 중"); return; }
      const capture = await audio.stop();
      await submitCapture(capture);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "녹음을 처리하지 못했습니다."); setStatus("다시 시도"); }
  }

  const isRecording = props.preview ? status === "녹음 중" : audio.recording;

  if (loadState === "error") {
    return <div className="orbit-ds-page focused-practice-page"><section className="focused-practice-shell"><p className="orbit-ds-eyebrow">FOCUSED PRACTICE</p><h1>집중 연습을 준비하지 못했습니다.</h1><p className="focused-practice-error" role="alert">{error}</p><footer><OrbitButton onClick={() => setReloadKey((value) => value + 1)} icon={<IconRefresh size={18} />}>다시 시도</OrbitButton><a href={`/rehearsal/${encodeURIComponent(props.projectId)}/plan/${encodeURIComponent(props.sourceFullRunId)}`}>연습 계획으로 돌아가기</a></footer></section></div>;
  }

  return <div className="orbit-ds-page focused-practice-page">
    <div className="focused-practice-breadcrumb"><a href={`/rehearsal/${encodeURIComponent(props.projectId)}/plan/${encodeURIComponent(props.sourceFullRunId)}`}><IconArrowLeft size={17} /> 연습 계획</a><span>/</span><strong>집중 연습</strong></div>
    <section className="focused-practice-shell">
      <header><div><p className="orbit-ds-eyebrow">Focused practice</p><h1>한 구간만 짧게 반복하세요.</h1></div><OrbitStatus tone={stabilized ? "success" : "lilac"}>{stabilized ? "연습에서 안정화됨" : status}</OrbitStatus></header>
      {error ? <p role="alert" className="focused-practice-error">{error}</p> : null}
      <div className={`focused-practice-layout${deck && goal?.targetScope?.type === "slide" ? "" : " no-preview"}`}>
        {deck && goal?.targetScope?.type === "slide" ? props.preview ? <FocusedPreviewSlideCard deck={deck} slideId={goal.targetScope.slideId} /> : <Suspense fallback={<FocusedPreviewSlideCard deck={deck} slideId={goal.targetScope.slideId} />}><FocusedSlidePreview deck={deck} slideId={goal.targetScope.slideId} /></Suspense> : null}
        <article className="focused-practice-stage"><span><IconSparkles aria-hidden="true" size={22} /></span><small>현재 목표</small><h2>{goal?.problemLabel ?? "목표를 불러오는 중"}</h2><p>{goal?.nextAction}</p><div><IconCircleCheck aria-hidden="true" size={18} /><span>{goal?.successCondition}</span></div></article>
      </div>
      <section className="focused-attempt-history" aria-label="반복 결과"><header><h2>반복 기록</h2><span>{attempts.length}회 시도</span></header>{attempts.length === 0 ? <p>아직 반복 기록이 없습니다. 첫 녹음을 시작해 보세요.</p> : attempts.map((attempt) => <div key={attempt.attemptId}><span>{attempt.attemptNumber}회</span><strong>{attempt.status === "succeeded" ? attempt.result === "passed" ? "통과" : attempt.result === "unmeasured" ? "측정 불가" : "다시 연습" : "분석 중"}</strong><small>{attempt.status === "succeeded" ? attempt.result === "passed" ? "성공 기준을 안정적으로 충족했어요." : "근거 문장을 조금 더 짧게 말해 보세요." : "음성을 분석하고 있습니다."}</small><time>{attempt.durationMs ? `${Math.max(1, Math.round(attempt.durationMs / 1000))}초` : "-"}</time></div>)}</section>
      <footer><OrbitButton disabled={!sessionId || processing} icon={isRecording ? <IconSquare size={18} /> : attempts.length ? <IconRefresh size={18} /> : <IconMicrophone size={18} />} onClick={() => void toggleRecording()}>{isRecording ? "녹음 끝내기" : attempts.length ? "한 번 더 연습" : "녹음 시작"}</OrbitButton><OrbitButton variant="quiet" disabled={!sessionId || isRecording || processing} onClick={() => props.preview ? setStatus("연습 완료") : void completeFocusedSession(sessionId!).then(() => { sessionStorage.removeItem(sessionStorageKey); sessionStorage.removeItem(requestStorageKey); window.location.href = `/rehearsal/${encodeURIComponent(props.projectId)}/plan/${encodeURIComponent(props.sourceFullRunId)}`; })}>연습 마치기</OrbitButton></footer>
    </section>
  </div>;
}

function FocusedPreviewSlideCard(props: { deck: Deck; slideId: string }) {
  const slide = props.deck.slides.find((candidate) => candidate.slideId === props.slideId);
  if (!slide) return null;
  return <section className="focused-slide-preview focused-slide-preview-fallback" aria-labelledby="focused-slide-title"><div><small>현재 장표</small><h2 id="focused-slide-title">{slide.title}</h2></div><div><span>{String(slide.order).padStart(2, "0")} · FOCUS</span><strong>{slide.title}</strong><p>이 장표의 핵심 메시지와 근거를 짧게 반복합니다.</p></div></section>;
}
