import type {
  DeckColorOptionsResponse,
  GenerateDeckFontOption,
  GenerateDeckMediaPolicy,
  GenerateDeckRequest,
  GenerateDeckReferencePolicy,
  Job,
  PptAdvisorHistoryItem,
  PptAdvisorResponse,
  PptAdvisorSuggestion,
  ReferenceExtractionResult
} from "@orbit/shared";
import {
  pptAdvisorResponseSchema,
  recommendGenerateDeckFonts,
  referenceExtractionResultSchema,
  referenceExtractionStartResponseSchema
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
type ReferencePolicy = GenerateDeckReferencePolicy;
type MediaPolicy = GenerateDeckMediaPolicy;
type Tone = "professional" | "friendly" | "confident" | "concise";

type PaletteOverride = NonNullable<GenerateDeckRequest["design"]["paletteOverride"]>;
type ColorIntent = NonNullable<GenerateDeckRequest["design"]["colorIntent"]>;
type DesignConstraints = NonNullable<GenerateDeckRequest["design"]["constraints"]>;
type ForbiddenStyle = DesignConstraints["forbiddenStyles"][number];

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
  fontMood: string;
  mediaPolicy: MediaPolicy;
  referencePolicy: ReferencePolicy;
};

export type AiPptAdvisorSuggestion = PptAdvisorSuggestion;

type ReferenceGrounding = Pick<
  GenerateDeckRequest,
  "referenceContext" | "referenceKeywords"
>;

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
  slides: "",
  tone: "professional",
  colorMood: "전문가스럽고 차분한 파란색, Brandlogy다운 포인트 컬러",
  fontMood: "professional trustworthy Korean sans font",
  mediaPolicy: "minimal",
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
  referenceFileIds: string[] = [],
  selectedFont = recommendGenerateDeckFonts(fontSource(state))[0],
  referenceGrounding: ReferenceGrounding = {
    referenceContext: [],
    referenceKeywords: []
  }
): GenerateDeckRequest {
  const durationMinutes = parsePositiveInteger(state.duration, 10);
  const slideCountRange = resolveSlideCountRange(state);
  const colorIntent = resolveColorIntent(state);
  const constraints = resolveDesignConstraints(state);
  const fontOverride = fontOverrideFromOption(selectedFont);

  return {
    generationMode: "design-pack",
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
      `font=${selectedFont.name}`,
      `colorIntent=${colorIntent.mood}/${colorIntent.preferredHue}`,
      `mediaPolicy=${state.mediaPolicy}`,
      `base=${stylePackId}`,
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
    slideCountRange,
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
      mediaPolicy: state.mediaPolicy,
      layoutDiversity: "varied",
      colorIntent,
      constraints,
      paletteOverride: paletteOption.palette,
      fontOverride,
      referencePolicy: state.referencePolicy
    },
    visualPlanPolicy: {
      mediaPolicy: state.mediaPolicy
    },
    referencePolicy: state.referencePolicy,
    referenceFileIds,
    references: referenceFileIds.map((fileId) => ({ fileId })),
    designReferences: [],
    referenceKeywords: referenceGrounding.referenceKeywords,
    referenceContext: referenceGrounding.referenceContext
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
  if (state.slides.trim() && parsePositiveInteger(state.slides, 0) < 1) {
    return "슬라이드 수는 1장 이상이어야 합니다.";
  }
  if (state.referencePolicy === "references-only" && referenceFiles.length === 0) {
    return "참고자료만으로 구성하려면 파일을 1개 이상 첨부하세요.";
  }
  return "";
}

