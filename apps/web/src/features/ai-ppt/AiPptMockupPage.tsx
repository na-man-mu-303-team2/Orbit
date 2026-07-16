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
  ReferenceExtractionResult,
  SavedDesignPack
} from "@orbit/shared";
import type { EvaluatorLensRef, FrozenBriefRef } from "@orbit/shared";
import {
  generateDeckDiagnosticsSchema,
  generateDeckValidationSchema,
  pptAdvisorResponseSchema,
  recommendGenerateDeckFonts,
  referenceExtractionResultSchema,
  referenceExtractionStartResponseSchema
} from "@orbit/shared";
import {
  Copy,
  Image as ImageIcon,
  Pencil,
  Play,
  Save,
  Star,
  Trash2
} from "lucide-react";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFileText,
  IconInfoCircle,
  IconPalette,
  IconPaperclip,
  IconPlayerPlay,
  IconTrash,
  IconUpload,
  IconSparkles
} from "@tabler/icons-react";
import type { ChangeEvent, DragEvent, Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OrbitIconButton } from "../../design-system";
import { createProject, deleteProject, uploadProjectAsset } from "../projects/ProjectAssetWorkspace";
import { putPresentationBrief } from "../coaching/presentationBriefApi";
import "./ai-ppt-mockup.css";

type StepId = "brief" | "style" | "color" | "references" | "preview";
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

export type AiPptWizardState = {
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

type AiPptQualityFailure = {
  issues: Array<{ code: string; message: string; slide?: number }>;
  remainingCount: number;
};

type AiPptVisualAdvisory = {
  projectId: string;
  issueCodes: string[];
  slideOrders: number[];
};

type PolicyChoiceOption<T extends string> = {
  description: string;
  label: string;
  value: T;
};

export const referencePolicyOptions = [
  {
    value: "user-input-only",
    label: "사용자 입력만",
    description:
      "발표 주제와 Brief 입력만 사용합니다. 첨부 파일 분석과 웹 검색은 실행하지 않습니다."
  },
  {
    value: "references-first",
    label: "참고자료 우선",
    description:
      "첨부 자료를 중심으로 구성하고 웹 출처로 보완합니다. 분석 가능한 첨부가 1개 이상 필요하며, 웹 검색 실패 시 첨부 자료만으로 계속합니다."
  },
  {
    value: "references-only",
    label: "참고자료만 사용",
    description:
      "첨부한 모든 자료에서 분석 가능한 텍스트를 확보해야 합니다. 웹 검색 없이 첨부 자료만 근거로 생성합니다."
  },
  {
    value: "research-first",
    label: "웹 리서치 구조",
    description:
      "웹 리서치를 중심으로 구성하고 첨부 자료는 방향 보정에 사용합니다. 서로 다른 관련 출처 2개 이상을 확보하지 못하면 생성이 중단됩니다."
  }
] satisfies readonly PolicyChoiceOption<ReferencePolicy>[];

export const mediaPolicyOptions = [
  {
    value: "minimal",
    label: "이미지 최소화",
    description: "이미지 슬롯을 만들지 않고 도형과 타이포 중심으로 구성합니다."
  },
  {
    value: "provided-only",
    label: "첨부 이미지만",
    description:
      "첨부 이미지에 사용 가능한 source가 있을 때만 사용합니다. source가 없으면 이미지 슬롯을 만들지 않습니다."
  },
  {
    value: "public-assets",
    label: "공개 이미지 구조",
    description:
      "공개 이미지 사용을 전제로 visual plan과 교체 가능한 placeholder만 만듭니다. 현재는 이미지 검색, 라이선스 확인, 다운로드를 하지 않습니다."
  },
  {
    value: "ai-generated",
    label: "AI 이미지 구조",
    description:
      "AI 이미지 생성을 전제로 이미지 계획과 교체 가능한 placeholder만 만듭니다. 현재 실제 이미지 파일은 생성하지 않습니다."
  },
  {
    value: "hybrid",
    label: "공식 + AI 이미지",
    description:
      "공식 이미지를 근거 자료로 우선 사용하고, 분위기 연출이 필요한 장면만 AI 이미지 구조로 보완합니다."
  }
] satisfies readonly PolicyChoiceOption<MediaPolicy>[];

const stylePackId = "brandlogy-modern";

const steps: Array<{ id: StepId; label: string }> = [
  { id: "brief", label: "Brief" },
  { id: "style", label: "Style" },
  { id: "color", label: "Color" },
  { id: "references", label: "References" },
  { id: "preview", label: "Deck" }
];

const fallbackPaletteOptions: PaletteOption[] = [
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
      accentColor: "#C5B0F4"
    }
  },
  {
    optionId: "executive-slate",
    name: "이그제큐티브 슬레이트",
    rationale: "내부 의사결정 회의에 어울리는 절제된 대비의 팔레트입니다.",
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
    name: "모던 바이올렛",
    rationale: "AI, 제품, 창의적인 이야기를 또렷하게 전달하는 팔레트입니다.",
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

export const briefFieldPlaceholders = {
  topic: "Design Pack 기반 AI PPT 생성 구조 제안",
  purpose: "템플릿 덮어쓰기에서 벗어나 Deck JSON 기반 생성 MVP를 설명",
  context: "제품/개발 리드 대상 15분 의사결정 회의",
  audience: "PM, 프론트엔드, 백엔드, AI 파이프라인 담당자",
  presentationType: "기획 발표",
  successCriteria: "1차 구현 범위와 다음 스프린트 우선순위 합의",
  duration: "15",
  slides: "15"
} as const;

export const initialAiPptWizardState: AiPptWizardState = {
  topic: "",
  purpose: "",
  context: "",
  audience: "",
  presentationType: "",
  successCriteria: "",
  duration: "",
  slides: "",
  tone: "professional",
  colorMood: "ORBIT Lilac 포인트와 Ink 대비, 차분하고 명확한 색감",
  fontMood: "professional trustworthy Korean sans font",
  mediaPolicy: "minimal",
  referencePolicy: "user-input-only"
};

const briefFieldNames = [
  "topic",
  "purpose",
  "context",
  "audience",
  "presentationType",
  "successCriteria",
  "duration",
  "slides"
] as const;

type BriefFieldName = (typeof briefFieldNames)[number];

export function mergeAiPptBriefFormData(
  state: AiPptWizardState,
  formData: Pick<FormData, "get">
) {
  const nextState = { ...state };
  for (const fieldName of briefFieldNames) {
    const value = formData.get(fieldName);
    if (typeof value === "string") nextState[fieldName] = value;
  }
  return nextState;
}

const generationStages = [
  "내용 구성",
  "디자인 방향 설정",
  "슬라이드 구성",
  "이미지 준비",
  "시각 품질 검토",
  "시각 품질 보정",
  "최종 발행"
];

export function buildAiPptGenerateDeckPayload(
  state: AiPptWizardState,
  paletteOption: PaletteOption,
  referenceFileIds: string[] = [],
  selectedFont = recommendGenerateDeckFonts(fontSource(state))[0],
  referenceGrounding: ReferenceGrounding = {
    referenceContext: [],
    referenceKeywords: []
  },
  savedDesignPack?: Pick<SavedDesignPack, "id" | "version">,
  officialAssetFileIds: string[] = [],
  coachingContext?: { briefRef: FrozenBriefRef; evaluatorLensRef: EvaluatorLensRef }
): GenerateDeckRequest {
  const durationMinutes = parsePositiveInteger(state.duration, 0);
  const slideCountRange = resolveSlideCountRange(state);
  const colorIntent = resolveColorIntent(state);
  const constraints = resolveDesignConstraints(state);
  const fontOverride = fontOverrideFromOption(selectedFont);

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
    ...(savedDesignPack
      ? {
          savedDesignPack: {
            id: savedDesignPack.id,
            version: savedDesignPack.version
          }
        }
      : {}),
    visualPlanPolicy: {
      mediaPolicy: state.mediaPolicy
    },
    referencePolicy: state.referencePolicy,
    referenceFileIds,
    officialAssetFileIds,
    references: referenceFileIds.map((fileId) => ({ fileId })),
    referenceKeywords: referenceGrounding.referenceKeywords,
    referenceContext: referenceGrounding.referenceContext,
    coachingContext: coachingContext ?? null
  };
}

