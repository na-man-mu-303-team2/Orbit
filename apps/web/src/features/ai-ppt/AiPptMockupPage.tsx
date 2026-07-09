import type {
  DeckColorOptionsResponse,
  GenerateDeckRequest,
  Job
} from "@orbit/shared";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers3,
  Palette,
  Paperclip,
  Play,
  Sparkles
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  uploadProjectAsset
} from "../projects/ProjectAssetWorkspace";

type StepId = "brief" | "style" | "color" | "references" | "review" | "preview";
type ReferencePolicy = "topic-only" | "references-first" | "references-only";
type Tone = "professional" | "friendly" | "confident" | "concise";

type PaletteOverride = NonNullable<GenerateDeckRequest["design"]["paletteOverride"]>;

export type PaletteOption = {
  optionId: string;
  name: string;
  rationale: string;
  palette: Required<PaletteOverride>;
};

type AiPptWizardState = {
  topic: string;
  purpose: string;
  context: string;
  audience: string;
  presentationType: string;
  successCriteria: string;
  duration: string;
  slides: string;
  tone: Tone;
  colorMood: string;
  referencePolicy: ReferencePolicy;
};

const stylePackId = "brandlogy-modern";

const steps: Array<{ id: StepId; label: string }> = [
  { id: "brief", label: "Brief" },
  { id: "style", label: "Style" },
  { id: "color", label: "Color" },
  { id: "references", label: "References" },
  { id: "review", label: "Review" },
  { id: "preview", label: "Deck" }
];

const fallbackPaletteOptions: PaletteOption[] = [
  {
    optionId: "brandlogy-blue",
    name: "Brandlogy Blue",
    rationale: "Clean default palette for a modern Korean product deck.",
    palette: {
      primary: "#2563EB",
      secondary: "#0F766E",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      muted: "#E0F2FE",
      border: "#BAE6FD",
      text: "#0F172A",
      accentColor: "#F472B6"
    }
  },
  {
    optionId: "executive-slate",
    name: "Executive Slate",
    rationale: "Restrained contrast for internal decision meetings.",
    palette: {
      primary: "#334155",
      secondary: "#64748B",
      background: "#FFFFFF",
      surface: "#F8FAFC",
      muted: "#E2E8F0",
      border: "#CBD5E1",
      text: "#111827",
      accentColor: "#0891B2"
    }
  },
  {
    optionId: "modern-violet",
    name: "Modern Violet",
    rationale: "Expressive palette for AI, product, and creative narratives.",
    palette: {
      primary: "#7C3AED",
      secondary: "#4F46E5",
      background: "#FAF5FF",
      surface: "#FFFFFF",
      muted: "#EDE9FE",
      border: "#DDD6FE",
      text: "#18181B",
      accentColor: "#EC4899"
    }
  }
];

const initialState: AiPptWizardState = {
  topic: "Design Pack 기반 AI PPT 생성 구조 제안",
  purpose: "템플릿 덮어쓰기에서 벗어나 Deck JSON 기반 생성 MVP를 설명",
  context: "제품/개발 리드 대상 15분 의사결정 회의",
  audience: "PM, 프론트엔드, 백엔드, AI 파이프라인 담당자",
  presentationType: "기획 발표",
  successCriteria: "1차 구현 범위와 다음 스프린트 우선순위 합의",
  duration: "15",
  slides: "8",
  tone: "professional",
  colorMood: "전문가스럽고 차분한 파란색, Brandlogy다운 포인트 컬러",
  referencePolicy: "references-first"
};

const generationStages = [
  "Brief 설문 정리",
  "색상 후보 3개 선택",
  "Session Design Pack 구성",
  "Deck JSON 생성",
  "에디터 렌더링",
  "PPTX export 준비"
];

export function buildAiPptGenerateDeckPayload(
  state: AiPptWizardState,
  paletteOption: PaletteOption,
  referenceFileIds: string[] = []
): GenerateDeckRequest {
  const durationMinutes = parsePositiveInteger(state.duration, 10);
  const slideCount = parsePositiveInteger(state.slides, 8);

  return {
    topic: state.topic.trim(),
    prompt: [
      state.purpose.trim(),
      state.context.trim(),
      state.successCriteria.trim()
    ]
      .filter(Boolean)
      .join("\n"),
    designPrompt: [
      `tone=${state.tone}`,
      `colorMood=${state.colorMood.trim()}`,
      `base=${stylePackId}`,
      "layout=chart-first cards tables process",
      "output=Deck JSON first"
    ].join("; "),
    brief: {
      presentationContext: state.context.trim(),
      audienceText: state.audience.trim(),
      presentationType: state.presentationType.trim(),
      successCriteria: state.successCriteria.trim(),
      durationMinutes,
      referencePolicy: state.referencePolicy
    },
    targetDurationMinutes: durationMinutes,
    slideCountRange: {
      min: slideCount,
      max: slideCount
    },
    template: "default",
    metadata: {
      audience: "general",
      purpose: "inform",
      tone: state.tone
    },
    design: {
      stylePackId,
      visualRhythm: "clean",
      densityTarget: "medium",
      mediaPolicy: "balanced",
      layoutDiversity: "varied",
      paletteOverride: paletteOption.palette
    },
    references: referenceFileIds.map((fileId) => ({ fileId })),
    designReferences: [],
    referenceKeywords: [],
    referenceContext: []
  };
}