export function buildAiPptAdvisorSuggestions(
  state: AiPptWizardState
): AiPptAdvisorSuggestion[] {
  const suggestions: AiPptAdvisorSuggestion[] = [];
  const recommendedSlideCount = deriveSlideCountFromState(state);
  const explicitSlideCount = parsePositiveInteger(state.slides, 0);

  if (
    explicitSlideCount > 0 &&
    (explicitSlideCount < Math.max(1, recommendedSlideCount - 2) ||
      explicitSlideCount > recommendedSlideCount + 3)
  ) {
    suggestions.push({
      field: "slides",
      label: `${parsePositiveInteger(state.duration, 10)}분 발표 ${recommendedSlideCount}장 권장`,
      reason: "발표 톤과 청중 참여도를 기준으로 장수가 너무 적거나 많으면 대본 분량과 흐름이 흔들릴 수 있습니다.",
      value: recommendedSlideCount
    });
  } else if (parsePositiveInteger(state.duration, 10) <= 3 && !state.slides.trim()) {
    suggestions.push({
      field: "slides",
      label: "3분 발표용 4장 구성",
      reason: "짧은 발표는 표지, 문제, 해결, 요약으로 압축하면 안정적입니다.",
      value: 4
    });
  }
  if (!state.fontMood.trim()) {
    suggestions.push({
      field: "fontMood",
      label: "신뢰감 있는 한글 고딕",
      reason: "폰트 요청이 비어 있으면 전문적인 고딕 계열을 기본 추천합니다.",
      value: "professional trustworthy Korean sans font"
    });
  }
  return suggestions.slice(0, 3);
}

