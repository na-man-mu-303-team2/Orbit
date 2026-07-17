import type {
  DeckColorCustomizationResponse,
  GenerateDeckFontOption,
  GenerateDeckRequest,
  Job,
  StoryPlanReviewResponse,
} from "@orbit/shared";
import { recommendGenerateDeckFonts } from "@orbit/shared";
import {
  IconCheck,
  IconChevronLeft,
  IconFileText,
  IconPaperclip,
  IconPlayerPlay,
  IconSparkles,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import type { DragEvent, Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  deleteProject,
  uploadProjectAsset,
} from "../projects/ProjectAssetWorkspace";
import {
  clearStoryApprovalDraft,
  readStoryApprovalDraft,
  requestStoryPlan,
  requestStoryPlanMutation,
  storyGenerationPath,
  storyPlanPath,
} from "./story-plan-api";
import "./ai-ppt-mockup.css";

type Tone = "professional" | "friendly" | "confident" | "concise";
type PaletteOverride = NonNullable<
  GenerateDeckRequest["design"]["paletteOverride"]
>;

export type PaletteOption = {
  optionId: string;
  name: string;
  rationale: string;
  palette: Required<PaletteOverride>;
};

export type AiPptWizardState = {
  topic: string;
  content: string;
  audience: string;
  tone: Tone;
};

const stylePackId = "brandlogy-modern";
const defaultFontMood = "professional trustworthy Korean sans font";
const flowSteps = ["내용 입력", "Story Review", "Style & Color"];
const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "professional", label: "전문적인" },
  { value: "friendly", label: "친근한" },
  { value: "confident", label: "자신감 있는" },
  { value: "concise", label: "간결한" },
];

export const defaultPaletteOptions: PaletteOption[] = [
  {
    optionId: "brandlogy-blue",
    name: "ORBIT Lilac",
    rationale: "ORBIT의 Lilac과 Ink 대비를 사용하는 선명한 기본 팔레트입니다.",
    palette: {
      primary: "#6846D8",
      secondary: "#1F1D3D",
      background: "#F7F7F5",
      surface: "#FFFFFF",
      muted: "#F1ECFF",
      border: "#E6E6E6",
      text: "#090909",
      accentColor: "#C5B0F4",
    },
  },
  {
    optionId: "executive-slate",
    name: "이그제큐티브 슬레이트",
    rationale: "임원 의사결정 회의에 어울리는 절제된 고대비 팔레트입니다.",
    palette: {
      primary: "#334155",
      secondary: "#64748B",
      background: "#FFFFFF",
      surface: "#F8FAFC",
      muted: "#E2E8F0",
      border: "#CBD5E1",
      text: "#111827",
      accentColor: "#0891B2",
    },
  },
  {
    optionId: "modern-violet",
    name: "모던 바이올렛",
    rationale: "AI와 제품 발표에 어울리는 선명한 바이올렛 팔레트입니다.",
    palette: {
      primary: "#7C3AED",
      secondary: "#4F46E5",
      background: "#FAF5FF",
      surface: "#FFFFFF",
      muted: "#EDE9FE",
      border: "#DDD6FE",
      text: "#18181B",
      accentColor: "#EC4899",
    },
  },
  {
    optionId: "resort-blue",
    name: "리조트 블루",
    rationale: "여행과 휴양 주제에 어울리는 편안한 블루 팔레트입니다.",
    palette: {
      primary: "#0EA5E9",
      secondary: "#0369A1",
      background: "#F0F9FF",
      surface: "#FFFFFF",
      muted: "#E0F2FE",
      border: "#BAE6FD",
      text: "#0F172A",
      accentColor: "#F472B6",
    },
  },
  {
    optionId: "calm-green",
    name: "캄 그린",
    rationale: "교육과 지속가능성 주제에 어울리는 안정적인 팔레트입니다.",
    palette: {
      primary: "#059669",
      secondary: "#0F766E",
      background: "#F0FDF4",
      surface: "#FFFFFF",
      muted: "#DCFCE7",
      border: "#BBF7D0",
      text: "#052E16",
      accentColor: "#2563EB",
    },
  },
  {
    optionId: "energetic-coral",
    name: "에너제틱 코랄",
    rationale: "출시와 피치 발표에 어울리는 활기찬 팔레트입니다.",
    palette: {
      primary: "#F97316",
      secondary: "#DB2777",
      background: "#FFF7ED",
      surface: "#FFFFFF",
      muted: "#FFEDD5",
      border: "#FED7AA",
      text: "#111827",
      accentColor: "#2563EB",
    },
  },
  {
    optionId: "warm-amber",
    name: "웜 앰버",
    rationale: "따뜻하고 설득력 있는 이야기에 어울리는 앰버 팔레트입니다.",
    palette: {
      primary: "#D97706",
      secondary: "#92400E",
      background: "#FFFBEB",
      surface: "#FFFFFF",
      muted: "#FEF3C7",
      border: "#FDE68A",
      text: "#1C1917",
      accentColor: "#2563EB",
    },
  },
  {
    optionId: "editorial-rose",
    name: "에디토리얼 로즈",
    rationale: "콘텐츠와 브랜드 스토리에 어울리는 세련된 로즈 팔레트입니다.",
    palette: {
      primary: "#BE123C",
      secondary: "#9D174D",
      background: "#FFF1F2",
      surface: "#FFFFFF",
      muted: "#FFE4E6",
      border: "#FECDD3",
      text: "#1F1720",
      accentColor: "#0F766E",
    },
  },
  {
    optionId: "graphite-night",
    name: "그래파이트 나이트",
    rationale: "기술과 프리미엄 발표에 어울리는 어두운 고대비 팔레트입니다.",
    palette: {
      primary: "#38BDF8",
      secondary: "#A78BFA",
      background: "#0F172A",
      surface: "#1E293B",
      muted: "#334155",
      border: "#475569",
      text: "#F8FAFC",
      accentColor: "#F59E0B",
    },
  },
];

