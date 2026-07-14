import {
  maxAssetUploadSizeBytes,
  presentationBriefDraftSchema,
  pptxImportJobResultSchema,
  type Deck,
  type PresentationBrief,
  type PresentationBriefDraft,
} from "@orbit/shared";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  FileUp,
  Presentation,
  Sparkles,
} from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { useMemo, useRef, useState } from "react";

import { ReadOnlySlideCanvas } from "../slides/rendering";
import {
  createProject,
  deleteProject,
  uploadProjectAsset,
} from "../projects/ProjectAssetWorkspace";
import { putPresentationBrief } from "../coaching/presentationBriefApi";
import {
  createPptxImportJob,
  fetchImportedDeck,
  waitForPptxImportJob,
} from "./pptxImportApi";
import "./pptx-import.css";

type ImportPhase =
  | "select"
  | "creating"
  | "uploading"
  | "analyzing"
  | "review"
  | "saving"
  | "error";

type DraftForm = {
  audience: PresentationBriefDraft["audience"];
  challengeTopics: string;
  desiredOutcome: string;
  evaluatorLensId: PresentationBriefDraft["evaluatorLensRef"]["lensId"];
  mustCover: string;
  purpose: PresentationBriefDraft["purpose"];
  targetDurationMinutes: string;
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const phaseLabels: Record<ImportPhase, string> = {
  select: "PPTX 선택",
  creating: "새 프로젝트 준비 중",
  uploading: "PPTX 업로드 중",
  analyzing: "슬라이드와 Brief 분석 중",
  review: "Brief 검토",
  saving: "Brief 저장 중",
  error: "가져오기 확인 필요",
};

export function PptxImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("select");
  const [projectId, setProjectId] = useState("");
  const [savedBrief, setSavedBrief] = useState<PresentationBrief | null>(null);
  const [draftSource, setDraftSource] = useState<PresentationBriefDraft | null>(null);
  const [draftForm, setDraftForm] = useState<DraftForm | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const isBusy = ["creating", "uploading", "analyzing", "saving"].includes(phase);
  const returnPath = useMemo(safeReturnPath, []);

  function selectFile(nextFile: File | null) {
    if (!nextFile || isBusy) return;
    const validationMessage = getPptxValidationMessage(nextFile);
    if (validationMessage) {
      setError(validationMessage);
      setPhase("error");
      return;
    }
    setFile(nextFile);
    setError("");
    setPhase("select");
  }

  async function startImport() {
    if (!file || isBusy) return;
    let createdProjectId = "";
    let jobQueued = false;

    try {
      setError("");
      setPhase("creating");
      const project = await createProject(projectTitleFromFile(file.name));
      createdProjectId = project.projectId;
      setProjectId(project.projectId);

      const seedDraft = defaultDraft(project.title);
      const defaultBrief = await putPresentationBrief(project.projectId, {
        expectedRevision: 0,
        origin: "pptx-import",
        ...seedDraft,
        approvedReferenceFileIds: [],
      });
      setSavedBrief(defaultBrief);

      setPhase("uploading");
      const uploaded = await uploadProjectAsset(
        project.projectId,
        file,
        "pptx-import",
      );

      setPhase("analyzing");
      const queued = await createPptxImportJob(project.projectId, uploaded.fileId);
      jobQueued = true;
      const completed = await waitForPptxImportJob(queued.jobId);
      if (completed.status === "failed") {
        throw new Error(completed.error?.message ?? "PPTX 분석에 실패했습니다.");
      }

      const result = pptxImportJobResultSchema.parse(completed.result);
      const importedDeck = await fetchImportedDeck(project.projectId);
      const extractedDraft = result.briefDraft ?? seedDraft;
      setDeck(importedDeck);
      setDraftSource(extractedDraft);
      setDraftForm(toDraftForm(extractedDraft));
      setWarnings([
        ...result.warnings,
        ...(result.briefExtraction?.warnings ?? []),
      ]);
      setSelectedSlideIndex(0);
      setPhase("review");
    } catch (cause) {
      if (createdProjectId && !jobQueued) {
        await deleteProject(createdProjectId).catch(() => undefined);
        setProjectId("");
        setSavedBrief(null);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "PPTX를 가져오지 못했습니다.",
      );
      setPhase("error");
    }
  }

  async function saveBriefAndOpenEditor() {
    if (!draftForm || !draftSource || !savedBrief || !projectId) return;
    try {
      setError("");
      setPhase("saving");
      const draft = draftFromForm(draftForm, draftSource);
      await putPresentationBrief(projectId, {
        expectedRevision: savedBrief.revision,
        ...draft,
        approvedReferenceFileIds: savedBrief.approvedReferences.map(
          (reference) => reference.fileId,
        ),
      });
      navigate(`/project/${encodeURIComponent(projectId)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Brief를 저장하지 못했습니다.",
      );
      setPhase("review");
    }
  }

  return (
    <main className="pptx-import-page" aria-busy={isBusy}>
      <section className="pptx-import-hero">
        <button className="pptx-import-back" onClick={() => navigate(returnPath)} type="button">
          <ChevronLeft size={17} /> 돌아가기
        </button>
        <div>
          <span className="pptx-import-hero-icon"><Presentation size={22} /></span>
          <p>PPTX 가져오기</p>
          <h1>기존 발표자료를 새 프로젝트로<br />안전하게 가져와요.</h1>
          <span>원본 파일과 현재 프로젝트는 그대로 유지됩니다.</span>
        </div>
      </section>

      <section className="pptx-import-workspace">
        <ol className="pptx-import-step-rail" aria-label="PPTX 가져오기 단계">
          {[
            ["파일 선택", "PPTX 업로드"],
            ["자료 분석", "슬라이드와 구조 확인"],
            ["Brief 검토", "발표 기준 확인"],
          ].map(([title, description], index) => {
            const current = stepIndex(phase);
            return <li className={current === index ? "active" : current > index ? "complete" : ""} key={title}><span>{current > index ? <Check size={14} /> : index + 1}</span><div><strong>{title}</strong><small>{description}</small></div></li>;
          })}
        </ol>

        <section className="pptx-import-main-panel">
          {phase === "select" || phase === "error" ? (
            <div className="pptx-import-select-view">
              <header><p>1. PPTX 선택</p><h2>가져올 발표자료를 선택해 주세요.</h2><span>파일을 확인한 뒤 새 프로젝트를 만들고 분석을 시작합니다.</span></header>
              <button
                className={`pptx-import-dropzone ${file ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event: DragEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  selectFile(event.dataTransfer.files[0] ?? null);
                }}
                type="button"
              >
                <span><FileUp size={24} /></span>
                {file ? <><strong>{file.name}</strong><small>{formatBytes(file.size)} · 다른 파일 선택</small></> : <><strong>PPTX 파일을 끌어놓거나 선택</strong><small>최대 {formatBytes(maxAssetUploadSizeBytes)}</small></>}
              </button>
              {error ? <p className="pptx-import-error" role="alert"><AlertCircle size={16} />{error}</p> : null}
              {phase === "error" && projectId ? (
                <button className="pptx-import-primary" onClick={() => navigate(`/project/${encodeURIComponent(projectId)}`)} type="button">생성된 프로젝트 열기</button>
              ) : (
                <button className="pptx-import-primary" disabled={!file} onClick={() => void startImport()} type="button">새 프로젝트로 가져오기</button>
              )}
            </div>
          ) : phase === "review" || phase === "saving" ? (
            draftForm && deck ? (
              <BriefReview
                deck={deck}
                draft={draftForm}
                error={error}
                onChange={setDraftForm}
                onSave={() => void saveBriefAndOpenEditor()}
                onSlideChange={setSelectedSlideIndex}
                saving={phase === "saving"}
                selectedSlideIndex={selectedSlideIndex}
                warnings={warnings}
              />
            ) : null
          ) : (
            <div className="pptx-import-progress" role="status">
              <span className="pptx-import-progress-mark"><Sparkles size={25} /></span>
              <p>{phaseLabels[phase]}</p>
              <h2>{phase === "analyzing" ? "슬라이드와 발표 기준을 함께 읽고 있어요." : "새 프로젝트를 준비하고 있어요."}</h2>
              <div><span /></div>
              <small>이 창을 닫지 않고 잠시 기다려 주세요.</small>
            </div>
          )}
        </section>
      </section>

      <input
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          selectFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
    </main>
  );
}

