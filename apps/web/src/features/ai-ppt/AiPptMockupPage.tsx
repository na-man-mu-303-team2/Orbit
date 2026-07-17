import type {
  DeckColorCustomizationResponse,
  GenerateDeckFontOption,
  GenerateDeckMediaPolicy,
  GenerateDeckRequest,
  GenerateDeckReferencePolicy,
  Job,
  AiDeckDesignSelectionResponse,
} from "@orbit/shared";
import { demoIds, recommendGenerateDeckFonts } from "@orbit/shared";
import {
  IconCheck,
  IconChevronLeft,
  IconFileText,
  IconInfoCircle,
  IconPaperclip,
  IconPlayerPlay,
  IconSparkles,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import type { DragEvent, Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProjectWithoutDeck,
  deleteProject,
  uploadProjectAsset,
} from "../projects/ProjectAssetWorkspace";
import {
  generationPath,
  requestDesignSelection,
  saveDesignSelection,
  styleColorPath,
} from "./design-selection-api";
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
  referencePolicy: GenerateDeckReferencePolicy;
  mediaPolicy: GenerateDeckMediaPolicy;
};

type PolicyChoiceOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

const stylePackId = "brandlogy-modern";
const defaultFontMood = "professional trustworthy Korean sans font";
const flowSteps = ["내용 입력", "Style & Color", "슬라이드 구성 미리보기"];

type UploadState = {
  status: "uploading" | "uploaded" | "failed";
  fileId?: string;
  error?: string;
};
const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "professional", label: "전문적인" },
  { value: "friendly", label: "친근한" },
  { value: "confident", label: "자신감 있는" },
  { value: "concise", label: "간결한" },
];

export const referencePolicyOptions = [
  {
    value: "user-input-only",
    label: "사용자 입력만",
    description:
      "발표 주제와 Brief 입력만 사용합니다. 첨부 파일 분석과 웹 검색은 실행하지 않습니다.",
  },
  {
    value: "references-first",
    label: "참고자료 우선",
    description:
      "첨부 자료를 중심으로 구성하고 웹 출처로 보완합니다. 분석 가능한 첨부가 1개 이상 필요하며, 웹 검색 실패 시 첨부 자료만으로 계속합니다.",
  },
  {
    value: "references-only",
    label: "참고자료만 사용",
    description:
      "첨부한 모든 자료에서 분석 가능한 텍스트를 확보해야 합니다. 웹 검색 없이 첨부 자료만 근거로 생성합니다.",
  },
  {
    value: "research-first",
    label: "웹 리서치 우선",
    description:
      "웹 리서치를 중심으로 구성하고 첨부 자료는 방향 보정에 사용합니다. 출처가 부족해도 검증 가능한 범위에서 초안을 생성합니다.",
  },
] satisfies readonly PolicyChoiceOption<GenerateDeckReferencePolicy>[];

export const mediaPolicyOptions = [
  {
    value: "minimal",
    label: "이미지 최소화",
    description: "이미지 슬롯을 만들지 않고 도형과 타이포 중심으로 구성합니다.",
  },
  {
    value: "provided-only",
    label: "첨부 이미지만",
    description:
      "첨부 이미지에 사용 가능한 source가 있을 때만 사용합니다. source가 없으면 이미지 슬롯을 만들지 않습니다.",
  },
  {
    value: "public-assets",
    label: "공개 이미지 구조",
    description:
      "공개 이미지 사용을 전제로 visual plan과 교체 가능한 placeholder만 만듭니다. 현재는 이미지 검색, 라이선스 확인, 다운로드를 하지 않습니다.",
  },
  {
    value: "ai-generated",
    label: "AI 이미지 구조",
    description:
      "AI 이미지 생성을 전제로 이미지 계획과 교체 가능한 placeholder만 만듭니다. 현재 실제 이미지 파일은 생성하지 않습니다.",
  },
  {
    value: "hybrid",
    label: "공식 + AI 이미지",
    description:
      "공식 이미지를 근거 자료로 우선 사용하고, 분위기 연출이 필요한 장면만 AI 이미지 구조로 보완합니다.",
  },
] satisfies readonly PolicyChoiceOption<GenerateDeckMediaPolicy>[];

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
    rationale: "콘텐츠와 브랜드 메시지에 어울리는 세련된 로즈 팔레트입니다.",
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
  referencePolicy: "user-input-only",
  mediaPolicy: "minimal",
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

