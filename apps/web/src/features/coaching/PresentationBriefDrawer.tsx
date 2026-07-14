import type {
  BriefRequirement,
  BriefRequirementInput,
  EvaluatorLensDefinition,
  PresentationBrief,
  PutPresentationBriefRequest,
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Pencil, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchEvaluatorLenses,
  fetchPresentationBrief,
  PresentationBriefConflictError,
  putPresentationBrief,
} from "./presentationBriefApi";
import "./presentation-brief-drawer.css";

type Audience = PutPresentationBriefRequest["audience"];
type Purpose = PutPresentationBriefRequest["purpose"];

const audienceOptions: ReadonlyArray<{ id: Audience; label: string }> = [
  { id: "novice", label: "처음 듣는 청중" },
  { id: "practitioner", label: "실무자" },
  { id: "decision-maker", label: "의사결정자" },
];

const purposeOptions: ReadonlyArray<{ id: Purpose; label: string }> = [
  { id: "inform", label: "설명" },
  { id: "persuade", label: "설득" },
  { id: "teach", label: "교육" },
  { id: "report", label: "보고" },
];

const fallbackLenses: EvaluatorLensDefinition[] = [
  {
    ref: { lensId: "general-novice", revision: 1 },
    label: "처음 듣는 청중",
    description: "배경지식 없이도 핵심 흐름과 결론을 이해할 수 있는지 봅니다.",
    priorityOrder: ["structure", "semantic", "timing", "delivery"],
  },
  {
    ref: { lensId: "decision-maker", revision: 1 },
    label: "의사결정자",
    description: "결정에 필요한 근거, 반론 대응, 다음 행동이 분명한지 봅니다.",
    priorityOrder: ["semantic", "structure", "timing", "delivery"],
  },
  {
    ref: { lensId: "strict-reviewer", revision: 1 },
    label: "엄격한 검토자",
    description: "주장과 근거의 연결과 빠진 조건을 우선해 봅니다.",
    priorityOrder: ["semantic", "delivery", "structure", "timing"],
  },
];