export function AiPptMockupPage() {
  const [currentStep, setCurrentStep] = useState<StepId>("brief");
  const [form, setForm] = useState(initialState);
  const [paletteOptions, setPaletteOptions] = useState(fallbackPaletteOptions);
  const [selectedPaletteId, setSelectedPaletteId] = useState(
    fallbackPaletteOptions[0].optionId
  );
  const [selectedFontId, setSelectedFontId] = useState(
    recommendGenerateDeckFonts(initialState.fontMood)[0].fontId
  );
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [isLoadingColors, setIsLoadingColors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const colorRequestKey = [
    form.topic,
    form.purpose,
    form.audience,
    form.tone,
    form.colorMood
  ].join("|");
  const loadedColorRequestKey = useRef("");
  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);
  const selectedPalette =
    paletteOptions.find((palette) => palette.optionId === selectedPaletteId) ??
    paletteOptions[0];
  const fontOptions = useMemo(
    () => recommendGenerateDeckFonts(fontSource(form)),
    [form.fontMood, form.colorMood, form.tone]
  );
  const selectedFont =
    fontOptions.find((font) => font.fontId === selectedFontId) ?? fontOptions[0];
  const payloadPreview = useMemo(
    () => buildAiPptGenerateDeckPayload(form, selectedPalette, [], selectedFont),
    [form, selectedPalette, selectedFont]
  );

  useEffect(() => {
    if (fontOptions.some((font) => font.fontId === selectedFontId)) return;
    setSelectedFontId(fontOptions[0].fontId);
  }, [fontOptions, selectedFontId]);

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
        stylePackId,
        colorIntent: resolveColorIntent(form),
        constraints: resolveDesignConstraints(form)
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

      let referenceGrounding: ReferenceGrounding = {
        referenceContext: [],
        referenceKeywords: []
      };
      if (
        referenceFileIds.length > 0 &&
        !["topic-only", "user-input-only"].includes(form.referencePolicy)
      ) {
        setStatus("참고자료 추출 job 시작 중...");
        const extractionJob = await startReferenceExtraction(
          project.projectId,
          referenceFileIds
        );
        setJob(extractionJob);
        setStatus("참고자료 분석 중...");
        const extractionCompleted = await pollJob(extractionJob.jobId);
        setJob(extractionCompleted);

        if (extractionCompleted.status === "failed") {
          if (form.referencePolicy !== "research-first") {
            throw new Error(
              extractionCompleted.error?.message || extractionCompleted.message
            );
          }
        } else {
          const extractionResult = referenceExtractionResultSchema.parse(
            extractionCompleted.result
          );
          const referenceError = getReferenceExtractionValidationMessage(
            form.referencePolicy,
            referenceFileIds,
            extractionResult
          );
          if (referenceError) throw new Error(referenceError);
          referenceGrounding = buildReferenceGrounding(extractionResult);
        }
      }

      setStatus("Deck JSON 생성 job 시작 중...");
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(project.projectId)}/jobs/generate-deck`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            buildAiPptGenerateDeckPayload(
              form,
              selectedPalette,
              referenceFileIds,
              selectedFont,
              referenceGrounding
            )
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
        toAiPptUserErrorMessage(
          submitError instanceof Error ? submitError.message : "",
          "AI PPT 생성에 실패했습니다."
        )
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
              <StyleStep
                fontOptions={fontOptions}
                form={form}
                onChange={updateForm}
                onFontSelect={setSelectedFontId}
                selectedFontId={selectedFont.fontId}
              />
            ) : null}
            {currentStep === "color" ? (
              <ColorStep
                selectedFont={selectedFont}
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
                selectedFont={selectedFont}
                selectedPalette={selectedPalette}
              />
            ) : null}
            {currentStep === "preview" ? (
              <PreviewStep
                job={job}
                payload={payloadPreview}
                selectedFont={selectedFont}
                selectedPalette={selectedPalette}
              />
            ) : null}
            {error ? <p className="ai-ppt-error">{error}</p> : null}
            {status ? <p className="ai-ppt-status">{status}</p> : null}
          </section>

          <aside className="ai-ppt-live-preview">
            <LivePreview
              payload={payloadPreview}
              selectedFont={selectedFont}
              selectedPalette={selectedPalette}
            />
            <AdvisorPanel form={form} onApply={updateForm} />
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
  fontOptions: GenerateDeckFontOption[];
  form: AiPptWizardState;
  onChange: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) => void;
  onFontSelect: (fontId: string) => void;
  selectedFontId: string;
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
      <label className="ai-ppt-textarea">
        <span>Font mood</span>
        <textarea
          value={props.form.fontMood}
          onChange={(event) => props.onChange("fontMood", event.target.value)}
        />
      </label>
      <div className="ai-ppt-font-grid">
        {props.fontOptions.map((font) => (
          <button
            key={font.fontId}
            className={props.selectedFontId === font.fontId ? "selected" : ""}
            type="button"
            onClick={() => props.onFontSelect(font.fontId)}
          >
            <strong style={{ fontFamily: font.headingFontFamily }}>
              {font.name}
            </strong>
            <span style={{ fontFamily: font.bodyFontFamily }}>
              Brandlogy 발표 자료
            </span>
            <small>{font.rationale}</small>
            <em>{font.license}</em>
          </button>
        ))}
      </div>
    </>
  );
}

function ColorStep(props: {
  isLoading: boolean;
  options: PaletteOption[];
  selectedFont: GenerateDeckFontOption;
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
            <MiniSlide font={props.selectedFont} palette={option.palette} />
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
          ["minimal", "이미지 최소화"],
          ["provided-only", "첨부 이미지만"],
          ["public-assets", "공개 이미지 구조"],
          ["ai-generated", "AI 이미지 구조"]
        ].map(([value, label]) => (
          <button
            key={value}
            className={props.form.mediaPolicy === value ? "selected" : ""}
            type="button"
            onClick={() => props.onChange("mediaPolicy", value as MediaPolicy)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ai-ppt-choice-list">
        {[
          ["user-input-only", "사용자 입력만"],
          ["references-first", "참고자료 우선"],
          ["references-only", "참고자료만 사용"],
          ["research-first", "웹 리서치 구조"]
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
  selectedFont: GenerateDeckFontOption;
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
          <span>{props.selectedFont.name}</span>
          <span>{props.payload.designPrompt}</span>
        </SummaryCard>
        <SummaryCard icon={<Layers3 size={18} />} title="References">
          <p>{props.payload.brief?.referencePolicy}</p>
          <span>{props.payload.design.mediaPolicy}</span>
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
  selectedFont: GenerateDeckFontOption;
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
            <MiniSlide
              dense={index > 0}
              font={props.selectedFont}
              palette={props.selectedPalette.palette}
            />
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
  selectedFont: GenerateDeckFontOption;
  selectedPalette: PaletteOption;
}) {
  return (
    <div className="ai-ppt-preview-card">
      <div className="ai-ppt-preview-top">
        <span>Live Preview</span>
        <strong>{props.selectedPalette.name} · {props.selectedFont.name}</strong>
      </div>
      <MiniSlide font={props.selectedFont} palette={props.selectedPalette.palette} />
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

function AdvisorPanel(props: {
  form: AiPptWizardState;
  onApply: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) => void;
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<PptAdvisorHistoryItem[]>([]);
  const [answer, setAnswer] = useState(
    "현재 brief 기준으로 적용 가능한 제안을 아래에 정리했습니다."
  );
  const [suggestions, setSuggestions] = useState<AiPptAdvisorSuggestion[]>(() =>
    buildAiPptAdvisorSuggestions(props.form)
  );
  const [isAsking, setIsAsking] = useState(false);

  async function askAdvisor() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isAsking) return;

    setIsAsking(true);
    try {
      const response = await requestPptAdvisor(
        props.form,
        trimmedQuestion,
        history.slice(-6)
      );
      setAnswer(response.answer);
      setSuggestions(response.suggestions);
      setHistory((current) =>
        [
          ...current,
          { role: "user", content: trimmedQuestion },
          { role: "assistant", content: response.answer }
        ].slice(-6) as PptAdvisorHistoryItem[]
      );
      setQuestion("");
    } catch {
      const fallbackAnswer = advisorResponse(trimmedQuestion, props.form);
      setAnswer(fallbackAnswer);
      setSuggestions(buildAiPptAdvisorSuggestions(props.form));
      setHistory((current) =>
        [
          ...current,
          { role: "user", content: trimmedQuestion },
          { role: "assistant", content: fallbackAnswer }
        ].slice(-6) as PptAdvisorHistoryItem[]
      );
    } finally {
      setIsAsking(false);
    }
  }

  function applySuggestion(suggestion: AiPptAdvisorSuggestion) {
    if (suggestion.field === "duration" || suggestion.field === "slides") {
      props.onApply(suggestion.field, String(suggestion.value));
    } else {
      props.onApply(suggestion.field, suggestion.value as never);
    }
    setSuggestions((current) => removeAppliedAdvisorSuggestion(current, suggestion));
  }

  return (
    <section className="ai-ppt-advisor">
      <div className="ai-ppt-preview-top">
        <span>Side AI</span>
        <strong>Decision helper</strong>
      </div>
      {history.length > 0 ? (
        <div className="ai-ppt-advisor-history" aria-live="polite">
          {history.map((message, index) => (
            <p key={`${message.role}-${index}`} data-role={message.role}>
              {message.content}
            </p>
          ))}
        </div>
      ) : null}
      <form
        className="ai-ppt-advisor-input"
        onSubmit={(event) => {
          event.preventDefault();
          void askAdvisor();
        }}
      >
        <label>
          <span>Ask</span>
          <textarea
            value={question}
            maxLength={1000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="폰트, 이미지 정책, 발표 시간에 대해 물어보기"
          />
        </label>
        <button
          className="ai-ppt-advisor-submit"
          type="submit"
          disabled={!question.trim() || isAsking}
        >
          <Sparkles size={16} />
          {isAsking ? "확인 중" : "질문"}
        </button>
      </form>
      <p className="ai-ppt-advisor-answer">{answer}</p>
      {suggestions.map((suggestion) => (
        <button
          className="ai-ppt-advisor-suggestion"
          key={`${suggestion.field}-${String(suggestion.value)}`}
          type="button"
          onClick={() => applySuggestion(suggestion)}
        >
          <strong>{suggestion.label}</strong>
          <span>{suggestion.reason}</span>
        </button>
      ))}
    </section>
  );
}

export function miniSlideFontStyles(
  font: Pick<
    GenerateDeckFontOption,
    "headingFontFamily" | "bodyFontFamily" | "fallbackFamily"
  >
) {
  const stack = (family: string) =>
    `"${family.replaceAll('"', "")}", ${font.fallbackFamily}, sans-serif`;
  return {
    heading: { fontFamily: stack(font.headingFontFamily) },
    body: { fontFamily: stack(font.bodyFontFamily) }
  };
}