export function getAiPptWizardValidationMessage(
  state: AiPptWizardState,
  referenceFiles: File[] = []
) {
  if (!state.topic.trim()) return "발표 주제를 입력하세요.";
  if (!state.purpose.trim()) return "발표 목적을 입력하세요.";
  if (!state.context.trim()) return "발표 맥락을 입력하세요.";
  if (!state.audience.trim()) return "청중을 입력하세요.";
  if (!state.presentationType.trim()) return "발표 유형을 입력하세요.";
  if (!state.successCriteria.trim()) return "성공 기준을 입력하세요.";
  if (parsePositiveInteger(state.duration, 0) < 1) {
    return "발표 시간은 1분 이상이어야 합니다.";
  }
  if (state.slides.trim() && parsePositiveInteger(state.slides, 0) < 1) {
    return "슬라이드 수는 1장 이상이어야 합니다.";
  }
  if (
    ["references-first", "references-only"].includes(state.referencePolicy) &&
    referenceFiles.length === 0
  ) {
    return state.referencePolicy === "references-only"
      ? "참고자료만으로 구성하려면 파일을 1개 이상 첨부하세요."
      : "참고자료 우선 구성에는 파일을 1개 이상 첨부하세요.";
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
  const [form, setForm] = useState(initialAiPptWizardState);
  const [briefMode, setBriefMode] = useState<"custom" | "generic">("custom");
  const [paletteOptions, setPaletteOptions] = useState(fallbackPaletteOptions);
  const [selectedPaletteId, setSelectedPaletteId] = useState(
    fallbackPaletteOptions[0].optionId
  );
  const [selectedFontId, setSelectedFontId] = useState(
    recommendGenerateDeckFonts(initialAiPptWizardState.fontMood)[0].fontId
  );
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [officialAssetFiles, setOfficialAssetFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [qualityFailure, setQualityFailure] = useState<AiPptQualityFailure | null>(null);
  const [visualAdvisory, setVisualAdvisory] = useState<AiPptVisualAdvisory | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [isLoadingColors, setIsLoadingColors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [designPacks, setDesignPacks] = useState<SavedDesignPack[]>([]);
  const [selectedDesignPackId, setSelectedDesignPackId] = useState("");
  const [isSavingDesignPack, setIsSavingDesignPack] = useState(false);
  const colorRequestKey = [
    form.topic,
    form.purpose,
    form.audience,
    form.tone,
    form.colorMood
  ].join("|");
  const loadedColorRequestKey = useRef("");
  const panelRef = useRef<HTMLElement>(null);
  const briefFormRef = useRef<HTMLFormElement>(null);
  const previousStepRef = useRef<StepId>(currentStep);
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
    () =>
      buildAiPptGenerateDeckPayload(
        form,
        selectedPalette,
        [],
        selectedFont,
        undefined,
        designPacks.find((pack) => pack.id === selectedDesignPackId)
      ),
    [
      designPacks,
      form,
      selectedDesignPackId,
      selectedFont,
      selectedPalette
    ]
  );

  useEffect(() => {
    void loadDesignPacks();
  }, []);

  useEffect(() => {
    if (fontOptions.some((font) => font.fontId === selectedFontId)) return;
    setSelectedFontId(fontOptions[0].fontId);
  }, [fontOptions, selectedFontId]);

  useEffect(() => {
    if (currentStep !== "color") return;
    if (loadedColorRequestKey.current === colorRequestKey) return;
    void loadColorOptions();
  }, [colorRequestKey, currentStep]);

  useEffect(() => {
    if (previousStepRef.current === currentStep) return;
    previousStepRef.current = currentStep;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentStep]);

  function updateForm<K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function loadDesignPacks(preferredId?: string) {
    try {
      const packs = await fetchSavedDesignPacks();
      setDesignPacks(packs);
      const nextId =
        preferredId ||
        (packs.some((pack) => pack.id === selectedDesignPackId)
          ? selectedDesignPackId
          : packs.find((pack) => pack.isDefault)?.id) ||
        "";
      setSelectedDesignPackId(nextId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Saved Design Pack 목록을 불러오지 못했습니다."
      );
    }
  }

  function applyDesignPack(packId: string) {
    setSelectedDesignPackId(packId);
    const pack = designPacks.find((candidate) => candidate.id === packId);
    if (!pack) return;

    setForm((current) => ({
      ...current,
      tone: pack.preferences.tone,
      mediaPolicy: pack.preferences.mediaPolicy,
      referencePolicy: pack.preferences.referencePolicy
    }));
    const palette = completeSavedPalette(pack, selectedPalette.palette);
    const optionId = `saved-${pack.id}`;
    setPaletteOptions((current) => [
      {
        optionId,
        name: pack.name,
        rationale: "Saved Design Pack palette",
        palette
      },
      ...current.filter((option) => option.optionId !== optionId)
    ]);
    setSelectedPaletteId(optionId);
    const savedFont = fontOptions.find(
      (font) =>
        font.headingFontFamily === pack.preferences.typography.headingFontFamily
    );
    if (savedFont) setSelectedFontId(savedFont.fontId);
  }

  async function saveCurrentDesignPack() {
    const selected = designPacks.find((pack) => pack.id === selectedDesignPackId);
    const canUpdate = selected?.ownerType === "user";
    const requestedName = window.prompt(
      canUpdate ? "Design Pack 이름" : "새 Design Pack 이름",
      canUpdate ? selected.name : `${form.topic.trim() || "My"} Design Pack`
    );
    if (!requestedName?.trim()) return;

    setIsSavingDesignPack(true);
    setError("");
    try {
      const body = buildSavedDesignPackInput(
        requestedName,
        form,
        selectedPalette,
        selectedFont,
        selected?.isDefault ?? false
      );
      const saved = canUpdate
        ? await updateSavedDesignPack(selected.id, body)
        : await createSavedDesignPack(body);
      await loadDesignPacks(saved.id);
      setStatus("Saved Design Pack이 저장되었습니다.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Saved Design Pack을 저장하지 못했습니다."
      );
    } finally {
      setIsSavingDesignPack(false);
    }
  }

  async function duplicateCurrentDesignPack() {
    const selected = designPacks.find((pack) => pack.id === selectedDesignPackId);
    if (!selected) return;
    const name = window.prompt("복제할 Design Pack 이름", `${selected.name} Copy`);
    if (!name?.trim()) return;
    const duplicated = await duplicateSavedDesignPack(selected.id, name);
    await loadDesignPacks(duplicated.id);
  }

  async function deleteCurrentDesignPack() {
    const selected = designPacks.find((pack) => pack.id === selectedDesignPackId);
    if (!selected || selected.ownerType !== "user") return;
    if (!window.confirm(`'${selected.name}' Design Pack을 삭제할까요?`)) return;
    await deleteSavedDesignPack(selected.id);
    setSelectedDesignPackId("");
    await loadDesignPacks();
  }

  async function setCurrentDesignPackDefault() {
    const selected = designPacks.find((pack) => pack.id === selectedDesignPackId);
    if (!selected || selected.ownerType !== "user") return;
    const saved = await setDefaultSavedDesignPack(selected.id);
    await loadDesignPacks(saved.id);
  }

  function goToStep(step: StepId) {
    setCurrentStep(step);
    setError("");
  }

  function goNext() {
    if (currentStep === "references") {
      void submitGeneration();
      return;
    }
    if (currentStep === "brief") {
      const nextForm = briefFormRef.current
        ? mergeAiPptBriefFormData(form, new FormData(briefFormRef.current))
        : form;
      setForm(nextForm);
      const validationMessage = getAiPptWizardValidationMessage(nextForm, referenceFiles);
      if (validationMessage) {
        setError(validationMessage);
        return;
      }
    }
    const nextStep = steps[Math.min(currentStepIndex + 1, steps.length - 1)];
    goToStep(nextStep.id);
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
    setQualityFailure(null);
    setVisualAdvisory(null);
    setStatus("프로젝트 생성 중...");
    setJob(null);

    let createdProjectId: string | null = null;
    let generationStarted = false;
    try {
      const project = await createProject(getProjectTitle(form.topic));
      createdProjectId = project.projectId;
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
      const officialAssetFileIds: string[] = [];
      for (const file of officialAssetFiles) {
        setStatus(`${file.name} 공식 이미지 업로드 중...`);
        const uploaded = await uploadProjectAsset(
          project.projectId,
          file,
          "reference-material"
        );
        officialAssetFileIds.push(uploaded.fileId);
      }
      const groundingFileIds = [...referenceFileIds, ...officialAssetFileIds];

      let referenceGrounding: ReferenceGrounding = {
        referenceContext: [],
        referenceKeywords: []
      };
      if (
        groundingFileIds.length > 0 &&
        !["topic-only", "user-input-only"].includes(form.referencePolicy)
      ) {
        setStatus("참고자료 추출 job 시작 중...");
        const extractionJob = await startReferenceExtraction(
          project.projectId,
          groundingFileIds
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
            groundingFileIds,
            extractionResult
          );
          if (referenceError) throw new Error(referenceError);
          referenceGrounding = buildReferenceGrounding(extractionResult);
        }
      }

      let coachingContext: {
        briefRef: FrozenBriefRef;
        evaluatorLensRef: EvaluatorLensRef;
      };
      if (briefMode === "custom") {
        setStatus("맞춤 Brief 저장 중...");
        const presentationBrief = await putPresentationBrief(project.projectId, {
          expectedRevision: 0,
          audience: "decision-maker",
          purpose: "persuade",
          evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
          targetDurationMinutes: parsePositiveInteger(form.duration, 10),
          desiredOutcome: form.successCriteria.trim() || form.purpose.trim(),
          requirements: form.successCriteria.trim()
            ? [{ kind: "must-cover", text: form.successCriteria.trim(), reviewStatus: "approved" }]
            : [],
          terminology: [],
          challengeTopics: [],
          approvedReferenceFileIds: getApprovedBriefReferenceFileIds(
            form.referencePolicy,
            referenceFileIds
          )
        });
        coachingContext = {
          briefRef: {
            mode: "briefed",
            briefId: presentationBrief.briefId,
            revision: presentationBrief.revision
          },
          evaluatorLensRef: presentationBrief.evaluatorLensRef
        };
      } else {
        coachingContext = {
          briefRef: { mode: "generic" },
          evaluatorLensRef: { lensId: "general-novice", revision: 1 }
        };
      }

      setStatus(`1/${generationStages.length} ${generationStages[0]}`);
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
              referenceGrounding,
              designPacks.find((pack) => pack.id === selectedDesignPackId),
              officialAssetFileIds,
              coachingContext
            )
          )
        }
      );
      if (!response.ok) {
        throw new Error(await readResponseText(response, "AI PPT 생성을 시작하지 못했습니다."));
      }

      const data = (await response.json()) as { job: Job };
      generationStarted = true;
      setJob(data.job);
      setStatus(getAiPptGenerationStatus(data.job));
      const completed = await pollJob(data.job.jobId, (current) => {
        setJob(current);
        setStatus(getAiPptGenerationStatus(current));
      });
      setJob(completed);
      if (completed.status === "failed") {
        const qualityGateFailure = getAiPptQualityFailure(completed);
        if (qualityGateFailure) {
          setQualityFailure(qualityGateFailure);
          setStatus("");
          return;
        }
        throw new Error(completed.error?.message || completed.message);
      }

      const advisory = getAiPptVisualAdvisory(completed);
      if (advisory) {
        setVisualAdvisory(advisory);
        setStatus("");
        return;
      }

      setStatus("에디터로 이동 중...");
      navigateToProject(project.projectId);
    } catch (submitError) {
      if (createdProjectId && !generationStarted) {
        await deleteProject(createdProjectId).catch(() => undefined);
      }
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
            ORBIT Design Pack 기반 Deck JSON을 생성합니다.
          </p>
        </div>
        <button className="ai-ppt-primary" type="button" onClick={() => goToStep("brief")}>
          <IconSparkles size={17} />
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
              <span>{index < currentStepIndex ? <IconCheck size={14} /> : index + 1}</span>
              <strong>{step.label}</strong>
            </button>
          ))}
        </aside>

        <main className="ai-ppt-workspace">
          <section className="ai-ppt-panel" ref={panelRef}>
            {currentStep === "brief" ? (
              <BriefStep
                briefMode={briefMode}
                form={form}
                formRef={briefFormRef}
                onBriefModeChange={setBriefMode}
                onChange={updateForm}
              />
            ) : null}
            {currentStep === "style" ? (
              <StyleStep
                designPacks={designPacks}
                fontOptions={fontOptions}
                form={form}
                isSavingDesignPack={isSavingDesignPack}
                onApplyDesignPack={applyDesignPack}
                onChange={updateForm}
                onDeleteDesignPack={() => void deleteCurrentDesignPack()}
                onDuplicateDesignPack={() => void duplicateCurrentDesignPack()}
                onFontSelect={setSelectedFontId}
                onSaveDesignPack={() => void saveCurrentDesignPack()}
                onSetDefaultDesignPack={() => void setCurrentDesignPackDefault()}
                selectedDesignPackId={selectedDesignPackId}
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
                officialAssetFiles={officialAssetFiles}
                form={form}
                onChange={updateForm}
                onFilesChange={setReferenceFiles}
                onOfficialAssetFilesChange={setOfficialAssetFiles}
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
            {qualityFailure ? (
              <QualityFailurePanel
                failure={qualityFailure}
                isGenerating={isGenerating}
                onRetry={() => void submitGeneration()}
              />
            ) : null}
            {visualAdvisory ? (
              <VisualAdvisoryPanel
                advisory={visualAdvisory}
                onContinue={() => navigateToProject(visualAdvisory.projectId)}
              />
            ) : null}
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
          <IconChevronLeft size={17} />
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
              <IconPlayerPlay size={17} />
              생성 중
            </>
          ) : currentStep === "references" ? (
            <>
              <IconPlayerPlay size={17} />
              Deck JSON 생성
            </>
          ) : (
            <>
              다음
              <IconChevronRight size={17} />
            </>
          )}
        </button>
      </footer>
    </section>
  );
}