export function PresentationBriefDrawer(props: {
  onClose: () => void;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const briefQuery = useQuery({
    queryKey: ["presentation-brief", props.projectId],
    queryFn: () => fetchPresentationBrief(props.projectId),
    retry: false,
  });
  const lensesQuery = useQuery({
    queryKey: ["evaluator-lenses"],
    queryFn: () => fetchEvaluatorLenses(),
    retry: false,
  });
  const hydratedRevision = useRef<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [audience, setAudience] = useState<Audience>("novice");
  const [purpose, setPurpose] = useState<Purpose>("inform");
  const [lensId, setLensId] = useState("general-novice");
  const [duration, setDuration] = useState("10");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [mustCover, setMustCover] = useState("");
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [challengeTopics, setChallengeTopics] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const brief = briefQuery.data;
    const revision = brief?.revision ?? 0;
    if (hydratedRevision.current === revision) return;
    hydratedRevision.current = revision;
    if (!brief) {
      setIsEditing(true);
      return;
    }
    hydrateDraft(brief, {
      setAudience,
      setChallengeTopics,
      setClosing,
      setDesiredOutcome,
      setDuration,
      setLensId,
      setMustCover,
      setOpening,
      setPurpose,
    });
  }, [briefQuery.data]);

  const brief = briefQuery.data;
  const lenses = lensesQuery.data ?? fallbackLenses;
  const selectedLens = useMemo(
    () => lenses.find((lens) => lens.ref.lensId === lensId) ?? lenses[0],
    [lensId, lenses],
  );

  async function saveBrief() {
    const targetDurationMinutes = Number(duration);
    if (!Number.isInteger(targetDurationMinutes) || targetDurationMinutes < 1 || targetDurationMinutes > 120) {
      setError("목표 시간은 1~120분으로 입력해 주세요.");
      return;
    }
    if (!desiredOutcome.trim() || !selectedLens) {
      setError("발표 후 원하는 결과와 평가 관점을 확인해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const saved = await putPresentationBrief(props.projectId, {
        expectedRevision: brief?.revision ?? 0,
        ...(brief ? {} : { origin: "manual" as const }),
        audience,
        purpose,
        evaluatorLensRef: selectedLens.ref,
        targetDurationMinutes,
        desiredOutcome: desiredOutcome.trim(),
        requirements: buildRequirementInputs(brief, mustCover, opening, closing),
        terminology: brief?.terminology ?? [],
        challengeTopics: toLines(challengeTopics, 3),
        approvedReferenceFileIds: brief?.approvedReferences.map((item) => item.fileId) ?? [],
      });
      hydratedRevision.current = saved.revision;
      queryClient.setQueryData(["presentation-brief", props.projectId], saved);
      setMessage(`브리프 ${saved.revision}차 저장 완료`);
      setIsEditing(false);
    } catch (cause) {
      setError(
        cause instanceof PresentationBriefConflictError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Brief를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      aria-label="발표 브리프"
      className="presentation-brief-drawer"
      data-testid="presentation-brief-drawer"
      role="dialog"
    >
      <header className="presentation-brief-drawer-header">
        <div>
          <span className="presentation-brief-drawer-icon"><FileText size={18} /></span>
          <div><strong>발표 브리프</strong><small>발표의 기준</small></div>
        </div>
        <button aria-label="브리프 닫기" onClick={props.onClose} type="button"><X size={19} /></button>
      </header>

      {briefQuery.isLoading || lensesQuery.isLoading ? (
        <div className="presentation-brief-drawer-state" role="status">브리프를 불러오고 있어요.</div>
      ) : isEditing ? (
        <div className="presentation-brief-drawer-edit">
          <DrawerChoiceGroup label="청중" onChange={(value) => setAudience(value as Audience)} options={audienceOptions} selected={audience} />
          <DrawerChoiceGroup label="발표 목적" onChange={(value) => setPurpose(value as Purpose)} options={purposeOptions} selected={purpose} />
          <label className="presentation-brief-drawer-field">
            <span>발표 후 원하는 결과</span>
            <textarea maxLength={240} onChange={(event) => setDesiredOutcome(event.target.value)} rows={3} value={desiredOutcome} />
          </label>
          <label className="presentation-brief-drawer-field compact">
            <span>목표 시간</span>
            <span className="presentation-brief-duration-input"><input inputMode="numeric" max="120" min="1" onChange={(event) => setDuration(event.target.value)} value={duration} /><small>분</small></span>
          </label>
          <label className="presentation-brief-drawer-field">
            <span>반드시 전달할 내용</span>
            <textarea maxLength={720} onChange={(event) => setMustCover(event.target.value)} placeholder="한 줄에 하나씩, 최대 3개" rows={4} value={mustCover} />
          </label>
          <div className="presentation-brief-drawer-split">
            <label className="presentation-brief-drawer-field"><span>오프닝 조건</span><input maxLength={240} onChange={(event) => setOpening(event.target.value)} value={opening} /></label>
            <label className="presentation-brief-drawer-field"><span>클로징 조건</span><input maxLength={240} onChange={(event) => setClosing(event.target.value)} value={closing} /></label>
          </div>
          <label className="presentation-brief-drawer-field">
            <span>예상 질문 주제</span>
            <textarea maxLength={360} onChange={(event) => setChallengeTopics(event.target.value)} placeholder="한 줄에 하나씩, 최대 3개" rows={3} value={challengeTopics} />
          </label>
          <fieldset className="presentation-brief-drawer-lenses">
            <legend>평가 관점</legend>
            {lenses.map((lens) => (
              <button aria-pressed={lens.ref.lensId === selectedLens?.ref.lensId} key={lens.ref.lensId} onClick={() => setLensId(lens.ref.lensId)} type="button">
                <span>{lens.ref.lensId === selectedLens?.ref.lensId ? <Check size={13} /> : null}</span>
                <strong>{lens.label}</strong>
                <small>{lens.description}</small>
              </button>
            ))}
          </fieldset>
        </div>
      ) : brief ? (
        <div className="presentation-brief-drawer-view">
          <div className="presentation-brief-origin-row">
            <span>{originLabel(brief.origin)}</span>
            <small>마지막 수정 {formatBriefDate(brief.updatedAt)}</small>
          </div>
          {message ? <p className="presentation-brief-drawer-success" role="status"><Check size={15} />{message}</p> : null}
          <SummaryPair label="청중" value={audienceLabel(brief.audience)} />
          <SummaryPair label="발표 목적" value={purposeLabel(brief.purpose)} />
          <SummaryPair label="목표 시간" value={`${brief.targetDurationMinutes}분`} />
          <section className="presentation-brief-summary-section"><span>발표 후 원하는 결과</span><strong>{brief.desiredOutcome}</strong></section>
          <section className="presentation-brief-summary-section"><span>반드시 전달할 내용</span>{requirementsFor(brief, "must-cover").length > 0 ? <ul>{requirementsFor(brief, "must-cover").map((item) => <li key={item.requirementId}>{item.text}</li>)}</ul> : <small>정해진 항목이 없습니다.</small>}</section>
          <SummaryPair label="평가 관점" value={selectedLens?.label ?? brief.evaluatorLensRef.lensId} />
          {brief.challengeTopics.length > 0 ? <section className="presentation-brief-summary-section"><span>예상 질문 주제</span><div className="presentation-brief-topic-list">{brief.challengeTopics.map((topic) => <small key={topic}>{topic}</small>)}</div></section> : null}
          <div className="presentation-brief-drawer-impact"><Sparkles size={18} /><span><strong>다음 생성과 리허설에 반영돼요.</strong>기존 슬라이드는 바뀌지 않으며, 이후 AI 수정과 평가 기준부터 적용됩니다.</span></div>
        </div>
      ) : null}

      {error ? <div className="presentation-brief-drawer-error" role="alert"><p>{error}</p>{error.includes("다른 변경") ? <button onClick={() => void briefQuery.refetch()} type="button">최신 내용 불러오기</button> : null}</div> : null}
      <footer className="presentation-brief-drawer-footer">
        {isEditing ? (
          <><button className="secondary" disabled={saving || !brief} onClick={() => setIsEditing(false)} type="button">취소</button><button className="primary" disabled={saving} onClick={() => void saveBrief()} type="button">{saving ? "저장 중" : "브리프 저장"}</button></>
        ) : (
          <button className="primary" onClick={() => { setError(""); setIsEditing(true); }} type="button"><Pencil size={15} />브리프 수정</button>
        )}
      </footer>
    </aside>
  );
}