function MiniSlide(props: {
  dense?: boolean;
  font?: GenerateDeckFontOption;
  palette: Required<PaletteOverride>;
}) {
  const { palette } = props;
  const fontStyles = props.font ? miniSlideFontStyles(props.font) : undefined;
  return (
    <div
      className={[
        "ai-ppt-mini-slide",
        props.dense ? "ai-ppt-mini-slide-dense" : "ai-ppt-mini-slide-cover"
      ].join(" ")}
      style={{
        background: palette.background,
        color: palette.text,
        borderColor: palette.border,
        ...fontStyles?.body
      }}
    >
      <i className="ai-ppt-mini-top-rule" style={{ background: palette.primary }} />
      <header className="ai-ppt-mini-section" style={fontStyles?.heading}>
        <span style={{ color: palette.primary }}>01</span>
        <b>발표 디자인</b>
      </header>
      {props.dense ? (
        <main className="ai-ppt-mini-body-recipe">
          {[palette.primary, palette.secondary, palette.accentColor].map((color, index) => (
            <section key={color} style={{ borderColor: palette.border }}>
              <i style={{ background: color }} />
              <strong style={fontStyles?.heading}>
                {index === 0 ? "과정" : index === 1 ? "핵심" : "근거"}
              </strong>
              <p style={{ background: palette.muted }} />
            </section>
          ))}
        </main>
      ) : (
        <main className="ai-ppt-mini-cover-recipe">
          <section>
            <strong style={fontStyles?.heading}>핵심 메시지</strong>
            <p style={fontStyles?.body}>발표 흐름과 실행안</p>
          </section>
          <aside style={{ background: palette.muted, borderColor: palette.border }}>
            <i style={{ background: palette.primary }} />
            <span style={{ borderColor: palette.border }} />
            <span style={{ borderColor: palette.border }} />
            <span style={{ borderColor: palette.border }} />
          </aside>
        </main>
      )}
      <i className="ai-ppt-mini-bottom-rule" style={{ background: palette.secondary }} />
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
  colorIntent: ColorIntent;
  constraints: DesignConstraints;
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

export async function startReferenceExtraction(
  projectId: string,
  fileIds: string[]
): Promise<Job> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/references/extractions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fileIds })
    }
  );
  if (!response.ok) {
    throw new Error(
      await readResponseText(response, "참고자료 분석을 시작하지 못했습니다.")
    );
  }
  return referenceExtractionStartResponseSchema.parse(await response.json()).job;
}