function BriefReview(props: {
  deck: Deck;
  draft: DraftForm;
  error: string;
  onChange: (draft: DraftForm) => void;
  onSave: () => void;
  onSlideChange: (index: number) => void;
  saving: boolean;
  selectedSlideIndex: number;
  warnings: string[];
}) {
  const slide = props.deck.slides[props.selectedSlideIndex] ?? props.deck.slides[0];
  return (
    <div className="pptx-import-review">
      <section className="pptx-import-brief-form">
        <header><p>3. Brief 검토</p><h2>AI가 읽은 발표 기준을 확인해 주세요.</h2><span>가져온 뒤에도 에디터의 Brief 패널에서 수정할 수 있어요.</span></header>
        <div className="pptx-import-form-row">
          <label><span>청중</span><select onChange={(event) => props.onChange({ ...props.draft, audience: event.target.value as DraftForm["audience"] })} value={props.draft.audience}><option value="novice">처음 듣는 청중</option><option value="practitioner">실무자</option><option value="decision-maker">의사결정자</option></select></label>
          <label><span>발표 목적</span><select onChange={(event) => props.onChange({ ...props.draft, purpose: event.target.value as DraftForm["purpose"] })} value={props.draft.purpose}><option value="inform">설명</option><option value="persuade">설득</option><option value="teach">교육</option><option value="report">보고</option></select></label>
        </div>
        <div className="pptx-import-form-row narrow-first">
          <label><span>목표 시간</span><div className="pptx-import-duration"><input inputMode="numeric" min="1" max="120" onChange={(event) => props.onChange({ ...props.draft, targetDurationMinutes: event.target.value })} value={props.draft.targetDurationMinutes} /><small>분</small></div></label>
          <label><span>발표 후 원하는 결과</span><input maxLength={240} onChange={(event) => props.onChange({ ...props.draft, desiredOutcome: event.target.value })} value={props.draft.desiredOutcome} /></label>
        </div>
        <label><span>반드시 전달할 내용</span><textarea maxLength={720} onChange={(event) => props.onChange({ ...props.draft, mustCover: event.target.value })} rows={5} value={props.draft.mustCover} /><small>한 줄에 하나씩, 최대 3개</small></label>
        <label><span>예상 질문 주제</span><textarea maxLength={360} onChange={(event) => props.onChange({ ...props.draft, challengeTopics: event.target.value })} rows={3} value={props.draft.challengeTopics} /></label>
        {props.error ? <p className="pptx-import-error" role="alert"><AlertCircle size={16} />{props.error}</p> : null}
      </section>
      <aside className="pptx-import-preview-panel">
        <header><span>가져온 슬라이드</span><strong>{props.selectedSlideIndex + 1} / {props.deck.slides.length}</strong></header>
        {slide ? <div className="pptx-import-slide-preview"><ReadOnlySlideCanvas deck={props.deck} scale={0.17} slide={slide} /></div> : null}
        <div className="pptx-import-slide-dots">{props.deck.slides.slice(0, 8).map((item, index) => <button aria-label={`${index + 1}번 슬라이드 보기`} aria-pressed={index === props.selectedSlideIndex} key={item.slideId} onClick={() => props.onSlideChange(index)} type="button">{index + 1}</button>)}</div>
        <div className="pptx-import-impact"><Sparkles size={17} /><span><strong>Brief만 먼저 확인해요.</strong>이 단계에서 슬라이드 내용은 바뀌지 않습니다.</span></div>
        {props.warnings.length > 0 ? <details><summary>분석 메모 {props.warnings.length}개</summary><ul>{props.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
        <button className="pptx-import-primary" disabled={props.saving} onClick={props.onSave} type="button">{props.saving ? "저장 중" : "Brief 저장하고 편집 시작"}</button>
      </aside>
    </div>
  );
}

function defaultDraft(title: string): PresentationBriefDraft {
  return presentationBriefDraftSchema.parse({
    audience: "novice",
    purpose: "inform",
    evaluatorLensRef: { lensId: "general-novice", revision: 1 },
    targetDurationMinutes: 10,
    desiredOutcome: `${title.slice(0, 210)}의 핵심 내용을 이해한다.`,
    requirements: [],
    terminology: [],
    challengeTopics: [],
  });
}

function toDraftForm(draft: PresentationBriefDraft): DraftForm {
  return {
    audience: draft.audience,
    challengeTopics: draft.challengeTopics.join("\n"),
    desiredOutcome: draft.desiredOutcome,
    evaluatorLensId: draft.evaluatorLensRef.lensId,
    mustCover: draft.requirements.filter((item) => item.kind === "must-cover" && item.reviewStatus === "approved").map((item) => item.text).join("\n"),
    purpose: draft.purpose,
    targetDurationMinutes: String(draft.targetDurationMinutes),
  };
}

function draftFromForm(form: DraftForm, current: PresentationBriefDraft): PresentationBriefDraft {
  const targetDurationMinutes = Number(form.targetDurationMinutes);
  const preserved = current.requirements.filter((item) => item.kind !== "must-cover").map((item) => ({ kind: item.kind, text: item.text, reviewStatus: item.reviewStatus }));
  return presentationBriefDraftSchema.parse({
    audience: form.audience,
    purpose: form.purpose,
    evaluatorLensRef: { lensId: form.evaluatorLensId, revision: 1 },
    targetDurationMinutes,
    desiredOutcome: form.desiredOutcome,
    requirements: [...toLines(form.mustCover, 3).map((text) => ({ kind: "must-cover" as const, text, reviewStatus: "approved" as const })), ...preserved],
    terminology: current.terminology,
    challengeTopics: toLines(form.challengeTopics, 3),
  });
}

function getPptxValidationMessage(file: Pick<File, "name" | "size" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type !== pptxMimeType && extension !== "pptx") return "PPTX 파일만 가져올 수 있습니다.";
  if (file.size <= 0) return "빈 PPTX 파일은 가져올 수 없습니다.";
  if (file.size > maxAssetUploadSizeBytes) return `PPTX 파일 크기는 최대 ${formatBytes(maxAssetUploadSizeBytes)}까지 가능합니다.`;
  return "";
}

function projectTitleFromFile(fileName: string) {
  return fileName.replace(/\.pptx$/i, "").trim() || "가져온 발표자료";
}

function stepIndex(phase: ImportPhase) {
  if (phase === "review" || phase === "saving") return 2;
  if (phase === "analyzing") return 1;
  return 0;
}

function toLines(value: string, max: number) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, max);
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function safeReturnPath() {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/project/") ? value : "/project";
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
