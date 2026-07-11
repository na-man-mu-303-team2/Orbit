import type { FocusedPracticeAttempt, PracticePlanResponse } from "@orbit/shared";
import { CheckCircle2, Mic2, RotateCcw, Square, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { OrbitButton, OrbitStatus } from "../../design-system";
import { fetchPracticePlan } from "./practicePlanApi";
import { completeFocusedSession, createFocusedSession, getFocusedSession, submitFocusedAudio } from "./focusedPracticeApi";
import { useFocusedPracticeAudio, type FocusedPracticeCapture } from "./useFocusedPracticeAudio";
import "./focused-practice.css";

export function FocusedPracticePage(props: { projectId: string; goalId: string; sourceFullRunId: string }) {
  const [plan, setPlan] = useState<Extract<PracticePlanResponse, { status: "ready" }> | null>(null);
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem(`orbit.focused.${props.goalId}`));
  const [attempts, setAttempts] = useState<FocusedPracticeAttempt[]>([]); const [stabilized, setStabilized] = useState(false);
  const [status, setStatus] = useState("준비 중"); const [error, setError] = useState("");
  const audio = useFocusedPracticeAudio();

  useEffect(() => { void (async () => {
    try {
      const nextPlan = await fetchPracticePlan(props.projectId, props.sourceFullRunId);
      if (nextPlan.status !== "ready") throw new Error("연습 계획이 준비되지 않았습니다.");
      setPlan(nextPlan);
      let id = sessionId;
      if (!id) { const session = await createFocusedSession(props.projectId, nextPlan, props.goalId); id = session.practiceSessionId; sessionStorage.setItem(`orbit.focused.${props.goalId}`, id); setSessionId(id); }
      const current = await getFocusedSession(id); setAttempts(current.attempts); setStabilized(current.stabilization.find((item) => item.goalId === props.goalId)?.stabilized ?? false); setStatus("연습 가능");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "부분 연습을 준비하지 못했습니다."); }
  })(); }, [props.goalId, props.projectId, props.sourceFullRunId]);
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
      if (!audio.recording) { await audio.start(); setStatus("녹음 중"); return; }
      const capture = await audio.stop();
      await submitCapture(capture);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "녹음을 처리하지 못했습니다."); setStatus("다시 시도"); }
  }

  return <main className="orbit-ds-page focused-practice-page">
    <section className="focused-practice-shell">
      <header><div><p className="orbit-ds-eyebrow">Focused practice</p><h1>한 구간만 짧게 반복하세요.</h1></div><OrbitStatus tone={stabilized ? "success" : "lilac"}>{stabilized ? "연습에서 안정화됨" : status}</OrbitStatus></header>
      {error ? <p role="alert" className="focused-practice-error">{error}</p> : null}
      <article className="focused-practice-stage"><Target aria-hidden="true" size={28} /><small>현재 목표</small><h2>{goal?.problemLabel ?? "목표를 불러오는 중"}</h2><p>{goal?.nextAction}</p><div><CheckCircle2 aria-hidden="true" size={18} /><span>{goal?.successCondition}</span></div></article>
      <section className="focused-attempt-history" aria-label="반복 결과"><h2>반복 기록</h2>{attempts.length === 0 ? <p>아직 반복 기록이 없습니다.</p> : attempts.map((attempt) => <div key={attempt.attemptId}><span>{attempt.attemptNumber}회</span><strong>{attempt.status === "succeeded" ? attempt.result === "passed" ? "통과" : attempt.result === "unmeasured" ? "측정 불가" : "다시 연습" : "분석 중"}</strong></div>)}</section>
      <footer><OrbitButton disabled={!sessionId || processing} icon={audio.recording ? <Square size={18} /> : attempts.length ? <RotateCcw size={18} /> : <Mic2 size={18} />} onClick={() => void toggleRecording()}>{audio.recording ? "녹음 끝내기" : attempts.length ? "한 번 더 연습" : "녹음 시작"}</OrbitButton><OrbitButton variant="quiet" disabled={!sessionId || audio.recording || processing} onClick={() => void completeFocusedSession(sessionId!).then(() => { sessionStorage.removeItem(`orbit.focused.${props.goalId}`); window.location.href = `/rehearsal/${props.projectId}/plan/${props.sourceFullRunId}`; })}>연습 마치기</OrbitButton></footer>
    </section>
  </main>;
}