export function buildReferenceGrounding(
  result: ReferenceExtractionResult
): ReferenceGrounding {
  const usableFiles = result.files.filter((file) => file.usable);
  const seenKeywords = new Set<string>();
  const referenceKeywords = usableFiles.flatMap((file) =>
    file.keywords.flatMap((keyword) => {
      const text = keyword.keyword.trim();
      const key = text.toLocaleLowerCase("ko-KR");
      if (!text || seenKeywords.has(key)) return [];
      seenKeywords.add(key);
      return [{ text }];
    })
  );

  return {
    referenceKeywords,
    referenceContext: usableFiles.map((file) => ({
      fileId: file.fileId,
      title: file.fileName,
      content: file.cleanedText.trim() || file.rawText.trim()
    }))
  };
}

export function getReferenceExtractionValidationMessage(
  policy: ReferencePolicy,
  expectedFileIds: string[],
  result: ReferenceExtractionResult
): string {
  const filesById = new Map(result.files.map((file) => [file.fileId, file]));
  const usableCount = expectedFileIds.filter(
    (fileId) => filesById.get(fileId)?.usable
  ).length;

  if (policy === "references-only" && usableCount !== expectedFileIds.length) {
    return "참고자료만으로 구성하려면 첨부한 모든 파일에서 텍스트를 추출할 수 있어야 합니다.";
  }
  if (policy === "references-first" && usableCount === 0) {
    return "참고자료 우선 구성에는 사용할 수 있는 첨부자료가 1개 이상 필요합니다.";
  }
  return "";
}

export async function pollJob(jobId: string): Promise<Job> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 300_000) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
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

function resolveSlideCountRange(state: AiPptWizardState) {
  const requested = parsePositiveInteger(state.slides, 0);
  if (requested > 0) {
    return { min: Math.max(1, requested - 2), max: Math.min(20, requested + 2) };
  }
  const derived = deriveSlideCountFromState(state);
  return { min: derived, max: derived };
}

function deriveSlideCountFromState(state: AiPptWizardState) {
  return deriveSlideCount(
    parsePositiveInteger(state.duration, 10),
    presentationSlideRatioFor(state)
  );
}

function deriveSlideCount(durationMinutes: number, slidesPerMinute: number) {
  return Math.min(14, Math.max(4, Math.round(durationMinutes * slidesPerMinute)));
}