export function getApprovedBriefReferenceFileIds(
  referencePolicy: ReferencePolicy,
  referenceFileIds: string[]
) {
  return ["topic-only", "user-input-only"].includes(referencePolicy) ? [] : referenceFileIds;
}

function QualityFailurePanel(props: {
  failure: AiPptQualityFailure;
  isGenerating: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="ai-ppt-quality-failure" role="alert">
      <strong>품질 검증 결과가 발행 조건을 충족하지 못했습니다.</strong>
      <ul>
        {props.failure.issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.slide ?? 0}-${index}`}>
            <b>{issue.code}</b>
            {issue.slide ? ` · ${issue.slide}번 슬라이드` : ""}: {issue.message}
          </li>
        ))}
      </ul>
      {props.failure.remainingCount > 0 ? (
        <p>그 외 {props.failure.remainingCount}개 이슈가 있습니다.</p>
      ) : null}
      <button
        className="ai-ppt-secondary"
        disabled={props.isGenerating}
        type="button"
        onClick={props.onRetry}
      >
        <Play size={16} />
        동일 조건으로 다시 생성
      </button>
    </section>
  );
}

const visualAdvisoryMessages: Record<string, string> = {
  BALANCE_WEAK: "시각 요소의 균형을 편집기에서 조정할 수 있습니다.",
  LAYOUT_REPETITIVE: "비슷한 레이아웃이 반복된 슬라이드가 있습니다.",
  BACKGROUND_RHYTHM_FLAT: "배경 변화가 적은 슬라이드가 있습니다.",
  CARD_OVERUSED: "카드 형태가 반복된 슬라이드가 있습니다."
};

function VisualAdvisoryPanel(props: {
  advisory: AiPptVisualAdvisory;
  onContinue: () => void;
}) {
  return (
    <section className="ai-ppt-visual-advisory" role="status">
      <strong>편집 가능한 초안이 생성됐습니다.</strong>
      <p>
        시각 품질 경고가 남아 있습니다
        {props.advisory.slideOrders.length > 0
          ? ` · 영향 슬라이드 ${props.advisory.slideOrders.join(", ")}`
          : ""}
      </p>
      <ul>
        {props.advisory.issueCodes.map((code) => (
          <li key={code}>
            <b>{code}</b>: {visualAdvisoryMessages[code] ?? "시각 품질을 확인해 주세요."}
          </li>
        ))}
      </ul>
      <button className="ai-ppt-primary" type="button" onClick={props.onContinue}>
        에디터에서 확인
        <IconChevronRight size={17} />
      </button>
    </section>
  );
}

function BriefStep(props: {
  briefMode: "custom" | "generic";
  form: AiPptWizardState;
  formRef: Ref<HTMLFormElement>;
  onBriefModeChange: (value: "custom" | "generic") => void;
  onChange: <K extends keyof AiPptWizardState>(key: K, value: AiPptWizardState[K]) => void;
}) {
  return (
    <>
      <PanelHeading kicker="1. Brief" title="발표 상황과 청중을 먼저 고정" />
      <div className="ai-ppt-tone-grid" aria-label="Brief 모드">
        <button
          className={props.briefMode === "custom" ? "selected" : ""}
          type="button"
          onClick={() => props.onBriefModeChange("custom")}
        >
          맞춤 Brief
        </button>
        <button
          className={props.briefMode === "generic" ? "selected" : ""}
          type="button"
          onClick={() => props.onBriefModeChange("generic")}
        >
          일반 모드
        </button>
      </div>
      {props.briefMode === "generic" ? (
        <p className="ai-ppt-status">
          일반 초보자 관점으로 생성하며, 나중에 Brief를 추가할 수 있습니다.
        </p>
      ) : null}
      <form
        ref={props.formRef}
        aria-label="발표 Brief 입력"
        className="ai-ppt-field-grid"
        onSubmit={(event) => event.preventDefault()}
      >
        <TextField name="topic" label="발표 주제" placeholder={briefFieldPlaceholders.topic} value={props.form.topic} onChange={(value) => props.onChange("topic", value)} />
        <TextField name="purpose" label="발표 목적" placeholder={briefFieldPlaceholders.purpose} value={props.form.purpose} onChange={(value) => props.onChange("purpose", value)} />
        <TextField name="context" label="발표 맥락" placeholder={briefFieldPlaceholders.context} value={props.form.context} onChange={(value) => props.onChange("context", value)} />
        <TextField name="audience" label="청중" placeholder={briefFieldPlaceholders.audience} value={props.form.audience} onChange={(value) => props.onChange("audience", value)} />
        <TextField name="presentationType" label="발표 유형" placeholder={briefFieldPlaceholders.presentationType} value={props.form.presentationType} onChange={(value) => props.onChange("presentationType", value)} />
        <TextField name="successCriteria" label="성공 기준" placeholder={briefFieldPlaceholders.successCriteria} value={props.form.successCriteria} onChange={(value) => props.onChange("successCriteria", value)} />
        <TextField name="duration" label="발표 시간" placeholder={briefFieldPlaceholders.duration} value={props.form.duration} suffix="분" onChange={(value) => props.onChange("duration", value)} />
        <TextField name="slides" label="슬라이드 수" placeholder={briefFieldPlaceholders.slides} value={props.form.slides} suffix="장" onChange={(value) => props.onChange("slides", value)} />
      </form>
    </>
  );
}

function StyleStep(props: {
  designPacks: SavedDesignPack[];
  fontOptions: GenerateDeckFontOption[];
  form: AiPptWizardState;
  isSavingDesignPack: boolean;
  onApplyDesignPack: (packId: string) => void;
  onChange: <K extends keyof AiPptWizardState>(
    key: K,
    value: AiPptWizardState[K]
  ) => void;
  onDeleteDesignPack: () => void;
  onDuplicateDesignPack: () => void;
  onFontSelect: (fontId: string) => void;
  onSaveDesignPack: () => void;
  onSetDefaultDesignPack: () => void;
  selectedDesignPackId: string;
  selectedFontId: string;
}) {
  const tones: Tone[] = ["professional", "friendly", "confident", "concise"];
  const selectedPack = props.designPacks.find(
    (pack) => pack.id === props.selectedDesignPackId
  );
  return (
    <>
      <PanelHeading
        kicker="2. Style"
        title="ORBIT Design Pack에 얹을 톤 선택"
      />
      <div className="ai-ppt-pack-manager">
        <label>
          <span>Saved Design Pack</span>
          <select
            value={props.selectedDesignPackId}
            onChange={(event) => props.onApplyDesignPack(event.target.value)}
          >
            <option value="">현재 세션 설정</option>
            {props.designPacks.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.isDefault ? "★ " : ""}{pack.name}
                {pack.ownerType === "system" ? " (Preset)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            type="button"
            title={selectedPack?.ownerType === "user" ? "Design Pack 수정 저장" : "새 Design Pack 저장"}
            disabled={props.isSavingDesignPack}
            onClick={props.onSaveDesignPack}
          >
            {selectedPack?.ownerType === "user" ? <Pencil size={16} /> : <Save size={16} />}
          </button>
          <button
            type="button"
            title="Design Pack 복제"
            disabled={!selectedPack}
            onClick={props.onDuplicateDesignPack}
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            title="기본 Design Pack 지정"
            disabled={selectedPack?.ownerType !== "user" || selectedPack.isDefault}
            onClick={props.onSetDefaultDesignPack}
          >
            <Star size={16} />
          </button>
          <button
            type="button"
            title="Design Pack 삭제"
            disabled={selectedPack?.ownerType !== "user"}
            onClick={props.onDeleteDesignPack}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
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
              ORBIT 발표 자료
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
          <IconPalette size={16} />
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
  officialAssetFiles: File[];
  form: AiPptWizardState;
  onChange: <K extends keyof AiPptWizardState>(key: K, value: AiPptWizardState[K]) => void;
  onFilesChange: (files: File[]) => void;
  onOfficialAssetFilesChange: (files: File[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (
      event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      return;
    }
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const droppedFiles = filesFromDataTransfer(event.dataTransfer);
    if (droppedFiles.length > 0) {
      props.onFilesChange(mergeReferenceFiles(props.files, droppedFiles));
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = filesFromEvent(event);
    if (selectedFiles.length > 0) {
      props.onFilesChange(mergeReferenceFiles(props.files, selectedFiles));
    }
    event.currentTarget.value = "";
  }

  function removeFile(fileIndex: number) {
    props.onFilesChange(removeReferenceFileAt(props.files, fileIndex));
  }

  return (
    <>
      <PanelHeading kicker="4. References" title="참고자료와 활용 방식" />
      <p className="ai-ppt-reference-intro">
        발표 생성에 참고할 자료를 추가하고, 내용과 이미지의 반영 기준을 선택하세요.
      </p>
      <label
        className={[
          "ai-ppt-reference-drop",
          isDragging ? "is-dragging" : "",
          props.files.length > 0 ? "has-files" : ""
        ].join(" ")}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="ai-ppt-reference-icon" aria-hidden="true">
          <IconUpload size={23} />
        </span>
        <strong>
          {isDragging
            ? "여기에 놓아 추가하세요"
            : props.files.length
              ? "파일을 더 추가하세요"
              : "파일을 드래그해서 추가하세요"}
        </strong>
        <span>PDF, PPTX, DOCX, 이미지 · 파일당 최대 50MB · 여러 파일 선택 가능</span>
        <span className="ai-ppt-reference-action">
          <IconPaperclip size={16} />
          {props.files.length ? "파일 추가" : "파일 선택"}
        </span>
        <input
          accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label="참고자료 파일 선택"
          className="ai-ppt-reference-input"
          multiple
          type="file"
          onChange={handleFileInputChange}
        />
      </label>
      {props.files.length > 0 ? (
        <section className="ai-ppt-reference-files" aria-labelledby="ai-ppt-reference-files-title">
          <header>
            <div>
              <h3 id="ai-ppt-reference-files-title">첨부 파일</h3>
              <span className="ai-ppt-reference-count">{props.files.length}개</span>
            </div>
            <button
              className="ai-ppt-reference-clear"
              onClick={() => props.onFilesChange([])}
              type="button"
            >
              전체 삭제
            </button>
          </header>
          <ul>
            {props.files.map((file, index) => (
              <li key={referenceFileKey(file)}>
                <span className="ai-ppt-reference-file-icon" aria-hidden="true">
                  <IconFileText size={20} stroke={1.8} />
                </span>
                <div>
                  <strong title={file.name}>{file.name}</strong>
                  <small>{referenceFileMeta(file)}</small>
                </div>
                <OrbitIconButton
                  aria-label={`${file.name} 삭제`}
                  className="ai-ppt-reference-remove"
                  onClick={() => removeFile(index)}
                  variant="plain"
                >
                  <IconTrash aria-hidden="true" size={18} stroke={1.8} />
                </OrbitIconButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="ai-ppt-reference-policy-grid">
        <fieldset className="ai-ppt-reference-policy">
          <legend>참고자료 활용 기준</legend>
          <p>발표 내용에서 참고자료가 차지할 우선순위를 선택합니다.</p>
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
      {props.form.mediaPolicy === "hybrid" ? (
        <label className="ai-ppt-reference-drop ai-ppt-official-asset-drop">
          <ImageIcon size={28} />
          <strong>
            {props.officialAssetFiles.length
              ? `공식 이미지 ${props.officialAssetFiles.length}개 선택됨`
              : "공식 이미지 업로드 (권장)"}
          </strong>
          <span>
            제품 화면, 공식 발표 그래프, 보도용 이미지를 올리세요.
          </span>
          <input
            accept="image/png,image/jpeg,image/webp"
            multiple
            type="file"
            onChange={(event) =>
              props.onOfficialAssetFilesChange(filesFromEvent(event))
            }
          />
        </label>
      ) : null}
      <div className="ai-ppt-media-policy-help">
        <strong>공식 이미지</strong>
        <span>회사·기관이 직접 제공한 제품 화면, 공식 그래프, 보도용 이미지</span>
        <strong>공개 이미지</strong>
        <span>Openverse 등에서 검색한 제3자 라이선스 이미지</span>
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
          <IconDownload size={16} />
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
          <IconSparkles size={16} />
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

function TextField(props: {
  label: string;
  name: BriefFieldName;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  value: string;
}) {
  return (
    <label className="ai-ppt-field">
      <span>{props.label}</span>
      <div>
        <input
          name={props.name}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        {props.suffix ? <em>{props.suffix}</em> : null}
      </div>
    </label>
  );
}

type SavedDesignPackInput = {
  name: string;
  description: string;
  baseStylePackId: string;
  preferences: SavedDesignPack["preferences"];
  isDefault: boolean;
};

export function buildSavedDesignPackInput(
  name: string,
  form: AiPptWizardState,
  palette: PaletteOption,
  font: GenerateDeckFontOption,
  isDefault = false
): SavedDesignPackInput {
  return {
    name: name.trim(),
    description: `${form.presentationType.trim()} / ${form.audience.trim()}`,
    baseStylePackId: stylePackId,
    preferences: {
      palette: palette.palette,
      typography: {
        headingFontFamily: font.headingFontFamily,
        bodyFontFamily: font.bodyFontFamily,
        fallbackFamily: font.fallbackFamily,
        titleSizeScale: font.recommendedTitleSize / 48,
        bodySizeScale: font.recommendedBodySize / 22,
        lineHeight: Math.max(1.2, font.lineHeight)
      },
      tone: form.tone,
      density: "medium",
      titleStyle: "action",
      layoutPreference: "varied",
      imageDensity:
        form.mediaPolicy === "minimal"
          ? "none"
          : ["ai-generated", "public-assets", "hybrid"].includes(
                form.mediaPolicy
              )
            ? "medium"
            : "low",
      mediaPolicy: form.mediaPolicy,
      referencePolicy: form.referencePolicy,
      qaStrictness: "standard"
    },
    isDefault
  };
}

function completeSavedPalette(
  pack: SavedDesignPack,
  fallback: Required<PaletteOverride>
): Required<PaletteOverride> {
  return { ...fallback, ...pack.preferences.palette };
}

export async function fetchSavedDesignPacks(): Promise<SavedDesignPack[]> {
  const response = await fetch("/api/v1/design-packs", {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await readResponseText(response, "Saved Design Pack 목록을 불러오지 못했습니다."));
  }
  const payload = (await response.json()) as { packs: SavedDesignPack[] };
  return payload.packs;
}

async function createSavedDesignPack(
  input: SavedDesignPackInput
): Promise<SavedDesignPack> {
  return writeSavedDesignPack("/api/v1/design-packs", "POST", input);
}

async function updateSavedDesignPack(
  packId: string,
  input: SavedDesignPackInput
): Promise<SavedDesignPack> {
  return writeSavedDesignPack(
    `/api/v1/design-packs/${encodeURIComponent(packId)}`,
    "PATCH",
    input
  );
}

async function duplicateSavedDesignPack(
  packId: string,
  name: string
): Promise<SavedDesignPack> {
  return writeSavedDesignPack(
    `/api/v1/design-packs/${encodeURIComponent(packId)}/duplicate`,
    "POST",
    { name }
  );
}

async function setDefaultSavedDesignPack(packId: string): Promise<SavedDesignPack> {
  return writeSavedDesignPack(
    `/api/v1/design-packs/${encodeURIComponent(packId)}/default`,
    "POST",
    {}
  );
}

async function deleteSavedDesignPack(packId: string): Promise<void> {
  const response = await fetch(
    `/api/v1/design-packs/${encodeURIComponent(packId)}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!response.ok) {
    throw new Error(await readResponseText(response, "Saved Design Pack을 삭제하지 못했습니다."));
  }
}