export function getAiPptWizardValidationMessage(
  state: AiPptWizardState,
  referenceFiles: File[] = [],
) {
  if (!state.topic.trim()) return "발표 주제를 입력하세요.";
  if (!state.content.trim()) return "발표 내용을 입력하세요.";
  if (!state.audience.trim()) return "청중을 입력하세요.";
  if (state.referencePolicy === "references-only" && referenceFiles.length === 0) {
    return "참고자료만으로 구성하려면 파일을 1개 이상 첨부하세요.";
  }
  if (state.referencePolicy === "references-first" && referenceFiles.length === 0) {
    return "참고자료 우선 구성에는 파일을 1개 이상 첨부하세요.";
  }
  return "";
}

export function buildAiPptGenerateDeckPayload(
  state: AiPptWizardState,
  paletteOption: PaletteOption,
  referenceFileIds: string[] = [],
  selectedFont = recommendGenerateDeckFonts(defaultFontMood)[0],
): GenerateDeckRequest {
  return {
    topic: state.topic.trim(),
    prompt: state.content.trim(),
    designPrompt: [
      `tone=${state.tone}`,
      `palette=${paletteOption.optionId}`,
      `font=${selectedFont.name}`,
      `mediaPolicy=${state.mediaPolicy}`,
      `base=${stylePackId}`,
    ].join("; "),
    brief: {
      audienceText: state.audience.trim(),
      durationMinutes: 10,
      referencePolicy: state.referencePolicy,
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
      mediaPolicy: state.mediaPolicy,
      layoutDiversity: "varied",
      paletteOverride: paletteOption.palette,
      fontOverride: fontOverrideFromOption(selectedFont),
      referencePolicy: state.referencePolicy,
    },
    visualPlanPolicy: { mediaPolicy: state.mediaPolicy },
    referencePolicy: state.referencePolicy,
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
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const contentFormRef = useRef<HTMLFormElement>(null);
  const projectPromiseRef = useRef<ReturnType<typeof createProjectWithoutDeck> | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const referenceFilesRef = useRef<File[]>([]);
  const generationStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      const projectId = projectIdRef.current;
      if (projectId && !generationStartedRef.current) {
        void deleteProject(projectId).catch(() => undefined);
      }
    };
  }, []);

  async function ensureProject() {
    if (!projectPromiseRef.current) {
      const projectPromise = createProjectWithoutDeck(
        getProjectTitle(form.topic),
      ).then((project) => {
        projectIdRef.current = project.projectId;
        return project;
      });
      projectPromiseRef.current = projectPromise;
      void projectPromise.catch(() => {
        if (projectPromiseRef.current === projectPromise) {
          projectPromiseRef.current = null;
          projectIdRef.current = null;
        }
      });
    }
    return projectPromiseRef.current;
  }

  async function cleanupTemporaryProjectIfUnused(projectId = projectIdRef.current) {
    if (
      !projectId ||
      projectIdRef.current !== projectId ||
      generationStartedRef.current ||
      referenceFilesRef.current.length > 0
    ) {
      return;
    }
    projectIdRef.current = null;
    projectPromiseRef.current = null;
    await deleteProject(projectId).catch(() => undefined);
  }

  async function uploadReference(file: File) {
    const key = referenceFileKey(file);
    setUploadStates((current) => ({ ...current, [key]: { status: "uploading" } }));
    try {
      const project = await ensureProject();
      const uploaded = await uploadProjectAsset(project.projectId, file, "reference-material");
      if (!referenceFilesRef.current.some((candidate) => referenceFileKey(candidate) === key)) {
        await deleteUploadedAsset(project.projectId, uploaded.fileId).catch(() => undefined);
        await cleanupTemporaryProjectIfUnused(project.projectId);
        return;
      }
      setUploadStates((current) => ({
        ...current,
        [key]: { status: "uploaded", fileId: uploaded.fileId },
      }));
    } catch (cause) {
      if (!referenceFilesRef.current.some((candidate) => referenceFileKey(candidate) === key)) {
        await cleanupTemporaryProjectIfUnused();
        return;
      }
      setUploadStates((current) => ({
        ...current,
        [key]: {
          status: "failed",
          error: cause instanceof Error ? cause.message : "업로드하지 못했습니다.",
        },
      }));
    }
  }

  function changeReferenceFiles(nextFiles: File[]) {
    const previous = referenceFilesRef.current;
    referenceFilesRef.current = nextFiles;
    setReferenceFiles(nextFiles);
    const nextKeys = new Set(nextFiles.map(referenceFileKey));
    const removedFiles = previous.filter(
      (file) => !nextKeys.has(referenceFileKey(file)),
    );
    for (const removed of removedFiles) {
      const key = referenceFileKey(removed);
      const state = uploadStates[key];
      if (projectIdRef.current && state?.fileId) {
        const projectId = projectIdRef.current;
        void deleteUploadedAsset(projectId, state.fileId)
          .catch(() => undefined)
          .then(() => cleanupTemporaryProjectIfUnused(projectId));
      }
      setUploadStates((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    const cleanupContinuesAfterUpload = removedFiles.some((file) => {
      const state = uploadStates[referenceFileKey(file)];
      return state?.status === "uploading" || Boolean(state?.fileId);
    });
    if (nextFiles.length === 0 && !cleanupContinuesAfterUpload) {
      void cleanupTemporaryProjectIfUnused();
    }
    const previousKeys = new Set(previous.map(referenceFileKey));
    for (const added of nextFiles.filter((file) => !previousKeys.has(referenceFileKey(file)))) {
      void uploadReference(added);
    }
  }

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
    const validationMessage = getAiPptWizardValidationMessage(
      nextForm,
      referenceFiles,
    );
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
      const project = await ensureProject();
      createdProjectId = project.projectId;
      await updateProjectTitle(project.projectId, getProjectTitle(nextForm.topic));
      const referenceFileIds = referenceFiles.map(
        (file) => uploadStates[referenceFileKey(file)]?.fileId,
      );
      if (referenceFileIds.some((fileId) => !fileId)) {
        throw new Error("첨부파일 업로드가 완료된 후 계속할 수 있습니다.");
      }

      setStatus("발표 구성 생성 중...");
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
              referenceFileIds as string[],
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

      const data = (await response.json()) as { job: Job };
      generationStarted = true;
      generationStartedRef.current = true;
      navigateToPath(styleColorPath(project.projectId, data.job.jobId));
    } catch (submitError) {
      if (createdProjectId && !generationStarted) {
        await deleteProject(createdProjectId).catch(() => undefined);
        projectIdRef.current = null;
        projectPromiseRef.current = null;
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

  if (isGenerating) {
    return <AiPptStyleStartingPage />;
  }

  return (
    <section className="ai-ppt-page">
      <header className="ai-ppt-header">
        <div>
          <span>AI PPT</span>
          <h1>발표 내용부터 빠르게 시작하세요</h1>
          <p>
            내용, 청중, 발표 톤과 참고자료를 입력하면 AI가 슬라이드 구성을
            백그라운드에서 준비합니다.
          </p>
        </div>
        <button
          className="ai-ppt-primary"
          type="button"
          onClick={() => {
            setForm(initialAiPptWizardState);
            changeReferenceFiles([]);
            setError("");
            void cleanupTemporaryProjectIfUnused();
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
              onFilesChange={changeReferenceFiles}
              onRetryUpload={(file) => void uploadReference(file)}
              uploadStates={uploadStates}
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
          disabled={
            isGenerating ||
            Object.values(uploadStates).some((item) => item.status !== "uploaded")
          }
          type="button"
          onClick={() => void submitGeneration()}
        >
          {isGenerating ? (
            <>
              <IconPlayerPlay size={17} /> Style &amp; Color 여는 중
            </>
          ) : referenceFiles.some(
              (file) => uploadStates[referenceFileKey(file)]?.status !== "uploaded",
            ) ? (
            <>
              <IconUpload size={17} /> 업로드 완료 후 계속
            </>
          ) : (
            <>
              <IconPlayerPlay size={17} /> 다음 단계
            </>
          )}
        </button>
      </footer>
    </section>
  );
}

function AiPptStyleStartingPage() {
  const font = recommendGenerateDeckFonts(defaultFontMood)[0];
  const palette = defaultPaletteOptions[0];
  return (
    <section className="ai-ppt-page">
      <header className="ai-ppt-header">
        <div>
          <span>AI PPT</span>
          <h1>Style &amp; Color</h1>
          <p>콘텐츠 생성을 시작하면서 스타일 선택 화면을 준비하고 있습니다.</p>
        </div>
      </header>
      <div className="ai-ppt-layout">
        <WizardSteps activeIndex={1} />
        <main className="ai-ppt-workspace">
          <section className="ai-ppt-panel" aria-busy="true">
            <PanelHeading
              kicker="2. Style & Color"
              title="폰트와 색상을 선택하세요"
            />
            <p className="ai-ppt-status" role="status">
              프로젝트를 확정하고 발표 구성을 백그라운드에서 시작하는 중입니다.
            </p>
          </section>
          <aside className="ai-ppt-preview-panel">
            <MiniSlide
              font={font}
              palette={palette.palette}
            />
          </aside>
        </main>
      </div>
    </section>
  );
}

export function AiPptStyleColorPage(props: {
  jobId: string;
  projectId: string;
}) {
  const [designState, setDesignState] = useState<AiDeckDesignSelectionResponse | null>(null);
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
        `${designState?.styleContext.topic ?? ""} ${designState?.styleContext.tone ?? "professional"} ${defaultFontMood}`,
      ),
    [designState?.styleContext.tone, designState?.styleContext.topic],
  );
  const selectedFont =
    fontOptions.find((font) => font.fontId === selectedFontId) ??
    fontOptions[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await requestDesignSelection(props.projectId, props.jobId);
        if (cancelled) return;
        setDesignState(next);
        if (next.selection) {
          navigateToPath(generationPath(next.projectId, next.jobId));
          return;
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
    const styleContext = designState?.styleContext;
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
    if (!designState || !selectedFont) {
      setError("스타일을 적용할 발표 정보를 불러오지 못했습니다.");
      return;
    }
    setIsGenerating(true);
    setError("");
    setStatus("선택한 스타일을 적용하는 중...");
    try {
      const next = await saveDesignSelection(
        props.projectId,
        props.jobId,
        {
          paletteOptionId: selectedPalette.optionId,
          paletteOverride: selectedPalette.palette,
          fontOverride: fontOverrideFromOption(selectedFont),
          ...(palettePrompt.trim() ? { designPrompt: palettePrompt.trim() } : {}),
        },
      );
      setDesignState(next);
      navigateToPath(generationPath(next.projectId, next.jobId));
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
          <h1>발표에 어울리는 스타일을 선택하세요</h1>
          <p>컬러와 폰트를 선택하면 미리보기와 최종 슬라이드에 반영됩니다.</p>
        </div>
      </header>
      <div className="ai-ppt-layout">
        <WizardSteps activeIndex={1} />
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
            navigateToPath("/createdeck")
          }
        >
          <IconChevronLeft size={17} /> 이전
        </button>
        <button
          className="ai-ppt-primary"
          disabled={
            isGenerating || isCustomizingPalette || !designState?.styleContext
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
  onRetryUpload: (file: File) => void;
  uploadStates: Record<string, UploadState>;
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
        onRetryUpload={props.onRetryUpload}
        uploadStates={props.uploadStates}
      />
      <div className="ai-ppt-reference-policy-grid">
        <fieldset className="ai-ppt-reference-policy">
          <legend>내용 구성</legend>
          <p>발표 내용을 구성할 때 우선 사용할 근거를 선택합니다.</p>
          <div className="ai-ppt-choice-list">
            {referencePolicyOptions.map((option) => (
              <PolicyChoiceButton
                key={option.value}
                option={option}
                selected={props.form.referencePolicy === option.value}
                tooltipId={`reference-policy-${option.value}`}
                onSelect={(value) => props.onChange("referencePolicy", value)}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="ai-ppt-reference-policy">
          <legend>이미지 구성</legend>
          <p>슬라이드에서 사용할 이미지 소스와 생성 방식을 선택합니다.</p>
          <div className="ai-ppt-choice-list">
            {mediaPolicyOptions.map((option) => (
              <PolicyChoiceButton
                key={option.value}
                option={option}
                selected={props.form.mediaPolicy === option.value}
                tooltipId={`media-policy-${option.value}`}
                onSelect={(value) => props.onChange("mediaPolicy", value)}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}

function PolicyChoiceButton<T extends string>(props: {
  onSelect: (value: T) => void;
  option: PolicyChoiceOption<T>;
  selected: boolean;
  tooltipId: string;
}) {
  return (
    <span className="ai-ppt-policy-option">
      <button
        aria-describedby={props.tooltipId}
        aria-pressed={props.selected}
        className={props.selected ? "selected" : ""}
        onClick={() => props.onSelect(props.option.value)}
        type="button"
      >
        {props.option.label}
        <IconInfoCircle aria-hidden="true" size={15} stroke={1.8} />
      </button>
      <span className="ai-ppt-policy-tooltip" id={props.tooltipId} role="tooltip">
        {props.option.description}
      </span>
    </span>
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
        kicker="2. Style & Color"
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
                핵심을 선명하게 전달하는 문장
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
  onRetryUpload: (file: File) => void;
  uploadStates: Record<string, UploadState>;
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
          {props.files.map((file) => {
            const upload = props.uploadStates[referenceFileKey(file)];
            return (
            <li key={referenceFileKey(file)}>
              <IconFileText size={18} />
              <span>
                {file.name}
                <small>
                  {upload?.status === "uploaded"
                    ? "업로드 완료"
                    : upload?.status === "failed"
                      ? upload.error ?? "업로드 실패"
                      : "업로드 중"}
                </small>
              </span>
              {upload?.status === "failed" ? (
                <button type="button" onClick={() => props.onRetryUpload(file)}>
                  재시도
                </button>
              ) : null}
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
          )})}
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
    if (!response.ok) {
      throw new Error(await readResponseText(response, "Job 조회 실패"));
    }
    const job = (await response.json()) as Job;
    onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") return job;
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

function navigateToPath(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function updateProjectTitle(projectId: string, title: string) {
  const response = await fetch(
    `/api/v1/workspaces/${encodeURIComponent(demoIds.workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
    },
  );
  if (!response.ok) {
    throw new Error(await readResponseText(response, "프로젝트 제목을 저장하지 못했습니다."));
  }
}

async function deleteUploadedAsset(projectId: string, fileId: string) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(fileId)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(await readResponseText(response, "첨부파일을 제거하지 못했습니다."));
  }
}

async function readResponseText(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}