function presentationSlideRatioFor(state: AiPptWizardState) {
  const source = [
    state.purpose,
    state.context,
    state.audience,
    state.presentationType,
    state.successCriteria,
    state.fontMood,
    state.colorMood
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");

  if (
    state.tone === "friendly" ||
    hasAny(source, [
      "friendly",
      "funny",
      "easy",
      "casual",
      "discussion",
      "workshop",
      "토의",
      "토론",
      "자유롭게",
      "쉽게",
      "재미"
    ])
  ) {
    return 1;
  }
  if (state.tone === "concise") return 0.65;
  if (state.tone === "confident") return 0.8;
  return 0.75;
}

function resolveDesignConstraints(state: AiPptWizardState): DesignConstraints {
  const source = colorSource(state);
  return {
    canvasBackground: hasAny(source, ["white", "흰", "화이트", "백색"])
      ? "white"
      : "auto",
    forbiddenStyles: resolveForbiddenStyles(source)
  };
}

function resolveColorIntent(state: AiPptWizardState): ColorIntent {
  const source = colorSource(state);
  const constraints = resolveDesignConstraints(state);

  return {
    mood: resolveMood(source),
    trustLevel: hasAny(source, ["trust", "reliable", "신뢰", "믿음", "안정"])
      ? "high"
      : "medium",
    energyLevel: hasAny(source, ["energetic", "bold", "launch", "강렬", "활기", "역동"])
      ? "high"
      : hasAny(source, ["calm", "차분", "안정"])
        ? "low"
        : "medium",
    formality: hasAny(source, ["executive", "formal", "임원", "격식", "공식"])
      ? "formal"
      : hasAny(source, ["friendly", "casual", "친근", "캐주얼"])
        ? "casual"
        : "professional",
    preferredHue: resolvePreferredHue(source),
    backgroundPreference: constraints.canvasBackground === "white" ? "white" : "auto",
    forbiddenStyles: constraints.forbiddenStyles
  };
}

function resolveMood(source: string): ColorIntent["mood"] {
  if (hasAny(source, ["trust", "reliable", "신뢰", "믿음"])) return "trustworthy";
  if (hasAny(source, ["resort", "beach", "ocean", "vacation", "휴양", "바다"])) {
    return "relaxed";
  }
  if (hasAny(source, ["premium", "luxury", "고급", "프리미엄"])) return "premium";
  if (hasAny(source, ["energetic", "bold", "강렬", "활기"])) return "energetic";
  if (hasAny(source, ["calm", "차분", "안정"])) return "calm";
  if (hasAny(source, ["creative", "ai", "창의", "인공지능"])) return "creative";
  return "auto";
}

function resolvePreferredHue(source: string): ColorIntent["preferredHue"] {
  if (hasAny(source, ["violet", "purple", "보라", "바이올렛", "퍼플"])) return "violet";
  if (hasAny(source, ["blue", "ocean", "바다", "파랑", "파란", "블루"])) return "blue";
  if (hasAny(source, ["teal", "민트", "청록"])) return "teal";
  if (hasAny(source, ["green", "초록", "그린"])) return "green";
  if (hasAny(source, ["pink", "핑크"])) return "pink";
  if (hasAny(source, ["orange", "오렌지", "주황"])) return "orange";
  if (hasAny(source, ["red", "빨강", "레드"])) return "red";
  if (hasAny(source, ["yellow", "노랑", "옐로"])) return "yellow";
  if (hasAny(source, ["black", "gray", "grey", "slate", "모노", "회색", "무채색"])) {
    return "slate";
  }
  if (hasAny(source, ["trust", "reliable", "신뢰", "믿음"])) return "blue";
  return "auto";
}

function resolveForbiddenStyles(source: string): ForbiddenStyle[] {
  const styles: ForbiddenStyle[] = [];
  if (
    hasAny(source, [
      "no gradient",
      "without gradient",
      "그라데이션 금지",
      "그라데이션 제외"
    ])
  ) {
    styles.push("gradient");
  }
  if (
    hasAny(source, [
      "no pastel",
      "without pastel",
      "파스텔 금지",
      "파스텔톤 금지",
      "파스텔 제외"
    ])
  ) {
    styles.push("pastel");
  }
  return styles;
}

function colorSource(state: AiPptWizardState) {
  return [
    state.topic,
    state.purpose,
    state.context,
    state.audience,
    state.presentationType,
    state.successCriteria,
    state.tone,
    state.colorMood
  ]
    .join(" ")
    .toLowerCase();
}

function fontSource(state: AiPptWizardState) {
  return [
    state.topic,
    state.presentationType,
    state.audience,
    state.tone,
    state.fontMood
  ].join(" ");
}

function fontOverrideFromOption(option: GenerateDeckFontOption) {
  return {
    fontId: option.fontId,
    name: option.name,
    headingFontFamily: option.headingFontFamily,
    bodyFontFamily: option.bodyFontFamily,
    fallbackFamily: option.fallbackFamily,
    weights: option.weights,
    supportsKorean: option.supportsKorean,
    pptxEmbeddable: option.pptxEmbeddable,
    moodTags: option.moodTags,
    license: option.license,
    sourceUrl: option.sourceUrl,
    recommendedTitleSize: option.recommendedTitleSize,
    recommendedBodySize: option.recommendedBodySize,
    lineHeight: option.lineHeight,
    widthFactor: option.widthFactor,
    overflowRisk: option.overflowRisk
  };
}

export async function requestPptAdvisor(
  state: AiPptWizardState,
  question: string,
  history: PptAdvisorHistoryItem[] = []
): Promise<PptAdvisorResponse> {
  const explicitSlides = parsePositiveInteger(state.slides, 0);
  const response = await fetch("/api/v1/ai/ppt-advisor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: question.trim(),
      brief: {
        topic: state.topic.trim(),
        purpose: state.purpose.trim(),
        presentationContext: state.context.trim(),
        audienceText: state.audience.trim(),
        presentationType: state.presentationType.trim(),
        successCriteria: state.successCriteria.trim(),
        duration: parsePositiveInteger(state.duration, 10),
        ...(explicitSlides > 0 ? { slides: explicitSlides } : {}),
        tone: state.tone
      },
      design: {
        colorMood: state.colorMood.trim(),
        fontMood: state.fontMood.trim(),
        mediaPolicy: state.mediaPolicy,
        referencePolicy: state.referencePolicy
      },
      history: history.slice(-6)
    }),
    signal: AbortSignal.timeout(16_000)
  });
  if (!response.ok) {
    throw new Error(await readResponseText(response, "Side AI 응답을 불러오지 못했습니다."));
  }
  return pptAdvisorResponseSchema.parse(await response.json());
}