async function writeSavedDesignPack(
  url: string,
  method: "POST" | "PATCH",
  body: unknown
): Promise<SavedDesignPack> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await readResponseText(response, "Saved Design Pack 작업을 완료하지 못했습니다."));
  }
  return (await response.json()) as SavedDesignPack;
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

export async function pollJob(
  jobId: string,
  onUpdate?: (job: Job) => void
): Promise<Job> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 900_000) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, "작업 상태를 확인하지 못했습니다."));
    }
    const payload = (await response.json()) as { job: Job } | Job;
    const job = "job" in payload ? payload.job : payload;
    onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    await delay(1200);
  }
  throw new Error("AI PPT 생성 시간이 초과되었습니다.");
}

export function getAiPptQualityFailure(job: Job): AiPptQualityFailure | null {
  const qualityFailureCodes = new Set([
    "GENERATE_DECK_QUALITY_GATE_FAILED",
    "GENERATE_DECK_VISUAL_QUALITY_GATE_FAILED",
    "GENERATE_DECK_VISUAL_QA_UNAVAILABLE"
  ]);
  if (
    job.status !== "failed" ||
    !job.error?.code ||
    !qualityFailureCodes.has(job.error.code)
  ) {
    return null;
  }
  const validation = generateDeckValidationSchema.safeParse(
    job.result && typeof job.result === "object" && "validation" in job.result
      ? job.result.validation
      : null
  );
  if (!validation.success) {
    return {
      issues: [
        {
          code: job.error.code,
          message: job.error.message || "시각 품질 검증을 완료하지 못했습니다."
        }
      ],
      remainingCount: 0
    };
  }
  const issues = [
    ...validation.data.layoutIssues,
    ...validation.data.contentIssues,
    ...validation.data.designIssues,
    ...validation.data.presentationIssues
  ].map((issue) => {
    const match = issue.path.match(/^slides\.(\d+)/);
    return {
      code: issue.code,
      message: issue.message,
      ...(match ? { slide: Number(match[1]) + 1 } : {})
    };
  });
  const visibleIssues =
    issues.length > 0
      ? issues
      : [
          {
            code: job.error.code,
            message: job.error.message || "시각 품질 검증을 완료하지 못했습니다."
          }
        ];
  return {
    issues: visibleIssues.slice(0, 5),
    remainingCount: Math.max(0, visibleIssues.length - 5)
  };
}