export const initialAiPptWizardState: AiPptWizardState = {
  topic: "",
  content: "",
  audience: "",
  tone: "professional",
};

export function mergeAiPptContentFormData(
  state: AiPptWizardState,
  formData: Pick<FormData, "get">,
) {
  const nextState = { ...state };
  for (const fieldName of ["topic", "content", "audience"] as const) {
    const value = formData.get(fieldName);
    if (typeof value === "string") nextState[fieldName] = value;
  }
  return nextState;
}

export function getAiPptWizardValidationMessage(state: AiPptWizardState) {
  if (!state.topic.trim()) return "발표 주제를 입력하세요.";
  if (!state.content.trim()) return "발표 내용을 입력하세요.";
  if (!state.audience.trim()) return "청중을 입력하세요.";
  return "";
}

export function buildAiPptGenerateDeckPayload(
  state: AiPptWizardState,
  paletteOption: PaletteOption,
  referenceFileIds: string[] = [],
  selectedFont = recommendGenerateDeckFonts(defaultFontMood)[0],
): GenerateDeckRequest {
  const referencePolicy =
    referenceFileIds.length > 0 ? "references-first" : "user-input-only";

  return {
    topic: state.topic.trim(),
    prompt: state.content.trim(),
    designPrompt: [
      `tone=${state.tone}`,
      `palette=${paletteOption.optionId}`,
      `font=${selectedFont.name}`,
      `mediaPolicy=minimal`,
      `base=${stylePackId}`,
    ].join("; "),
    brief: {
      audienceText: state.audience.trim(),
      durationMinutes: 10,
      referencePolicy,
    },
    targetDurationMinutes: 10,
    slideCountRange: { min: 5, max: 8 },
    template: "default",
    metadata: {
      audience: "general",
      purpose: "inform",
      tone: state.tone,
    },
    design: {
      stylePackId,
      visualRhythm: "clean",
      densityTarget: "medium",
      mediaPolicy: "minimal",
      layoutDiversity: "varied",
      paletteOverride: paletteOption.palette,
      fontOverride: fontOverrideFromOption(selectedFont),
      referencePolicy,
    },
    visualPlanPolicy: { mediaPolicy: "minimal" },
    referencePolicy,
    referenceFileIds,
    references: referenceFileIds.map((fileId) => ({ fileId })),
    referenceKeywords: [],
    referenceContext: [],
    coachingContext: {
      briefRef: { mode: "generic" },
      evaluatorLensRef: { lensId: "general-novice", revision: 1 },
    },
  };
}