function advisorResponse(question: string, state: AiPptWizardState) {
  if (!question.trim()) {
    return "현재 brief 기준으로 적용 가능한 제안을 아래에 정리했습니다.";
  }
  if (hasAny(question.toLocaleLowerCase("ko-KR"), ["font", "폰트", "글꼴"])) {
    return `${state.fontMood || "전문적인 한글 고딕"} 기준으로 후보 3개를 다시 추천합니다. 마음에 드는 카드를 선택하면 payload에 반영됩니다.`;
  }
  if (hasAny(question.toLocaleLowerCase("ko-KR"), ["image", "이미지", "사진"])) {
    return `현재 이미지 정책은 ${state.mediaPolicy}입니다. ai-generated를 선택하면 2차에서는 실제 이미지 파일을 만들지 않고 Deck JSON에 이미지 계획, placeholder, 교체 근거를 남깁니다.`;
  }
  return "발표 시간, 청중, 참고자료 정책을 기준으로 적용 가능한 제안을 아래에 표시했습니다.";
}

function hasAny(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword.toLowerCase()));
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
  return toAiPptUserErrorMessage(text, fallback);
}

export function removeAppliedAdvisorSuggestion(
  suggestions: AiPptAdvisorSuggestion[],
  applied: AiPptAdvisorSuggestion
) {
  return suggestions.filter(
    (suggestion) =>
      suggestion.field !== applied.field || suggestion.value !== applied.value
  );
}

export function toAiPptUserErrorMessage(message: string, fallback = "AI PPT 생성에 실패했습니다.") {
  let detail = message.trim();
  if (detail.startsWith("{")) {
    try {
      const parsed = JSON.parse(detail) as { detail?: unknown; message?: unknown };
      const candidate = parsed.detail ?? parsed.message;
      if (typeof candidate === "string") detail = candidate.trim();
    } catch {
      // Keep the original server text when it is not valid JSON.
    }
  }
  if (
    detail.includes("WEB_RESEARCH_QUALITY_FAILED") ||
    detail.includes("research-first requires at least two distinct URL citations")
  ) {
    return "주제와 직접 관련된 공식 출처와 독립 출처를 충분히 확인하지 못했습니다. 주제명을 더 구체적으로 입력하거나 잠시 후 다시 시도해 주세요.";
  }
  return detail || fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