export function getAiPptVisualAdvisory(job: Job): AiPptVisualAdvisory | null {
  if (
    job.status !== "succeeded" ||
    !job.result ||
    typeof job.result !== "object" ||
    !("diagnostics" in job.result)
  ) {
    return null;
  }
  const parsed = generateDeckDiagnosticsSchema.safeParse(job.result.diagnostics);
  if (
    !parsed.success ||
    parsed.data.visualQaStatus !== "advisory" ||
    !parsed.data.warningCodes.includes("GENERATE_DECK_VISUAL_ADVISORY")
  ) {
    return null;
  }
  return {
    projectId: job.projectId,
    issueCodes: [...new Set(parsed.data.visualIssueCodes ?? [])],
    slideOrders: [...new Set(parsed.data.visualIssueSlideOrders ?? [])].sort(
      (left, right) => left - right
    )
  };
}

export function getAiPptGenerationStatus(job: Job) {
  const progress = Math.max(0, Math.min(100, job.progress));
  const stageIndex =
    progress >= 95
      ? 6
      : progress >= 80
        ? 5
        : progress >= 70
          ? 4
          : progress >= 60
            ? 3
            : progress >= 40
              ? 2
              : progress >= 25
                ? 1
                : 0;
  return `${stageIndex + 1}/${generationStages.length} ${generationStages[stageIndex]}`;
}