export function AiPptMockupPage() {
  const [form, setForm] = useState(initialAiPptWizardState);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const contentFormRef = useRef<HTMLFormElement>(null);

  function updateForm<K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitGeneration() {
    const nextForm = contentFormRef.current
      ? mergeAiPptContentFormData(form, new FormData(contentFormRef.current))
      : form;
    setForm(nextForm);
    const validationMessage = getAiPptWizardValidationMessage(nextForm);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsGenerating(true);
    setError("");
    setStatus("프로젝트 생성 중...");
    let createdProjectId: string | null = null;
    let generationStarted = false;

    try {
      const project = await createProject(getProjectTitle(nextForm.topic));
      createdProjectId = project.projectId;
      const referenceFileIds: string[] = [];
      for (const file of referenceFiles) {
        setStatus(`${file.name} 업로드 중...`);
        const uploaded = await uploadProjectAsset(
          project.projectId,
          file,
          "reference-material",
        );
        referenceFileIds.push(uploaded.fileId);
      }

      setStatus("발표 스토리 구성 중...");
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(project.projectId)}/jobs/generate-deck`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            buildAiPptGenerateDeckPayload(
              nextForm,
              defaultPaletteOptions[0],
              referenceFileIds,
            ),
          ),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readResponseText(
            response,
            "AI PPT 생성을 시작하지 못했습니다.",
          ),
        );
      }

      const data = (await response.json()) as {
        job: Job;
        storyReviewRequired: boolean;
      };
      generationStarted = true;
      if (data.storyReviewRequired) {
        navigateToStoryPlan(project.projectId, data.job.jobId);
        return;
      }

      const completed = await pollJob(data.job.jobId, (job) => {
        setStatus(getAiPptGenerationStatus(job));
      });
      if (completed.status === "failed") {
        throw new Error(completed.error?.message || completed.message);
      }
      navigateToProject(project.projectId);
    } catch (submitError) {
      if (createdProjectId && !generationStarted) {
        await deleteProject(createdProjectId).catch(() => undefined);
      }
      setError(
        submitError instanceof Error
          ? submitError.message
          : "AI PPT 생성에 실패했습니다.",
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
          <span>AI PPT</span>
          <h1>발표 내용부터 빠르게 시작하세요</h1>
          <p>
            내용, 청중, 발표 톤과 참고자료를 입력하면 AI가 먼저 이야기 구성을
            제안합니다.
          </p>
        </div>
        <button
          className="ai-ppt-primary"
          type="button"
          onClick={() => {
            setForm(initialAiPptWizardState);
            setReferenceFiles([]);
            setError("");
          }}
        >
          <IconSparkles size={17} />
          처음부터 입력
        </button>
      </header>

      <div className="ai-ppt-layout">
        <WizardSteps activeIndex={0} />

        <main className="ai-ppt-workspace ai-ppt-workspace-single">
          <section className="ai-ppt-panel">
            <ContentStep
              files={referenceFiles}
              form={form}
              formRef={contentFormRef}
              onChange={updateForm}
              onFilesChange={setReferenceFiles}
            />
            {error ? (
              <p className="ai-ppt-error" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="ai-ppt-status" role="status">
                {status}
              </p>
            ) : null}
          </section>
        </main>
      </div>

      <footer className="ai-ppt-footer">
        <button className="ai-ppt-secondary" disabled type="button">
          <IconChevronLeft size={17} />
          이전
        </button>
        <button
          className="ai-ppt-primary"
          disabled={isGenerating}
          type="button"
          onClick={() => void submitGeneration()}
        >
          {isGenerating ? (
            <>
              <IconPlayerPlay size={17} /> 생성 중
            </>
          ) : (
            <>
              <IconPlayerPlay size={17} /> 스토리 만들기
            </>
          )}
        </button>
      </footer>
    </section>
  );
}

export function AiPptStyleColorPage(props: {
  jobId: string;
  projectId: string;
}) {
  const [story, setStory] = useState<StoryPlanReviewResponse | null>(null);
  const [selectedPaletteId, setSelectedPaletteId] = useState(
    defaultPaletteOptions[0].optionId,
  );
  const [selectedFontId, setSelectedFontId] = useState(
    recommendGenerateDeckFonts(defaultFontMood)[0].fontId,
  );
  const [customPalette, setCustomPalette] = useState<PaletteOption | null>(
    null,
  );
  const [palettePrompt, setPalettePrompt] = useState("");
  const [isCustomizingPalette, setIsCustomizingPalette] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("스타일 정보를 불러오는 중...");
  const [error, setError] = useState("");
  const paletteOptions = useMemo(
    () =>
      customPalette
        ? [...defaultPaletteOptions, customPalette]
        : defaultPaletteOptions,
    [customPalette],
  );
  const selectedPalette =
    paletteOptions.find((option) => option.optionId === selectedPaletteId) ??
    defaultPaletteOptions[0];
  const fontOptions = useMemo(
    () =>
      recommendGenerateDeckFonts(
        `${story?.styleContext?.topic ?? ""} ${story?.styleContext?.tone ?? "professional"} ${defaultFontMood}`,
      ),
    [story?.styleContext?.tone, story?.styleContext?.topic],
  );
  const selectedFont =
    fontOptions.find((font) => font.fontId === selectedFontId) ??
    fontOptions[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await requestStoryPlan(props.projectId, props.jobId);
        if (cancelled) return;
        setStory(next);
        if (next.status === "approved") {
          clearStoryApprovalDraft(props.projectId, props.jobId);
          navigateToPath(storyGenerationPath(next.projectId, next.jobId));
          return;
        }
        if (
          next.status !== "review-pending" ||
          !next.plan ||
          !next.styleContext
        ) {
          setError("확정된 스토리의 스타일 정보를 불러올 수 없습니다.");
        }
        setStatus("");
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "스타일 정보를 불러오지 못했습니다.",
          );
          setStatus("");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.jobId, props.projectId]);

  async function customizePalette() {
    const instruction = palettePrompt.trim();
    const styleContext = story?.styleContext;
    if (!instruction || !styleContext) {
      setError("원하는 색감이나 변경할 요소를 입력하세요.");
      return;
    }
    setIsCustomizingPalette(true);
    setError("");
    try {
      const response = await fetchDeckColorCustomization({
        topic: styleContext.topic,
        instruction,
        basePalette: selectedPalette.palette,
        stylePackId,
        tone: styleContext.tone,
      });
      const option = { ...response.option, optionId: "ai-custom" };
      setCustomPalette(option);
      setSelectedPaletteId(option.optionId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI 팔레트를 만들지 못했습니다. 현재 선택은 유지됩니다.",
      );
    } finally {
      setIsCustomizingPalette(false);
    }
  }

  async function approveAndGenerate() {
    if (!story?.plan || story.status !== "review-pending" || !selectedFont) {
      setError("스타일을 적용할 스토리 정보를 불러오지 못했습니다.");
      return;
    }
    setIsGenerating(true);
    setError("");
    setStatus("선택한 스타일을 적용하는 중...");
    try {
      const approvalDraft = readStoryApprovalDraft(
        props.projectId,
        props.jobId,
      );
      if (
        approvalDraft &&
        approvalDraft.expectedRevision !== story.plan.revision
      ) {
        throw new Error(
          "스토리 구성이 변경되었습니다. Story Review에서 다시 확인해 주세요.",
        );
      }
      const next = await requestStoryPlanMutation(
        props.projectId,
        props.jobId,
        "approve",
        {
          expectedRevision: story.plan.revision,
          ...(approvalDraft ? { slides: approvalDraft.slides } : {}),
          designSelection: {
            paletteOptionId: selectedPalette.optionId,
            paletteOverride: selectedPalette.palette,
            fontOverride: fontOverrideFromOption(selectedFont),
          },
        },
      );
      clearStoryApprovalDraft(props.projectId, props.jobId);
      setStory(next);
      navigateToPath(storyGenerationPath(next.projectId, next.jobId));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "AI PPT 생성에 실패했습니다.",
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
          <span>AI PPT</span>
          <h1>스토리에 어울리는 스타일을 선택하세요</h1>
          <p>컬러와 폰트를 선택하면 미리보기와 최종 슬라이드에 반영됩니다.</p>
        </div>
      </header>
      <div className="ai-ppt-layout">
        <WizardSteps activeIndex={2} />
        <main className="ai-ppt-workspace">
          <section className="ai-ppt-panel">
            <StyleColorStep
              customPalette={customPalette}
              fontOptions={fontOptions}
              isCustomizing={isCustomizingPalette}
              onCustomize={() => void customizePalette()}
              onFontSelect={setSelectedFontId}
              onPalettePromptChange={setPalettePrompt}
              onSelectPalette={setSelectedPaletteId}
              palettePrompt={palettePrompt}
              selectedFontId={selectedFont?.fontId ?? ""}
              selectedPaletteId={selectedPalette.optionId}
            />
            {error ? (
              <p className="ai-ppt-error" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="ai-ppt-status" role="status">
                {status}
              </p>
            ) : null}
          </section>
          <aside className="ai-ppt-live-preview">
            {selectedFont ? (
              <LivePreview
                selectedFont={selectedFont}
                selectedPalette={selectedPalette}
              />
            ) : null}
          </aside>
        </main>
      </div>
      <footer className="ai-ppt-footer">
        <button
          className="ai-ppt-secondary"
          disabled={isGenerating}
          type="button"
          onClick={() =>
            navigateToPath(storyPlanPath(props.projectId, props.jobId))
          }
        >
          <IconChevronLeft size={17} /> 이전
        </button>
        <button
          className="ai-ppt-primary"
          disabled={
            isGenerating || isCustomizingPalette || !story?.styleContext
          }
          type="button"
          onClick={() => void approveAndGenerate()}
        >
          <IconPlayerPlay size={17} />
          {isGenerating ? "생성 중" : "슬라이드 생성"}
        </button>
      </footer>
    </section>
  );
}

function WizardSteps({ activeIndex }: { activeIndex: number }) {
  return (
    <aside className="ai-ppt-steps" aria-label="AI PPT 생성 단계">
      {flowSteps.map((label, index) => (
        <div
          className={[
            "ai-ppt-step",
            index === activeIndex ? "active" : "",
            index < activeIndex ? "done" : "",
          ].join(" ")}
          key={label}
        >
          <span>
            {index < activeIndex ? <IconCheck size={14} /> : index + 1}
          </span>
          <strong>{label}</strong>
        </div>
      ))}
    </aside>
  );
}

function ContentStep(props: {
  files: File[];
  form: AiPptWizardState;
  formRef: Ref<HTMLFormElement>;
  onChange: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K],
  ) => void;
  onFilesChange: (files: File[]) => void;
}) {
  return (
    <>
      <PanelHeading kicker="1. 내용 입력" title="무엇을 누구에게 발표하나요?" />
      <form
        ref={props.formRef}
        aria-label="발표 내용 입력"
        className="ai-ppt-field-grid"
        onSubmit={(event) => event.preventDefault()}
      >
        <TextField
          name="topic"
          label="발표 주제"
          placeholder="예: 2026년 하반기 제품 전략"
          value={props.form.topic}
          onChange={(value) => props.onChange("topic", value)}
        />
        <TextAreaField
          name="content"
          label="발표 내용"
          placeholder="다루고 싶은 배경, 핵심 메시지와 반드시 포함할 내용을 자유롭게 적어주세요."
          value={props.form.content}
          onChange={(value) => props.onChange("content", value)}
        />
        <TextField
          name="audience"
          label="청중은 누구인가요?"
          placeholder="예: 제품·개발 리드와 경영진"
          value={props.form.audience}
          onChange={(value) => props.onChange("audience", value)}
        />
      </form>
      <fieldset className="ai-ppt-style-fieldset">
        <legend>발표 톤</legend>
        <div className="ai-ppt-tone-grid">
          {toneOptions.map((tone) => (
            <button
              key={tone.value}
              className={props.form.tone === tone.value ? "selected" : ""}
              type="button"
              onClick={() => props.onChange("tone", tone.value)}
            >
              {tone.label}
            </button>
          ))}
        </div>
      </fieldset>
      <AttachmentField
        files={props.files}
        onFilesChange={props.onFilesChange}
      />
    </>
  );
}

function StyleColorStep(props: {
  customPalette: PaletteOption | null;
  fontOptions: GenerateDeckFontOption[];
  isCustomizing: boolean;
  onCustomize: () => void;
  onFontSelect: (fontId: string) => void;
  onPalettePromptChange: (value: string) => void;
  onSelectPalette: (optionId: string) => void;
  palettePrompt: string;
  selectedFontId: string;
  selectedPaletteId: string;
}) {
  return (
    <>
      <PanelHeading
        kicker="3. Style & Color"
        title="폰트와 색상을 선택하세요"
      />
      <fieldset className="ai-ppt-style-fieldset">
        <legend>폰트</legend>
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
                스토리를 선명하게 전달하는 문장
              </span>
              <small>{font.rationale}</small>
              <em>{font.license}</em>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="ai-ppt-style-fieldset">
        <legend>컬러 팔레트</legend>
        <div className="ai-ppt-palette-grid ai-ppt-palette-grid-expanded">
          {defaultPaletteOptions.map((option) => (
            <PaletteButton
              key={option.optionId}
              option={option}
              selected={props.selectedPaletteId === option.optionId}
              onSelect={props.onSelectPalette}
            />
          ))}
          <div
            className={[
              "ai-ppt-ai-palette-tile",
              props.selectedPaletteId === "ai-custom" ? "selected" : "",
            ].join(" ")}
          >
            <div className="ai-ppt-ai-palette-heading">
              <IconSparkles size={18} />
              <strong>{props.customPalette?.name ?? "AI 팔레트"}</strong>
            </div>
            {props.customPalette ? (
              <button
                className="ai-ppt-ai-palette-result"
                type="button"
                onClick={() => props.onSelectPalette("ai-custom")}
              >
                <PaletteSwatches palette={props.customPalette.palette} />
                <span>{props.customPalette.rationale}</span>
              </button>
            ) : (
              <p>선택한 팔레트를 수정하거나 새로운 분위기를 추천받으세요.</p>
            )}
            <textarea
              aria-label="AI 팔레트 요청"
              placeholder="예: 배경은 유지하고 포인트 컬러만 더 따뜻하게"
              value={props.palettePrompt}
              onChange={(event) =>
                props.onPalettePromptChange(event.target.value)
              }
            />
            <button
              className="ai-ppt-secondary"
              disabled={props.isCustomizing}
              type="button"
              onClick={props.onCustomize}
            >
              <IconSparkles size={16} />
              {props.isCustomizing ? "추천 중..." : "AI로 적용"}
            </button>
          </div>
        </div>
      </fieldset>
    </>
  );
}

function PaletteButton(props: {
  option: PaletteOption;
  selected: boolean;
  onSelect: (optionId: string) => void;
}) {
  return (
    <button
      className={props.selected ? "selected" : ""}
      type="button"
      onClick={() => props.onSelect(props.option.optionId)}
    >
      <PaletteSwatches palette={props.option.palette} />
      <strong>{props.option.name}</strong>
      <small>{props.option.rationale}</small>
    </button>
  );
}

function PaletteSwatches(props: { palette: Required<PaletteOverride> }) {
  return (
    <span className="ai-ppt-palette-swatches" aria-hidden="true">
      {[
        props.palette.primary,
        props.palette.secondary,
        props.palette.background,
        props.palette.accentColor,
      ].map((color, index) => (
        <i key={`${color}-${index}`} style={{ background: color }} />
      ))}
    </span>
  );
}

function LivePreview(props: {
  selectedFont: GenerateDeckFontOption;
  selectedPalette: PaletteOption;
}) {
  return (
    <div className="ai-ppt-preview-card">
      <div className="ai-ppt-preview-top">
        <span>Live Preview</span>
        <strong>
          {props.selectedPalette.name} · {props.selectedFont.name}
        </strong>
      </div>
      <div className="ai-ppt-slide-grid">
        <MiniSlide
          font={props.selectedFont}
          palette={props.selectedPalette.palette}
        />
        <MiniSlide
          dense
          font={props.selectedFont}
          palette={props.selectedPalette.palette}
        />
      </div>
    </div>
  );
}

export function miniSlideFontStyles(
  font: Pick<
    GenerateDeckFontOption,
    "headingFontFamily" | "bodyFontFamily" | "fallbackFamily"
  >,
) {
  const stack = (family: string) =>
    `"${family.replaceAll('"', "")}", ${font.fallbackFamily}, sans-serif`;
  return {
    heading: { fontFamily: stack(font.headingFontFamily) },
    body: { fontFamily: stack(font.bodyFontFamily) },
  };
}

function MiniSlide(props: {
  dense?: boolean;
  font: GenerateDeckFontOption;
  palette: Required<PaletteOverride>;
}) {
  const fontStyles = miniSlideFontStyles(props.font);
  const { palette } = props;
  return (
    <div
      className={[
        "ai-ppt-mini-slide",
        props.dense ? "ai-ppt-mini-slide-dense" : "ai-ppt-mini-slide-cover",
      ].join(" ")}
      style={{
        background: palette.background,
        borderColor: palette.border,
        color: palette.text,
        ...fontStyles.body,
      }}
    >
      <i
        className="ai-ppt-mini-top-rule"
        style={{ background: palette.primary }}
      />
      <header className="ai-ppt-mini-section" style={fontStyles.heading}>
        <span style={{ color: palette.primary }}>01</span>
        <b>발표 디자인</b>
      </header>
      {props.dense ? (
        <main className="ai-ppt-mini-body-recipe">
          {[palette.primary, palette.secondary, palette.accentColor].map(
            (color, index) => (
              <section
                key={`${color}-${index}`}
                style={{ borderColor: palette.border }}
              >
                <i style={{ background: color }} />
                <strong style={fontStyles.heading}>
                  {index === 0 ? "과정" : index === 1 ? "핵심" : "근거"}
                </strong>
                <p style={{ background: palette.muted }} />
              </section>
            ),
          )}
        </main>
      ) : (
        <main className="ai-ppt-mini-cover-recipe">
          <section>
            <strong style={fontStyles.heading}>핵심 메시지</strong>
            <p style={fontStyles.body}>발표 흐름과 실행안</p>
          </section>
          <aside
            style={{ background: palette.muted, borderColor: palette.border }}
          >
            <i style={{ background: palette.primary }} />
            <span style={{ borderColor: palette.border }} />
            <span style={{ borderColor: palette.border }} />
            <span style={{ borderColor: palette.border }} />
          </aside>
        </main>
      )}
      <i
        className="ai-ppt-mini-bottom-rule"
        style={{ background: palette.secondary }}
      />
    </div>
  );
}

function AttachmentField(props: {
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function addFiles(files: FileList | File[]) {
    props.onFilesChange(mergeReferenceFiles(props.files, Array.from(files)));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <section
      className="ai-ppt-attachments"
      aria-labelledby="ai-ppt-attachments-title"
    >
      <h3 id="ai-ppt-attachments-title">참고 자료</h3>
      <p>
        선택 사항 · PDF, PPTX, DOCX 또는 이미지 파일을 여러 개 첨부할 수
        있습니다.
      </p>
      <label
        className={[
          "ai-ppt-reference-drop",
          isDragging ? "is-dragging" : "",
          props.files.length ? "has-files" : "",
        ].join(" ")}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="ai-ppt-reference-icon" aria-hidden="true">
          <IconPaperclip size={24} />
        </span>
        <strong>파일을 끌어놓거나 선택하세요</strong>
        <span className="ai-ppt-reference-action">
          <IconUpload size={16} /> 파일 선택
        </span>
        <input
          className="ai-ppt-reference-input"
          type="file"
          multiple
          accept=".pdf,.pptx,.docx,.jpg,.jpeg,.png,.webp"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {props.files.length ? (
        <ul className="ai-ppt-attachment-list">
          {props.files.map((file) => (
            <li key={referenceFileKey(file)}>
              <IconFileText size={18} />
              <span>{file.name}</span>
              <button
                aria-label={`${file.name} 제거`}
                type="button"
                onClick={() =>
                  props.onFilesChange(
                    props.files.filter(
                      (candidate) =>
                        referenceFileKey(candidate) !== referenceFileKey(file),
                    ),
                  )
                }
              >
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TextField(props: {
  label: string;
  name: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ai-ppt-field">
      <span>{props.label}</span>
      <input
        name={props.name}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField(props: {
  label: string;
  name: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ai-ppt-textarea ai-ppt-field-wide">
      <span>{props.label}</span>
      <textarea
        name={props.name}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function PanelHeading(props: { kicker: string; title: string }) {
  return (
    <div className="ai-ppt-panel-heading">
      <span>{props.kicker}</span>
      <h2>{props.title}</h2>
    </div>
  );
}

export async function fetchDeckColorCustomization(input: {
  topic: string;
  instruction: string;
  basePalette: Required<PaletteOverride>;
  stylePackId: string;
  tone: Tone;
}) {
  const response = await fetch("/api/v1/ai/deck-color-customization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readResponseText(
        response,
        "AI 팔레트를 만들지 못했습니다. 현재 선택은 유지됩니다.",
      ),
    );
  }
  return (await response.json()) as DeckColorCustomizationResponse;
}

export async function pollJob(jobId: string, onUpdate?: (job: Job) => void) {
  for (;;) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "include",
    });
    if (!response.ok)
      throw new Error(await readResponseText(response, "Job 조회 실패"));
    const job = (await response.json()) as Job;
    onUpdate?.(job);
    if (["succeeded", "failed"].includes(job.status)) return job;
    await new Promise((resolve) => window.setTimeout(resolve, 1_200));
  }
}

export function mergeReferenceFiles(
  currentFiles: File[],
  incomingFiles: File[],
) {
  const filesByKey = new Map(
    currentFiles.map((file) => [referenceFileKey(file), file]),
  );
  for (const file of incomingFiles)
    filesByKey.set(referenceFileKey(file), file);
  return [...filesByKey.values()];
}

function referenceFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
    overflowRisk: option.overflowRisk,
  };
}

function getProjectTitle(topic: string) {
  return topic.trim().slice(0, 80) || "AI PPT";
}

function getAiPptGenerationStatus(job: Job) {
  return job.message || `AI PPT 생성 중 · ${job.progress}%`;
}

function navigateToStoryPlan(projectId: string, jobId: string) {
  navigateToPath(storyPlanPath(projectId, jobId));
}

function navigateToPath(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToProject(projectId: string) {
  window.history.pushState(
    null,
    "",
    `/project/${encodeURIComponent(projectId)}`,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function readResponseText(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}