function DrawerChoiceGroup(props: { label: string; onChange: (value: string) => void; options: ReadonlyArray<{ id: string; label: string }>; selected: string }) {
  return <fieldset className="presentation-brief-drawer-choice"><legend>{props.label}</legend><div>{props.options.map((option) => <button aria-pressed={props.selected === option.id} key={option.id} onClick={() => props.onChange(option.id)} type="button">{props.selected === option.id ? <Check size={13} /> : null}{option.label}</button>)}</div></fieldset>;
}

function SummaryPair(props: { label: string; value: string }) {
  return <div className="presentation-brief-summary-pair"><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function hydrateDraft(brief: PresentationBrief, setters: {
  setAudience: (value: Audience) => void; setChallengeTopics: (value: string) => void; setClosing: (value: string) => void; setDesiredOutcome: (value: string) => void; setDuration: (value: string) => void; setLensId: (value: string) => void; setMustCover: (value: string) => void; setOpening: (value: string) => void; setPurpose: (value: Purpose) => void;
}) {
  setters.setAudience(brief.audience);
  setters.setPurpose(brief.purpose);
  setters.setLensId(brief.evaluatorLensRef.lensId);
  setters.setDuration(String(brief.targetDurationMinutes));
  setters.setDesiredOutcome(brief.desiredOutcome);
  setters.setMustCover(requirementsFor(brief, "must-cover").map((item) => item.text).join("\n"));
  setters.setOpening(requirementsFor(brief, "opening")[0]?.text ?? "");
  setters.setClosing(requirementsFor(brief, "closing")[0]?.text ?? "");
  setters.setChallengeTopics(brief.challengeTopics.join("\n"));
}

function requirementsFor(brief: PresentationBrief, kind: BriefRequirement["kind"]) {
  return brief.requirements.filter((item) => item.kind === kind);
}

function buildRequirementInputs(brief: PresentationBrief | null | undefined, mustCover: string, opening: string, closing: string): BriefRequirementInput[] {
  const items: Array<{ kind: BriefRequirement["kind"]; text: string }> = [
    ...toLines(mustCover, 3).map((text) => ({ kind: "must-cover" as const, text })),
    ...(opening.trim() ? [{ kind: "opening" as const, text: opening.trim() }] : []),
    ...(closing.trim() ? [{ kind: "closing" as const, text: closing.trim() }] : []),
  ];
  const used = new Set<string>();
  return items.map((item) => {
    const existing = brief?.requirements.find((candidate) => candidate.kind === item.kind && !used.has(candidate.requirementId));
    if (existing) used.add(existing.requirementId);
    return { kind: item.kind, text: item.text, reviewStatus: "approved", ...(existing ? { requirementId: existing.requirementId, expectedRevision: existing.revision } : {}) };
  });
}

function toLines(value: string, max: number) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, max);
}

function originLabel(origin: PresentationBrief["origin"]) {
  return origin === "ai-generation" ? "AI 생성" : origin === "pptx-import" ? "PPTX 분석" : "직접 작성";
}

function audienceLabel(value: Audience) {
  return audienceOptions.find((option) => option.id === value)?.label ?? value;
}

function purposeLabel(value: Purpose) {
  return purposeOptions.find((option) => option.id === value)?.label ?? value;
}

function formatBriefDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date(value));
}