function filesFromEvent(event: ChangeEvent<HTMLInputElement>) {
  return filesFromFileList(event.target.files);
}

export function filesFromDataTransfer(dataTransfer: DataTransfer) {
  return filesFromFileList(dataTransfer.files);
}

export function filesFromFileList(fileList: FileList | null) {
  return Array.from(fileList ?? []);
}

export function mergeReferenceFiles(currentFiles: File[], incomingFiles: File[]) {
  const filesByKey = new Map(currentFiles.map((file) => [referenceFileKey(file), file]));
  for (const file of incomingFiles) {
    filesByKey.set(referenceFileKey(file), file);
  }
  return Array.from(filesByKey.values());
}

export function removeReferenceFileAt(files: File[], fileIndex: number) {
  return files.filter((_, index) => index !== fileIndex);
}

function referenceFileKey(file: File) {
  return [file.name, file.size, file.type, file.lastModified].join(":");
}

function referenceFileMeta(file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() : "FILE";
  return `${extension || "FILE"} · ${formatFileSize(file.size)}`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveSlideCountRange(state: AiPptWizardState) {
  const requested = parsePositiveInteger(state.slides, 0);
  if (requested > 0) {
    return { min: requested, max: requested };
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
    canvasBackground: hasAny(source, [
      "white background",
      "background white",
      "흰색 배경",
      "흰 색 배경",
      "흰 배경",
      "화이트 배경",
      "백색 배경"
    ])
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
    backgroundPreference: resolveBackgroundPreference(source, constraints),
    forbiddenStyles: constraints.forbiddenStyles
  };
}

function resolveBackgroundPreference(
  source: string,
  constraints: DesignConstraints
): ColorIntent["backgroundPreference"] {
  if (constraints.canvasBackground === "white") return "white";
  if (hasAny(source, ["black", "dark", "검은", "검정", "블랙", "어두운", "다크"])) {
    return "dark";
  }
  return "auto";
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
      "그라데이션 제외",
      "그라데이션과 파스텔톤은 사용하지",
      "그라데이션과 파스텔은 사용하지"
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
      "파스텔 제외",
      "그라데이션과 파스텔톤은 사용하지",
      "그라데이션과 파스텔은 사용하지"
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
    return `현재 이미지 정책은 ${state.mediaPolicy}입니다. hybrid는 공식 근거 이미지를 우선 사용하고 분위기 연출이 필요한 장면만 AI 이미지로 생성합니다.`;
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
      const parsed = JSON.parse(detail) as {
        detail?: unknown;
        message?: unknown;
      };
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