export function getAiPptWizardValidationMessage(
  state: AiPptWizardState,
  referenceFiles: File[] = []
) {
  if (!state.topic.trim()) return "발표 주제를 입력하세요.";
  if (parsePositiveInteger(state.duration, 0) < 1) {
    return "발표 시간은 1분 이상이어야 합니다.";
  }
  if (parsePositiveInteger(state.slides, 0) < 1) {
    return "슬라이드 수는 1장 이상이어야 합니다.";
  }
  if (state.referencePolicy === "references-only" && referenceFiles.length === 0) {
    return "참고자료만으로 구성하려면 파일을 1개 이상 첨부하세요.";
  }
  return "";
}

export function AiPptMockupPage() {
  const [currentStep, setCurrentStep] = useState<StepId>("brief");
  const [form, setForm] = useState(initialState);
  const [paletteOptions, setPaletteOptions] = useState(fallbackPaletteOptions);
  const [selectedPaletteId, setSelectedPaletteId] = useState(
    fallbackPaletteOptions[0].optionId
  );
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [isLoadingColors, setIsLoadingColors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const colorRequestKey = `${form.topic}|${form.colorMood}`;
  const loadedColorRequestKey = useRef("");
  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);
  const selectedPalette =
    paletteOptions.find((palette) => palette.optionId === selectedPaletteId) ??
    paletteOptions[0];
  const payloadPreview = useMemo(
    () => buildAiPptGenerateDeckPayload(form, selectedPalette),
    [form, selectedPalette]
  );

  useEffect(() => {
    if (currentStep !== "color") return;
    if (loadedColorRequestKey.current === colorRequestKey) return;
    void loadColorOptions();
  }, [colorRequestKey, currentStep]);

  function updateForm<K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function goToStep(step: StepId) {
    setCurrentStep(step);
    setError("");
  }

  function goNext() {
    if (currentStep === "review") {
      void submitGeneration();
      return;
    }
    const nextStep = steps[Math.min(currentStepIndex + 1, steps.length - 1)];
    setCurrentStep(nextStep.id);
  }

  async function loadColorOptions() {
    setIsLoadingColors(true);
    setError("");
    try {
      const options = await fetchDeckColorOptions({
        topic: form.topic,
        colorMood: form.colorMood,
        stylePackId
      });
      setPaletteOptions(options);
      setSelectedPaletteId(options[0].optionId);
      loadedColorRequestKey.current = colorRequestKey;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "색상 후보를 불러오지 못했습니다."
      );
    } finally {
      setIsLoadingColors(false);
    }
  }

  async function submitGeneration() {
    const validationMessage = getAiPptWizardValidationMessage(form, referenceFiles);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsGenerating(true);
    setError("");
    setStatus("프로젝트 생성 중...");
    setJob(null);

    try {
      const project = await createProject(getProjectTitle(form.topic));
      const referenceFileIds: string[] = [];
      for (const file of referenceFiles) {
        setStatus(`${file.name} 업로드 중...`);
        const uploaded = await uploadProjectAsset(
          project.projectId,
          file,
          "reference-material"
        );
        referenceFileIds.push(uploaded.fileId);
      }

      setStatus("Deck JSON 생성 job 시작 중...");
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(project.projectId)}/jobs/generate-deck`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            buildAiPptGenerateDeckPayload(form, selectedPalette, referenceFileIds)
          )
        }
      );
      if (!response.ok) {
        throw new Error(await readResponseText(response, "AI PPT 생성을 시작하지 못했습니다."));
      }

      const data = (await response.json()) as { job: Job };
      setJob(data.job);
      setStatus("Deck JSON 생성 중...");
      const completed = await pollJob(data.job.jobId);
      setJob(completed);
      if (completed.status === "failed") {
        throw new Error(completed.error?.message || completed.message);
      }

      setStatus("에디터로 이동 중...");
      navigateToProject(project.projectId);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "AI PPT 생성에 실패했습니다."
      );
      setStatus("");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="ai-ppt-page">
      <header className="ai-ppt-header">
        <div>
          <span>AI PPT Wizard</span>
          <h1>Design Pack으로 시작하는 새 발표 생성</h1>
          <p>
            템플릿 파일을 덮어쓰지 않고 brief, 색상 선택, 참고자료 정책을 모아
            Brandlogy Design Pack 기반 Deck JSON을 생성합니다.
          </p>
        </div>
        <button className="ai-ppt-primary" type="button" onClick={() => goToStep("brief")}>
          <Sparkles size={17} />
          처음부터 입력
        </button>
      </header>

      <div className="ai-ppt-layout">
        <aside className="ai-ppt-steps" aria-label="AI PPT wizard steps">
          {steps.map((step, index) => (
            <button
              key={step.id}
              className={[
                "ai-ppt-step",
                currentStep === step.id ? "active" : "",
                index < currentStepIndex ? "done" : ""
              ].join(" ")}
              type="button"
              onClick={() => goToStep(step.id)}
            >
              <span>{index < currentStepIndex ? <Check size={14} /> : index + 1}</span>
              <strong>{step.label}</strong>
            </button>
          ))}
        </aside>

        <main className="ai-ppt-workspace">
          <section className="ai-ppt-panel">
            {currentStep === "brief" ? (
              <BriefStep form={form} onChange={updateForm} />
            ) : null}
            {currentStep === "style" ? (
              <StyleStep form={form} onChange={updateForm} />
            ) : null}
            {currentStep === "color" ? (
              <ColorStep
                isLoading={isLoadingColors}
                options={paletteOptions}
                selectedPaletteId={selectedPalette.optionId}
                onRefresh={loadColorOptions}
                onSelect={setSelectedPaletteId}
              />
            ) : null}
            {currentStep === "references" ? (
              <ReferencesStep
                files={referenceFiles}
                form={form}
                onChange={updateForm}
                onFilesChange={setReferenceFiles}
              />
            ) : null}
            {currentStep === "review" ? (
              <ReviewStep
                payload={payloadPreview}
                referenceFiles={referenceFiles}
                selectedPalette={selectedPalette}
              />
            ) : null}
            {currentStep === "preview" ? (
              <PreviewStep
                job={job}
                payload={payloadPreview}
                selectedPalette={selectedPalette}
              />
            ) : null}
            {error ? <p className="ai-ppt-error">{error}</p> : null}
            {status ? <p className="ai-ppt-status">{status}</p> : null}
          </section>

          <aside className="ai-ppt-live-preview">
            <LivePreview payload={payloadPreview} selectedPalette={selectedPalette} />
          </aside>
        </main>
      </div>

      <footer className="ai-ppt-footer">
        <button
          className="ai-ppt-secondary"
          disabled={currentStepIndex === 0 || isGenerating}
          type="button"
          onClick={() => goToStep(steps[Math.max(currentStepIndex - 1, 0)].id)}
        >
          <ChevronLeft size={17} />
          이전
        </button>
        <button
          className="ai-ppt-primary"
          disabled={currentStep === "preview" || isGenerating}
          type="button"
          onClick={goNext}
        >
          {isGenerating ? (
            <>
              <Play size={17} />
              생성 중
            </>
          ) : currentStep === "review" ? (
            <>
              <Play size={17} />
              Deck JSON 생성
            </>
          ) : (
            <>
              다음
              <ChevronRight size={17} />
            </>
          )}
        </button>
      </footer>
    </section>
  );
}

function BriefStep(props: {
  form: AiPptWizardState;
  onChange: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) => void;
}) {
  return (
    <>
      <PanelHeading
        kicker="1. Brief"
        title="발표 상황과 청중을 먼저 고정"
      />
      <div className="ai-ppt-field-grid">
        <TextField label="발표 주제" value={props.form.topic} onChange={(value) => props.onChange("topic", value)} />
        <TextField label="발표 목적" value={props.form.purpose} onChange={(value) => props.onChange("purpose", value)} />
        <TextField label="발표 맥락" value={props.form.context} onChange={(value) => props.onChange("context", value)} />
        <TextField label="청중" value={props.form.audience} onChange={(value) => props.onChange("audience", value)} />
        <TextField label="발표 유형" value={props.form.presentationType} onChange={(value) => props.onChange("presentationType", value)} />
        <TextField label="성공 기준" value={props.form.successCriteria} onChange={(value) => props.onChange("successCriteria", value)} />
        <TextField label="발표 시간" value={props.form.duration} suffix="분" onChange={(value) => props.onChange("duration", value)} />
        <TextField label="슬라이드 수" value={props.form.slides} suffix="장" onChange={(value) => props.onChange("slides", value)} />
      </div>
    </>
  );
}

function StyleStep(props: {
  form: AiPptWizardState;
  onChange: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) => void;
}) {
  const tones: Tone[] = ["professional", "friendly", "confident", "concise"];
  return (
    <>
      <PanelHeading
        kicker="2. Style"
        title="Brandlogy Design Pack에 얹을 톤 선택"
      />
      <div className="ai-ppt-tone-grid">
        {tones.map((tone) => (
          <button
            key={tone}
            className={props.form.tone === tone ? "selected" : ""}
            type="button"
            onClick={() => props.onChange("tone", tone)}
          >
            {tone}
          </button>
        ))}
      </div>
      <label className="ai-ppt-textarea">
        <span>원하는 색감이나 분위기</span>
        <textarea
          value={props.form.colorMood}
          onChange={(event) => props.onChange("colorMood", event.target.value)}
        />
      </label>
    </>
  );
}

function ColorStep(props: {
  isLoading: boolean;
  options: PaletteOption[];
  selectedPaletteId: string;
  onRefresh: () => void;
  onSelect: (paletteId: string) => void;
}) {
  return (
    <>
      <PanelHeading
        kicker="3. Color"
        title="색상 후보 3개와 미니 슬라이드 preview"
      />
      <div className="ai-ppt-result-toolbar">
        <span>{props.options.length} palettes ready</span>
        <button disabled={props.isLoading} type="button" onClick={props.onRefresh}>
          <Palette size={16} />
          {props.isLoading ? "생성 중" : "색상 후보 다시 생성"}
        </button>
      </div>
      <div className="ai-ppt-palette-grid">
        {props.options.map((option) => (
          <button
            key={option.optionId}
            className={props.selectedPaletteId === option.optionId ? "selected" : ""}
            type="button"
            onClick={() => props.onSelect(option.optionId)}
          >
            <MiniSlide palette={option.palette} />
            <strong>{option.name}</strong>
            <span>{option.rationale}</span>
            <ColorSwatches palette={option.palette} />
          </button>
        ))}
      </div>
    </>
  );
}

function ReferencesStep(props: {
  files: File[];
  form: AiPptWizardState;
  onChange: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) => void;
  onFilesChange: (files: File[]) => void;
}) {
  return (
    <>
      <PanelHeading
        kicker="4. References"
        title="참고자료 사용 정책 선택"
      />
      <label className="ai-ppt-reference-drop">
        <Paperclip size={28} />
        <strong>
          {props.files.length
            ? `${props.files.length}개 파일 선택됨`
            : "PDF, PPTX, DOCX, 이미지 파일 첨부"}
        </strong>
        <span>1차에서는 참고자료 파일 ID를 생성 요청에 연결합니다.</span>
        <input
          multiple
          type="file"
          onChange={(event) => props.onFilesChange(filesFromEvent(event))}
        />
      </label>
      <div className="ai-ppt-choice-list">
        {[
          ["topic-only", "입력한 주제 중심"],
          ["references-first", "참고자료 우선"],
          ["references-only", "참고자료만 사용"]
        ].map(([value, label]) => (
          <button
            key={value}
            className={props.form.referencePolicy === value ? "selected" : ""}
            type="button"
            onClick={() =>
              props.onChange("referencePolicy", value as ReferencePolicy)
            }
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

function ReviewStep(props: {
  payload: GenerateDeckRequest;
  referenceFiles: File[];
  selectedPalette: PaletteOption;
}) {
  return (
    <>
      <PanelHeading
        kicker="5. Review"
        title="설문 결과가 생성 payload로 컴파일된 모습"
      />
      <div className="ai-ppt-review-grid">
        <SummaryCard icon={<FileText size={18} />} title="Brief">
          <p>{props.payload.topic}</p>
          <span>{props.payload.brief?.audienceText}</span>
        </SummaryCard>
        <SummaryCard icon={<Palette size={18} />} title="Session Design Pack">
          <p>{stylePackId} + {props.selectedPalette.name}</p>
          <span>{props.payload.designPrompt}</span>
        </SummaryCard>
        <SummaryCard icon={<Layers3 size={18} />} title="References">
          <p>{props.payload.brief?.referencePolicy}</p>
          <span>{props.referenceFiles.length} files selected</span>
        </SummaryCard>
      </div>
      <pre className="ai-ppt-payload">{JSON.stringify(props.payload, null, 2)}</pre>
    </>
  );
}

function PreviewStep(props: {
  job: Job | null;
  payload: GenerateDeckRequest;
  selectedPalette: PaletteOption;
}) {
  return (
    <>
      <PanelHeading
        kicker="Generated Deck"
        title="Deck JSON 생성 후 에디터에서 수정"
      />
      <div className="ai-ppt-result-toolbar">
        <span>{props.job?.status ?? "ready"}</span>
        <span>{props.payload.slideCountRange.min} slides</span>
        <button type="button">
          <ArrowDownToLine size={16} />
          PPTX export
        </button>
      </div>
      <div className="ai-ppt-slide-grid">
        {["Cover", "Why change", "Design Pack", "Pipeline"].map((title, index) => (
          <article key={title}>
            <MiniSlide palette={props.selectedPalette.palette} dense={index > 0} />
            <strong>{index + 1}. {title}</strong>
            <span>{index === 0 ? props.payload.topic : generationStages[index]}</span>
          </article>
        ))}
      </div>
    </>
  );
}

function LivePreview(props: {
  payload: GenerateDeckRequest;
  selectedPalette: PaletteOption;
}) {
  return (
    <div className="ai-ppt-preview-card">
      <div className="ai-ppt-preview-top">
        <span>Live Preview</span>
        <strong>{props.selectedPalette.name}</strong>
      </div>
      <MiniSlide palette={props.selectedPalette.palette} />
      <div className="ai-ppt-pipeline">
        {generationStages.map((stage, index) => (
          <div key={stage}>
            <span>{index + 1}</span>
            <p>{stage}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniSlide(props: { dense?: boolean; palette: Required<PaletteOverride> }) {
  const { palette } = props;
  return (
    <div
      className="ai-ppt-mini-slide"
      style={{
        background: palette.background,
        color: palette.text,
        borderColor: palette.border
      }}
    >
      <i style={{ background: palette.primary }} />
      <strong>Deck JSON first</strong>
      <p>Brief + Design Pack + paletteOverride</p>
      <div>
        <span style={{ background: palette.accentColor }} />
        <span style={{ background: palette.primary }} />
        <span style={{ background: palette.secondary }} />
      </div>
      {props.dense ? <em>chart / table / card zone</em> : null}
    </div>
  );
}

function ColorSwatches(props: { palette: Required<PaletteOverride> }) {
  return (
    <div className="ai-ppt-swatches">
      {[props.palette.primary, props.palette.secondary, props.palette.accentColor].map(
        (color) => (
          <i key={color} style={{ background: color }} />
        )
      )}
    </div>
  );
}

function PanelHeading(props: { kicker: string; title: string }) {
  return (
    <header className="ai-ppt-panel-heading">
      <span>{props.kicker}</span>
      <h2>{props.title}</h2>
    </header>
  );
}

function SummaryCard(props: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <article className="ai-ppt-summary-card">
      <div>{props.icon}</div>
      <strong>{props.title}</strong>
      {props.children}
    </article>
  );
}

function TextField(props: {
  label: string;
  onChange: (value: string) => void;
  suffix?: string;
  value: string;
}) {
  return (
    <label className="ai-ppt-field">
      <span>{props.label}</span>
      <div>
        <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
        {props.suffix ? <em>{props.suffix}</em> : null}
      </div>
    </label>
  );
}

async function fetchDeckColorOptions(input: {
  colorMood: string;
  stylePackId: string;
  topic: string;
}): Promise<PaletteOption[]> {
  const response = await fetch("/api/v1/ai/deck-color-options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readResponseText(response, "색상 후보를 생성하지 못했습니다."));
  }
  const payload = (await response.json()) as DeckColorOptionsResponse;
  return payload.options.map((option) => ({
    optionId: option.optionId,
    name: option.name,
    rationale: option.rationale,
    palette: option.palette as Required<PaletteOverride>
  }));
}

async function pollJob(jobId: string): Promise<Job> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 300_000) {
    const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, "작업 상태를 확인하지 못했습니다."));
    }
    const payload = (await response.json()) as { job: Job } | Job;
    const job = "job" in payload ? payload.job : payload;
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    await delay(1200);
  }
  throw new Error("AI PPT 생성 시간이 초과되었습니다.");
}

function filesFromEvent(event: ChangeEvent<HTMLInputElement>) {
  return Array.from(event.target.files ?? []);
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getProjectTitle(topic: string) {
  return topic.trim() ? `${topic.trim()} 발표자료` : "AI PPT 발표자료";
}

function navigateToProject(projectId: string) {
  window.history.pushState({}, "", `/project/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function readResponseText(response: Response, fallback: string) {
  const text = await response.text();
  return text || fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
