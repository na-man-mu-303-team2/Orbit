import {
  createGroupedElementFramePatch,
  createAddElementPatch,
  createAddSlidePatch,
  createDemoDeck,
  createElementId,
  getGroupChildElements,
  getGroupedSelectionBounds,
  createSlideId,
  createUpdateElementPropsPatch
} from "../../../../../../packages/editor-core/src/index";
import { applyDeckPatch } from "../../../../../../packages/editor-core/src/patches/applyPatch";
import {
  createElementFramePatch,
  normalizeElementFrameDraft
} from "../../../../../../packages/editor-core/src/patches/elementFrame";
import {
  appendDeckPatchResponseSchema,
  demoIds,
  getDeckResponseSchema,
  maxAssetUploadSizeBytes,
  putDeckResponseSchema
} from "@orbit/shared";
import orbitLogo from "../../assets/orbit-logo.png";
import { createProject, fetchProjects, uploadProjectAsset } from "../../projects/ProjectAssetWorkspace";
import {
  normalizeEditorAssetUrl,
  resolveEditorAssetUrl
} from "../shared/editorAssetUrl";
import {
  EditableCanvas,
  HiddenSlideRenderStages
} from "../canvas/EditorCanvas";
import {
  getCustomShapeAbsoluteNodes,
  normalizeCustomShapeAbsoluteGeometry
} from "../canvas/custom-shape/geometry";
import {
  EmptyCanvasState,
  EmptyPanel
} from "./components/EditorStateNotice";
import { IdBadge } from "./components/EditorIdBadge";
import {
  ElementSummary,
  InfoCard,
  KeywordSummary
} from "./components/EditorDebugCards";
import {
  KeywordDetail,
  KeywordHighlightedNotes,
  KeywordList
} from "./components/KeywordInspector";
import { SelectionQuickBar } from "./components/SelectionQuickBar";
export {
  EditorStateNotice
} from "./components/EditorStateNotice";
export {
  mergeDeckIntoQueryCache,
  shouldApplyManualSaveResult,
  shouldHydrateDeckFromQuery
} from "./utils/deckState";
import type {
  ApplyAiSuggestionResponse,
  CustomShapeElementProps,
  CustomShapeNode,
  Deck,
  DeckCanvas,
  DeckElement,
  DeckElementRole,
  DeckPatch,
  GroupElementProps,
  ImageElementProps,
  ShapeElementProps,
  Slide
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type Konva from "konva";
import {
  BarChart3,
  ChevronDown,
  Cloud,
  Download,
  FileText,
  FolderPlus,
  Home,
  ImagePlus,
  LayoutTemplate,
  Minus,
  MonitorPlay,
  MoveRight,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Presentation,
  RefreshCw,
  Shapes,
  Share2,
  Sparkles,
  Type,
  Upload,
  Wand2
} from "lucide-react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { SuggestionPanel } from "../suggestions/components/SuggestionPanel";
import {
  mergeDeckIntoQueryCache,
  shouldApplyManualSaveResult,
  shouldHydrateDeckFromQuery
} from "./utils/deckState";
import "../editor-shell.css";

interface HealthResponse {
  status: string;
  app: string;
  demo: typeof demoIds;
}

declare global {
  interface Window {
    __ORBIT_EDITOR_TEST_API__?: {
      updateSelectedElementFrame: (
        frame: Partial<{
          x: number;
          y: number;
          width: number;
          height: number;
          rotation: number;
        }>
      ) => boolean;
      updateCurrentSlideStyle: (
        style: Partial<{
          backgroundColor: string | null;
          textColor: string | null;
          accentColor: string | null;
        }>
      ) => boolean;
    };
  }
}

const fallbackDeck = createDemoDeck();
const collapsedSlidesPaneWidth = 52;
const defaultSlidesPaneWidth = 176;
const minSlidesPaneWidth = 132;

const maxSlidesPaneWidth = 280;
const collapsedRightPaneWidth = 52;
const defaultRightPaneWidth = 320;
const minRightPaneWidth = 260;
const maxRightPaneWidth = 560;
const editorUploadProjectTitle = "ORBIT Editor Uploads";
const defaultImageInsertFrame = {
  height: 240,
  width: 420,
  x: 260,
  y: 220
};
const editorImageAccept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const editorImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type TopMenu = "file" | "resize" | "editMode" | "quickEdit" | "presentation";
type SlidePanelView = "thumbnail" | "list";
type InsertTool =
  | "select"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "customShape";
type ShapeInsertType =
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "triangle"
  | "polygon"
  | "star"
  | "customShape";
type ShapeMenuPosition = {
  left: number;
  top: number;
};
type ElementContextMenuState =
  | {
      elementId: string;
      left: number;
      slideId: string;
      top: number;
      type: "image";
    }
  | {
      elementId: string;
      left: number;
      slideId: string;
      top: number;
      type: "group";
    }
  | {
      elementIds: string[];
      left: number;
      slideId: string;
      top: number;
      type: "selection";
    };
type ElementClipboardState = {
  element: DeckElement;
  pasteCount: number;
};
type ImageUploadTarget =
  | {
      type: "insert";
      slideId: string;
    }
  | {
      elementId: string;
      slideId: string;
      type: "replace";
    };
type ElementFrameChange = {
  role?: DeckElementRole | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
  visible?: boolean;
};
type ToolbarNoticeTone = "info" | "success" | "danger";
type SaveState = "idle" | "pending" | "saving" | "error";

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json() as Promise<HealthResponse>;
}

async function readResponseError(response: Response, fallbackMessage: string) {
  const message = await response.text();
  return message || fallbackMessage;
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function getSlideRenderBackgroundColor(slide: Slide, deck: Deck) {
  return slide.style.backgroundColor ?? deck.theme.backgroundColor;
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType = "image/png") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("슬라이드 이미지를 생성하지 못했습니다."));
        return;
      }

      resolve(blob);
    }, mimeType);
  });
}

async function createSlideRenderFile(args: {
  deck: Deck;
  slide: Slide;
  stage: Konva.Stage;
  stageScale: number;
  slideNumber: number;
}) {
  const pixelRatio = Math.max(1, 1 / args.stageScale);
  const stageCanvas = args.stage.toCanvas({
    pixelRatio
  }) as HTMLCanvasElement;
  const canvas = document.createElement("canvas");
  canvas.width = args.deck.canvas.width;
  canvas.height = args.deck.canvas.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("슬라이드 렌더링용 캔버스를 초기화하지 못했습니다.");
  }

  context.fillStyle = getSlideRenderBackgroundColor(args.slide, args.deck);
  context.fillRect(0, 0, canvas.width, canvas.height);
  await drawSlideRenderBackgroundImage(context, args.slide, canvas);
  context.drawImage(stageCanvas, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas);

  return new File(
    [blob],
    `slide-${String(args.slideNumber).padStart(2, "0")}-thumbnail-v${args.deck.version}.png`,
    {
      type: "image/png"
    },
  );
}

async function drawSlideRenderBackgroundImage(
  context: CanvasRenderingContext2D,
  slide: Slide,
  canvas: HTMLCanvasElement
) {
  const backgroundImage = slide.style.backgroundImage;

  if (!backgroundImage?.src) {
    return;
  }

  const image = await loadCanvasImage(backgroundImage.src);

  if (!image) {
    return;
  }

  const frame = getBackgroundImageDrawFrame({
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    fit: backgroundImage.fit,
    imageHeight: image.naturalHeight || image.height,
    imageWidth: image.naturalWidth || image.width
  });

  context.save();
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
  context.fillStyle = `rgba(255,255,255,${clampBackgroundOverlayOpacity(backgroundImage.opacity)})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

async function loadCanvasImage(url: string) {
  if (!url || typeof window === "undefined") {
    return null;
  }

  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new window.Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = resolveEditorAssetUrl(url);

    if (image.complete && image.naturalWidth > 0) {
      resolve(image);
    }
  });
}

function getBackgroundImageDrawFrame(args: {
  canvasHeight: number;
  canvasWidth: number;
  fit: NonNullable<Slide["style"]["backgroundImage"]>["fit"];
  imageHeight: number;
  imageWidth: number;
}) {
  const { canvasHeight, canvasWidth, fit, imageHeight, imageWidth } = args;

  if (fit === "stretch" || imageWidth <= 0 || imageHeight <= 0) {
    return {
      height: canvasHeight,
      width: canvasWidth,
      x: 0,
      y: 0
    };
  }

  const scale =
    fit === "contain"
      ? Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight)
      : Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    height,
    width,
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2
  };
}

async function loadImageAsset(url: string) {
  if (!url || typeof window === "undefined") {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const image = new window.Image();

    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = resolveEditorAssetUrl(url);

    if (image.complete && image.naturalWidth > 0) {
      resolve(true);
    }
  });
}

function collectSlideAssetUrls(slide: Slide) {
  const urls = new Set<string>();

  if (slide.style.backgroundImage?.src) {
    urls.add(slide.style.backgroundImage.src);
  }

  for (const element of slide.elements) {
    if (element.type === "image" && element.props.src) {
      urls.add(element.props.src);
    }
  }

  return [...urls];
}

async function waitForSlideAssets(slide: Slide) {
  const assetUrls = collectSlideAssetUrls(slide);

  const results = await Promise.all(assetUrls.map((url) => loadImageAsset(url)));
  return results.filter((result) => !result).length;
}

function normalizeDeckAssetUrls(deck: Deck) {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      thumbnailUrl: slide.thumbnailUrl
        ? normalizeEditorAssetUrl(slide.thumbnailUrl)
        : slide.thumbnailUrl,
      style: slide.style.backgroundImage?.src
        ? {
            ...slide.style,
            backgroundImage: {
              ...slide.style.backgroundImage,
              src: normalizeEditorAssetUrl(slide.style.backgroundImage.src),
            },
          }
        : slide.style,
      elements: slide.elements.map((element) =>
        element.type === "image"
          ? {
              ...element,
              props: {
                ...element.props,
                src: normalizeEditorAssetUrl(element.props.src),
              },
            }
          : element,
      ),
    })),
  } satisfies Deck;
}

function createSlideScopedUploadFile(
  file: File,
  slideNumber: number,
  kind: "image" | "thumbnail",
) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const label = kind === "thumbnail" ? "thumbnail" : "image";

  return new File(
    [file],
    `slide-${String(slideNumber).padStart(2, "0")}-${label}.${extension}`,
    {
      type: file.type,
      lastModified: file.lastModified,
    },
  );
}

function createSeedDeck(projectId: string): Deck {
  return {
    ...createDemoDeck(),
    projectId
  };
}

async function fetchProjectDeck(projectId: string): Promise<Deck | null> {
  const response = await fetch(`/api/v1/projects/${projectId}/deck`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Deck fetch failed"));
  }

  const payload = getDeckResponseSchema.parse(await response.json());
  return payload.deck;
}

function navigateToRehearsal(projectId: string) {
  window.history.pushState({}, "", `/rehearsal/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
async function putProjectDeck(projectId: string, deck: Deck): Promise<Deck> {
  const response = await fetch(`/api/v1/projects/${projectId}/deck`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      deck,
      snapshotReason: "deck-replaced"
    })
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Deck bootstrap failed"));
  }

  const payload = putDeckResponseSchema.parse(await response.json());
  return payload.deck;
}

async function appendProjectDeckPatch(
  projectId: string,
  patch: DeckPatch
): Promise<Deck> {
  const response = await fetch(`/api/v1/projects/${projectId}/deck/patches`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      patch,
      snapshotReason: "patch-applied"
    })
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Deck save failed"));
  }

  const payload = appendDeckPatchResponseSchema.parse(await response.json());
  return payload.deck;
}

async function fetchDeck(projectId: string): Promise<Deck> {
  const storedDeck = await fetchProjectDeck(projectId);

  if (storedDeck) {
    return storedDeck;
  }

  return putProjectDeck(projectId, createSeedDeck(projectId));
}

export function EditorShell(props: { projectId?: string }) {
  const projectId = props.projectId ?? demoIds.projectId;
  const queryClient = useQueryClient();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isDataViewOpen, setIsDataViewOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isSlidesPaneCollapsed, setIsSlidesPaneCollapsed] = useState(false);
  const [slidesPaneWidth, setSlidesPaneWidth] = useState(defaultSlidesPaneWidth);
  const [rightPaneWidth, setRightPaneWidth] = useState(defaultRightPaneWidth);
  const [slidePanelView, setSlidePanelView] =
    useState<SlidePanelView>("thumbnail");
  const [showIds, setShowIds] = useState(false);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [activeTopMenu, setActiveTopMenu] = useState<TopMenu | null>(null);
  const [lastPatchLabel, setLastPatchLabel] = useState("편집 없음");
  const [insertTool, setInsertTool] = useState<InsertTool>("select");
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [customShapeEditElementId, setCustomShapeEditElementId] = useState<
    string | null
  >(null);
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const [shapeMenuPosition, setShapeMenuPosition] =
    useState<ShapeMenuPosition | null>(null);
  const [elementContextMenu, setElementContextMenu] =
    useState<ElementContextMenuState | null>(null);
  const [imageUploadNotice, setImageUploadNotice] = useState<{
    message: string;
    tone: ToolbarNoticeTone;
  } | null>(null);
  const [isImageUploadPending, setIsImageUploadPending] = useState(false);
  const [isRehearsalPreparing, setIsRehearsalPreparing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Deck[]>([]);
  const [redoStack, setRedoStack] = useState<Deck[]>([]);
  const topbarRef = useRef<HTMLElement | null>(null);
  const shapeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const copiedElementRef = useRef<ElementClipboardState | null>(null);
  const editorStageRef = useRef<Konva.Stage | null>(null);
  const slideRenderStageRefs = useRef(new Map<string, Konva.Stage>());
  const [renderingDeck, setRenderingDeck] = useState<Deck | null>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });

  const deckQuery = useQuery({
    queryKey: ["deck", projectId],
    queryFn: () => fetchDeck(projectId),
    retry: false
  });

  const loadedDeck = deckQuery.data ?? fallbackDeck;
  const [deck, setDeck] = useState<Deck>(loadedDeck);
  const deckRef = useRef(loadedDeck);
  const imageUploadTargetRef = useRef<ImageUploadTarget | null>(null);
  const resolvedUploadProjectIdRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const hasHydratedPersistedDeckRef = useRef(false);
  const hasLocalOptimisticChangesRef = useRef(false);
  const isUsingFallbackDeck = !deckQuery.data;
  const isDeckLoading = deckQuery.isPending;
  const isDeckError = deckQuery.isError;
  const canStartRehearsal =
    Boolean(deckQuery.data?.projectId) &&
    !isDeckLoading &&
    !isDeckError &&
    !isRehearsalPreparing;
  const hasSlides = deck.slides.length > 0;
  const currentSlide = deck.slides[currentSlideIndex] ?? deck.slides[0] ?? null;
  const saveStatusLabel = getEditorStatusLabel({
    isDeckError,
    isDeckLoading,
    isUsingFallbackDeck,
    saveState
  });
  const visibleElements = currentSlide
    ? getRenderableSlideElements(currentSlide, deck.canvas)
    : [];
  const stageScale = 0.44;
  const currentSlideAnimations = useMemo(
    () =>
      currentSlide
        ? [...currentSlide.animations].sort(
            (left, right) => left.order - right.order
          )
        : [],
    [currentSlide]
  );
  const selectedKeyword =
    currentSlide?.keywords.find(
      (keyword) => keyword.keywordId === selectedKeywordId
    ) ?? null;
  const selectedElementId = selectedElementIds.at(-1) ?? null;
  const selectedElements = visibleElements.filter((element) =>
    selectedElementIds.includes(element.elementId)
  );
  const selectedElement =
    selectedElementIds.length === 1
      ? selectedElements.find((element) => element.elementId === selectedElementId) ?? null
      : null;
  const isCustomShapeEditingSelection =
    selectedElement?.type === "customShape" &&
    selectedElement.elementId === customShapeEditElementId;
  const isDev = import.meta.env.DEV;
  const fileMenuItems = [
    { icon: FolderPlus, label: "새 프레젠테이션", meta: "빈 덱" },
    { icon: Upload, label: "PPTX 가져오기", meta: "업로드" },
    {
      icon: Cloud,
      label: saveState === "saving" ? "저장 중..." : "저장",
      meta: saveErrorMessage
        ? "저장 실패"
        : deckQuery.data
          ? saveStatusLabel
          : "demo fallback"
    }
  ];
  const exportMenuItems = [
    { icon: Download, label: "PPTX 내보내기" },
    { icon: Download, label: "PDF 내보내기" },
    { icon: Download, label: "PNG 내보내기" },
    { icon: Download, label: "JSON 백업 내보내기" }
  ];
  const resizeMenuItems = [
    {
      label: "와이드 16:9",
      meta: "1920 × 1080",
      active: deck.canvas.preset === "wide-16-9"
    },
    {
      label: "표준 4:3",
      meta: "1024 × 768",
      active: deck.canvas.preset === "standard-4-3"
    }
  ];
  const editModeItems = [
    { label: "편집 중", meta: "텍스트와 오브젝트 수정", active: true },
    { label: "보기 전용", meta: "슬라이드 탐색만" },
    { label: "검토", meta: "코멘트 중심" }
  ];
  const quickEditItems = [
    { icon: PenLine, label: "슬라이드 제목 수정" },
    { icon: FileText, label: "발표 메모 편집" },
    { icon: Wand2, label: "선택 요소 속성" }
  ];
  const presentationItems = [
    { icon: Presentation, label: "발표 시작", meta: "현재 슬라이드부터" },
    { icon: MonitorPlay, label: "발표자 보기", meta: "메모와 타이머 포함" },
    { icon: Sparkles, label: "리허설 시작", meta: "키워드 체크" },
    { icon: Share2, label: "청중 링크/QR", meta: "공유 준비" }
  ];

  useEffect(() => {
    const persistedDeck = deckQuery.data;

    if (!persistedDeck) {
      return;
    }

    if (
      !shouldHydrateDeckFromQuery({
        currentDeck: deckRef.current,
        nextDeck: persistedDeck,
        hasHydratedPersistedDeck: hasHydratedPersistedDeckRef.current,
        hasLocalOptimisticChanges: hasLocalOptimisticChangesRef.current
      })
    ) {
      return;
    }

    hasHydratedPersistedDeckRef.current = true;
    hasLocalOptimisticChangesRef.current = false;
    deckRef.current = persistedDeck;
    setDeck(persistedDeck);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
  }, [deckQuery.data]);

  useEffect(() => {
    if (!deckQuery.data?.projectId) {
      return;
    }

    resolvedUploadProjectIdRef.current = deckQuery.data.projectId;
  }, [deckQuery.data]);

  function handleAiSuggestionApplied(response: ApplyAiSuggestionResponse) {
    queryClient.setQueryData(["deck", projectId], response.deck);
    deckRef.current = response.deck;
    setDeck(response.deck);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    setLastPatchLabel(
      `${response.changeRecord.operations[0]?.type ?? "ai suggestion"} · v${response.deck.version}`
    );
    setSaveState("idle");
    setSaveErrorMessage(null);
  }

  function applyPersistedDeckState(nextDeck: Deck) {
    queryClient.setQueryData(["deck", projectId], nextDeck);
    deckRef.current = nextDeck;
    hasHydratedPersistedDeckRef.current = true;
    hasLocalOptimisticChangesRef.current = false;
    flushSync(() => {
      setDeck(nextDeck);
    });
  }

  async function syncSlideRenderAssets(
    activeProjectId: string,
    sourceDeck: Deck
  ) {
    if (sourceDeck.slides.length === 0) {
      return {
        deck: sourceDeck,
        missingAssetCount: 0,
      };
    }

    const nextDeck = structuredClone(normalizeDeckAssetUrls(sourceDeck));
    let missingAssetCount = 0;
    slideRenderStageRefs.current.clear();
    flushSync(() => {
      setRenderingDeck(nextDeck);
    });
    await waitForAnimationFrame();
    await waitForAnimationFrame();

    try {
      for (let index = 0; index < nextDeck.slides.length; index += 1) {
        const slide = nextDeck.slides[index];
        missingAssetCount += await waitForSlideAssets(slide);

        await waitForAnimationFrame();

        const stage = slideRenderStageRefs.current.get(slide.slideId);

        if (!stage) {
          throw new Error("슬라이드 렌더링 스테이지를 찾지 못했습니다.");
        }

        const renderFile = await createSlideRenderFile({
          deck: nextDeck,
          slide,
          stage,
          stageScale: 1,
          slideNumber: slide.order || index + 1,
        });
        const uploaded = await uploadProjectAsset(
          activeProjectId,
          createSlideScopedUploadFile(
            renderFile,
            slide.order || index + 1,
            "thumbnail",
          ),
          "thumbnail"
        );

        slide.thumbnailUrl = normalizeEditorAssetUrl(uploaded.url);
      }
    } finally {
      flushSync(() => {
        setRenderingDeck(null);
      });
      slideRenderStageRefs.current.clear();
    }

    return {
      deck: nextDeck,
      missingAssetCount,
    };
  }

  async function handleSaveDeck() {
    const activeProjectId = deckRef.current.projectId || deckQuery.data?.projectId;

    if (!activeProjectId) {
      setSaveState("error");
      setSaveErrorMessage("저장할 프로젝트를 찾지 못했습니다.");
      return;
    }

    setSaveState("saving");
    setSaveErrorMessage(null);
    setActiveTopMenu(null);

    const deckSnapshot = structuredClone(normalizeDeckAssetUrls(deckRef.current));

    try {
      await saveQueueRef.current.catch(() => undefined);

      const persistedDeck = await putProjectDeck(activeProjectId, deckSnapshot);
      let finalDeck = persistedDeck;

      if (
        shouldApplyManualSaveResult({
          snapshotDeck: deckSnapshot,
          currentDeck: deckRef.current,
        })
      ) {
        applyPersistedDeckState(persistedDeck);
      }

      try {
        const renderResult = await syncSlideRenderAssets(
          activeProjectId,
          finalDeck
        );

        finalDeck = await putProjectDeck(activeProjectId, renderResult.deck);

        if (
          shouldApplyManualSaveResult({
            snapshotDeck: deckSnapshot,
            currentDeck: deckRef.current,
          })
        ) {
          applyPersistedDeckState(finalDeck);
        }
        setImageUploadNotice({
          message:
            renderResult.missingAssetCount > 0
              ? `${finalDeck.slides.length}개 슬라이드 이미지 저장 완료 · 누락 이미지 ${renderResult.missingAssetCount}개`
              : `${finalDeck.slides.length}개 슬라이드 이미지 저장 완료`,
          tone: renderResult.missingAssetCount > 0 ? "info" : "success"
        });
        setLastPatchLabel(`수동 저장 · v${finalDeck.version}`);
        setSaveState("idle");
        setSaveErrorMessage(null);
      } catch (renderError) {
        if (
          shouldApplyManualSaveResult({
            snapshotDeck: deckSnapshot,
            currentDeck: deckRef.current,
          })
        ) {
          applyPersistedDeckState(persistedDeck);
        }
        setImageUploadNotice({
          message: "덱 저장 완료, 슬라이드 이미지 저장 실패",
          tone: "danger"
        });
        setLastPatchLabel(`수동 저장 · 렌더 실패 · v${persistedDeck.version}`);
        setSaveState("error");
        setSaveErrorMessage(toEditorErrorMessage(renderError));
      }
    } catch (error) {
      setLastPatchLabel(`저장 실패 · ${toEditorErrorMessage(error)}`);
      setSaveState("error");
      setSaveErrorMessage(toEditorErrorMessage(error));
      void deckQuery.refetch();
    }
  }

  async function handleStartRehearsal() {
    const activeProjectId = deckQuery.data?.projectId ?? projectId;

    if (isDeckLoading || !deckQuery.data) {
      setSaveState("pending");
      setSaveErrorMessage("발표 자료를 불러온 뒤 리허설을 시작할 수 있습니다.");
      return;
    }

    if (isRehearsalPreparing) {
      return;
    }

    if (!activeProjectId) {
      setSaveState("error");
      setSaveErrorMessage("저장할 프로젝트를 찾지 못했습니다.");
      return;
    }

    setIsRehearsalPreparing(true);
    setSaveState("saving");
    setSaveErrorMessage(null);
    setActiveTopMenu(null);

    try {
      await saveQueueRef.current.catch(() => undefined);

      const deckSnapshot = structuredClone(normalizeDeckAssetUrls(deckRef.current));
      const persistedDeck = await putProjectDeck(activeProjectId, deckSnapshot);
      const renderResult = await syncSlideRenderAssets(activeProjectId, persistedDeck);

      if (
        !shouldApplyManualSaveResult({
          snapshotDeck: deckSnapshot,
          currentDeck: deckRef.current
        })
      ) {
        throw new Error("리허설 준비 중 편집 내용이 변경되었습니다. 다시 시작해 주세요.");
      }

      const finalDeck =
        renderResult.deck.slides.length > 0
          ? await appendProjectDeckPatch(activeProjectId, {
              baseVersion: persistedDeck.version,
              deckId: persistedDeck.deckId,
              operations: renderResult.deck.slides.map((slide) => ({
                slideId: slide.slideId,
                thumbnailUrl: slide.thumbnailUrl,
                type: "update_slide" as const
              })),
              source: "system"
            })
          : persistedDeck;

      applyPersistedDeckState(finalDeck);
      setImageUploadNotice({
        message:
          renderResult.missingAssetCount > 0
            ? `${finalDeck.slides.length}개 슬라이드 이미지 저장 완료 · 누락 이미지 ${renderResult.missingAssetCount}개`
            : `${finalDeck.slides.length}개 슬라이드 이미지 저장 완료`,
        tone: renderResult.missingAssetCount > 0 ? "info" : "success"
      });
      setLastPatchLabel(`리허설 준비 완료 · v${finalDeck.version}`);
      setSaveState("idle");
      setSaveErrorMessage(null);
      navigateToRehearsal(activeProjectId);
    } catch (error) {
      const message = toEditorErrorMessage(error);

      setLastPatchLabel(`리허설 준비 실패 · ${message}`);
      setSaveState("error");
      setSaveErrorMessage(message);
      setImageUploadNotice({
        message: "리허설용 슬라이드 이미지 저장 실패",
        tone: "danger"
      });
    } finally {
      setIsRehearsalPreparing(false);
    }
  }

  function commitPatch(patch: DeckPatch, baseDeck: Deck = deckRef.current) {
    const result = applyDeckPatch(baseDeck, patch);

    if (!result.ok) {
      setLastPatchLabel(`실패 · ${result.error.code}`);
      return;
    }

    deckRef.current = result.deck;
    hasLocalOptimisticChangesRef.current = true;
    setSaveState("pending");
    setSaveErrorMessage(null);
    setUndoStack((current) => [...current.slice(-49), baseDeck]);
    setRedoStack([]);
    setDeck(result.deck);
    setLastPatchLabel(
      `${result.changeRecord.operations[0]?.type ?? "patch"} · v${result.metadata.nextVersion}`
    );

    if (!deckQuery.data?.projectId) {
      return;
    }

    queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
      mergeDeckIntoQueryCache(current, result.deck)
    );

    pendingSaveCountRef.current += 1;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setSaveState("saving");
        const persistedDeck = await appendProjectDeckPatch(deckQuery.data.projectId, patch);

        queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
          mergeDeckIntoQueryCache(current, persistedDeck)
        );

        if (persistedDeck.version >= deckRef.current.version) {
          hasHydratedPersistedDeckRef.current = true;
          hasLocalOptimisticChangesRef.current = false;
        }
      })
      .catch((error: unknown) => {
        setLastPatchLabel(`저장 실패 · ${toEditorErrorMessage(error)}`);
        setSaveState("error");
        setSaveErrorMessage(toEditorErrorMessage(error));
        void deckQuery.refetch();
      })
      .finally(() => {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
        if (pendingSaveCountRef.current === 0) {
          setSaveState("idle");
        } else {
          setSaveState("pending");
        }
      });
  }

  function handleElementSelection(elementId: string, options?: { append?: boolean }) {
    setElementContextMenu(null);
    setCustomShapeEditElementId((current) =>
      current === elementId && !options?.append ? current : null
    );

    if (options?.append) {
      setEditingElementId(null);
      setSelectedElementIds((current) =>
        current.includes(elementId)
          ? current.filter((currentElementId) => currentElementId !== elementId)
          : [...current, elementId]
      );
      return;
    }

    setSelectedElementIds([elementId]);
  }

  function handleUndo() {
    setUndoStack((current) => {
      const previous = current.at(-1);
      if (!previous) {
        return current;
      }
      const currentDeck = deckRef.current;
      deckRef.current = previous;
      setRedoStack((redoCurrent) => [...redoCurrent, currentDeck]);
      setDeck(previous);
      setLastPatchLabel(`undo · v${previous.version}`);
      return current.slice(0, -1);
    });
  }

  function handleRedo() {
    setRedoStack((current) => {
      const next = current.at(-1);
      if (!next) {
        return current;
      }
      setUndoStack((undoCurrent) => [...undoCurrent.slice(-49), deckRef.current]);
      deckRef.current = next;
      setDeck(next);
      setLastPatchLabel(`redo · v${next.version}`);
      return current.slice(0, -1);
    });
  }

  function handleElementPropsChange(
    slideId: string,
    elementId: string,
    props: Record<string, unknown>
  ) {
    commitPatch(createUpdateElementPropsPatch(deck, slideId, elementId, props));
  }

  function handleSlideStyleChange(
    slideId: string,
    style: {
      backgroundColor?: string | null;
      textColor?: string | null;
      accentColor?: string | null;
    }
  ) {
    commitPatch({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [
        {
          type: "update_slide_style",
          slideId,
          style
        }
      ]
    });
  }

  function openImageFilePicker(target: ImageUploadTarget) {
    if (isImageUploadPending) {
      return;
    }

    setElementContextMenu(null);
    imageUploadTargetRef.current = target;
    imageFileInputRef.current?.click();
  }

  function rememberUploadProject(projectId: string) {
    resolvedUploadProjectIdRef.current = projectId;
  }

  async function resolveUploadProject(targetProjectId: string) {
    if (resolvedUploadProjectIdRef.current) {
      return resolvedUploadProjectIdRef.current;
    }

    if (deckQuery.data?.projectId) {
      rememberUploadProject(deckQuery.data.projectId);
      return deckQuery.data.projectId;
    }

    const projects = await fetchProjects();
    const preferredProject = projects.find(
      (project) => project.projectId === targetProjectId
    );
    const project = preferredProject ?? projects[0] ?? (await createProject(editorUploadProjectTitle));

    rememberUploadProject(project.projectId);
    return project.projectId;
  }

  async function handleImageFileSelection(
    file: File,
    target: ImageUploadTarget
  ) {
    const validationMessage = getEditorImageValidationMessage(file);

    if (validationMessage) {
      setImageUploadNotice({
        message: validationMessage,
        tone: "danger"
      });
      return;
    }

    setImageUploadNotice({
      message: `${file.name} 업로드 중...`,
      tone: "info"
    });
    setIsImageUploadPending(true);

    try {
      const activeDeck = deckRef.current;
      const targetSlideIndex = activeDeck.slides.findIndex(
        (slide) => slide.slideId === target.slideId
      );

      if (targetSlideIndex < 0) {
        throw new Error("이미지를 넣을 슬라이드를 찾지 못했습니다.");
      }

      const targetSlide = activeDeck.slides[targetSlideIndex];
      const uploadProjectId = await resolveUploadProject(deckRef.current.projectId);
      const uploaded = await uploadProjectAsset(
        uploadProjectId,
        createSlideScopedUploadFile(file, targetSlide.order || targetSlideIndex + 1, "image"),
        "reference-material"
      );
      const normalizedUploadedUrl = normalizeEditorAssetUrl(uploaded.url);

      if (target.type === "replace") {
        const targetElement = targetSlide.elements.find(
          (element) => element.elementId === target.elementId
        );

        if (!targetElement || targetElement.type !== "image") {
          throw new Error("교체할 이미지 요소를 찾지 못했습니다.");
        }

        commitPatch(
          createUpdateElementPropsPatch(activeDeck, target.slideId, target.elementId, {
            alt: file.name,
            src: normalizedUploadedUrl
          }),
          activeDeck
        );
        setCurrentSlideIndex(targetSlideIndex);
        setSelectedElementIds([target.elementId]);
      } else {
        const elementId = createElementId(activeDeck);
        const naturalSize = await readImageNaturalSize(file).catch(() => ({
          height: defaultImageInsertFrame.height,
          width: defaultImageInsertFrame.width
        }));
        const frame = getDefaultImageInsertFrame(activeDeck.canvas, naturalSize);

        commitPatch(
          createAddElementPatch(activeDeck, target.slideId, {
            elementId,
            type: "image",
            role: "media",
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            rotation: 0,
            opacity: 1,
            zIndex: getNextElementZIndex(targetSlide.elements),
            locked: false,
            visible: true,
            props: {
              alt: file.name,
              fit: "contain",
              src: normalizedUploadedUrl
            }
          }),
          activeDeck
        );
        setCurrentSlideIndex(targetSlideIndex);
        setSelectedElementIds([elementId]);
        setEditingElementId(null);
        setInsertTool("select");
      }

      setImageUploadNotice({
        message: `${file.name} 업로드 완료`,
        tone: "success"
      });
    } catch (error) {
      setImageUploadNotice({
        message: toEditorErrorMessage(error),
        tone: "danger"
      });
    } finally {
      setIsImageUploadPending(false);
    }
  }

  function handleImageFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? []);
    const target = imageUploadTargetRef.current;

    event.target.value = "";
    imageUploadTargetRef.current = null;

    if (!file || !target) {
      return;
    }

    void handleImageFileSelection(file, target);
  }

  function handleAddTextElement() {
    if (!currentSlide) {
      return;
    }

    const elementId = createElementId(deck);
    commitPatch(
      createAddElementPatch(deck, currentSlide.slideId, {
        elementId,
        type: "text",
        role: "body",
        x: 180,
        y: 180,
        width: 360,
        height: 96,
        rotation: 0,
        opacity: 1,
        zIndex: getNextElementZIndex(currentSlide.elements),
        locked: false,
        visible: true,
        props: {
          text: "새 텍스트",
          fontFamily:
            currentSlide.style.fontFamily ?? deck.theme.typography.bodyFontFamily,
          fontSize: deck.theme.typography.bodySize,
          fontWeight: "normal",
          color: currentSlide.style.textColor ?? deck.theme.textColor,
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      })
    );
    setSelectedElementIds([elementId]);
    setEditingElementId(elementId);
    setInsertTool("select");
  }

  function handleAddChartElement() {
    if (!currentSlide) {
      return;
    }

    const elementId = createElementId(deck);
    commitPatch(
      createAddElementPatch(deck, currentSlide.slideId, {
        elementId,
        type: "chart",
        role: "chart",
        x: 240,
        y: 180,
        width: 520,
        height: 280,
        rotation: 0,
        opacity: 1,
        zIndex: getNextElementZIndex(currentSlide.elements),
        locked: false,
        visible: true,
        props: {
          type: "bar",
          title: "새 차트",
          data: [
            { label: "A", value: 48 },
            { label: "B", value: 72 },
            { label: "C", value: 56 }
          ],
          style: {
            colors: ["#2563eb", "#0ea5e9", "#7c3aed"],
            backgroundColor: "#ffffff",
            textColor: "#111827",
            fontFamily: deck.theme.typography.bodyFontFamily,
            titleFontSize: 20,
            axisLabelFontSize: 12,
            legendFontSize: 12,
            dataLabelFontSize: 12,
            showLegend: true,
            legendPosition: "bottom",
            showDataLabels: true,
            showGrid: true,
            xAxisTitle: "",
            yAxisTitle: "",
            unit: ""
          }
        }
      })
    );
    setSelectedElementIds([elementId]);
  }

  function handleInsertShapeElement(shapeType: ShapeInsertType) {
    if (!currentSlide) {
      return;
    }

    if (shapeType === "customShape") {
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setSelectedElementIds([]);
      setInsertTool("customShape");
      setIsShapeMenuOpen(false);
      return;
    }

    const elementId = createElementId(deck);
    const defaultFrameByShape: Record<
      ShapeInsertType,
      { x: number; y: number; width: number; height: number }
    > = {
      rect: { x: 260, y: 220, width: 280, height: 160 },
      ellipse: { x: 260, y: 220, width: 180, height: 180 },
      line: { x: 240, y: 280, width: 320, height: 12 },
      arrow: { x: 240, y: 280, width: 360, height: 28 },
      triangle: { x: 260, y: 220, width: 180, height: 180 },
      polygon: { x: 260, y: 220, width: 180, height: 180 },
      star: { x: 260, y: 220, width: 180, height: 180 },
      customShape: { x: 260, y: 220, width: 220, height: 160 }
    };
    const frame = defaultFrameByShape[shapeType];
    const baseElement = {
      elementId,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rotation: 0,
      opacity: 1,
      zIndex: getNextElementZIndex(currentSlide.elements),
      locked: false,
      visible: true
    } as const;
    let nextElement: DeckElement;

    const nextShapeType = shapeType === "triangle" ? "polygon" : shapeType;
    nextElement = {
      ...baseElement,
      type: nextShapeType,
      role: shapeType === "line" || shapeType === "arrow" ? "decoration" : "highlight",
      props: {
        fill: shapeType === "line" || shapeType === "arrow" ? "transparent" : "#dbeafe",
        stroke: "#2563eb",
        strokeWidth: 3,
        borderRadius: 18,
        ...(shapeType === "triangle"
          ? { sides: 3 }
          : shapeType === "polygon"
            ? { sides: 6 }
            : {})
      } as ShapeElementProps
    };

    commitPatch(createAddElementPatch(deck, currentSlide.slideId, nextElement));
    setSelectedElementIds([elementId]);
    setInsertTool("select");
    setIsShapeMenuOpen(false);
  }

  function handleAddSlide() {
    const slideId = createSlideId(deck);
    const nextOrder = deck.slides.length + 1;
    commitPatch(
      createAddSlidePatch(deck, {
        slideId,
        order: nextOrder,
        title: `Slide ${nextOrder}`,
        thumbnailUrl: "",
        style: {
          layout: "title-content",
          backgroundColor: deck.theme.backgroundColor,
          textColor: deck.theme.textColor,
          accentColor: deck.theme.accentColor
        },
        speakerNotes: "",
        keywords: [],
        elements: [
          {
            elementId: createElementId(deck),
            type: "text",
            role: "title",
            x: 120,
            y: 96,
            width: 720,
            height: 96,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            locked: false,
            visible: true,
            props: {
              text: `Slide ${nextOrder}`,
              fontFamily: deck.theme.typography.headingFontFamily,
              fontSize: deck.theme.typography.titleSize,
              fontWeight: "bold",
              color: deck.theme.textColor,
              align: "left",
              verticalAlign: "top",
              lineHeight: 1.1
            }
          }
        ],
        animations: []
      })
    );
    setCurrentSlideIndex(deck.slides.length);
    setSelectedElementIds([]);
  }

  function handleDeleteSelectedElement() {
    if (!currentSlide || selectedElementIds.length === 0) {
      return;
    }

    setElementContextMenu(null);
    commitPatch({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: selectedElementIds.map((elementId) => ({
        type: "delete_element" as const,
        slideId: currentSlide.slideId,
        elementId
      }))
    });
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
  }

  function cloneElementToCurrentSlide(sourceElement: DeckElement, offsetMultiplier = 1) {
    if (!currentSlide) {
      return null;
    }

    const nextElementId = createElementId(deck);
    const nextZIndex =
      currentSlide.elements.reduce(
        (highestZIndex, element) => Math.max(highestZIndex, element.zIndex),
        0
      ) + 1;
    const offset = 24 * offsetMultiplier;

    commitPatch(
      createAddElementPatch(deck, currentSlide.slideId, {
        ...structuredClone(sourceElement),
        elementId: nextElementId,
        x: sourceElement.x + offset,
        y: sourceElement.y + offset,
        zIndex: nextZIndex
      })
    );

    setSelectedElementIds([nextElementId]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);

    return nextElementId;
  }

  function handleDuplicateSelectedElement() {
    if (!currentSlide || !selectedElement) {
      return;
    }

    setElementContextMenu(null);
    cloneElementToCurrentSlide(selectedElement);
  }

  function handleCopySelectedElement() {
    if (!selectedElement) {
      return;
    }

    setElementContextMenu(null);
    copiedElementRef.current = {
      element: structuredClone(selectedElement),
      pasteCount: 0
    };
  }

  function handlePasteCopiedElement() {
    if (!currentSlide || !copiedElementRef.current) {
      return;
    }

    setElementContextMenu(null);
    const { element, pasteCount } = copiedElementRef.current;
    const nextPasteCount = pasteCount + 1;

    cloneElementToCurrentSlide(element, nextPasteCount);
    copiedElementRef.current = {
      element,
      pasteCount: nextPasteCount
    };
  }

  function handleCreateDrawnElement(
    draft:
      | {
          type: "text";
          x: number;
          y: number;
          width: number;
          height: number;
        }
      | {
          type: "rect" | "ellipse" | "line";
          x: number;
          y: number;
          width: number;
          height: number;
        }
  ) {
    if (!currentSlide) {
      return;
    }

    const elementId = createElementId(deck);

    if (draft.type === "text") {
      commitPatch(
        createAddElementPatch(deck, currentSlide.slideId, {
          elementId,
          type: "text",
          role: "body",
          x: draft.x,
          y: draft.y,
          width: draft.width,
          height: draft.height,
          rotation: 0,
          opacity: 1,
          zIndex: getNextElementZIndex(currentSlide.elements),
          locked: false,
          visible: true,
          props: {
            text: "텍스트 입력",
            fontFamily:
              currentSlide.style.fontFamily ?? deck.theme.typography.bodyFontFamily,
            fontSize: deck.theme.typography.bodySize,
            fontWeight: "normal",
            color: currentSlide.style.textColor ?? deck.theme.textColor,
            align: "left",
            verticalAlign: "top",
            lineHeight: 1.2
          }
        })
      );
      setEditingElementId(elementId);
    } else {
      commitPatch(
        createAddElementPatch(deck, currentSlide.slideId, {
          elementId,
          type: draft.type,
          role: draft.type === "line" ? "decoration" : "highlight",
          x: draft.x,
          y: draft.y,
          width: Math.max(8, draft.width),
          height: Math.max(draft.type === "line" ? 8 : 8, draft.height),
          rotation: 0,
          opacity: 1,
          zIndex: getNextElementZIndex(currentSlide.elements),
          locked: false,
          visible: true,
          props: {
            fill: draft.type === "line" ? "transparent" : "#dbeafe",
            stroke: "#2563eb",
            strokeWidth: 3,
            borderRadius: 18
          }
        })
      );
    }

    setSelectedElementIds([elementId]);
    setInsertTool("select");
  }

  function handleCreateCustomShape(
    nodes: CustomShapeNode[],
    closed: boolean
  ) {
    if (!currentSlide || nodes.length < 2) {
      setInsertTool("select");
      return;
    }

    const elementId = createElementId(deck);
    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);

    commitPatch(
      createAddElementPatch(deck, currentSlide.slideId, {
        elementId,
        type: "customShape",
        role: "highlight",
        x: geometry.frame.x,
        y: geometry.frame.y,
        width: geometry.frame.width,
        height: geometry.frame.height,
        rotation: 0,
        opacity: 1,
        zIndex: getNextElementZIndex(currentSlide.elements),
        locked: false,
        visible: true,
        props: {
          closed: geometry.props.closed,
          fill: "#f5edff",
          nodes: geometry.props.nodes,
          stroke: "#9333ea",
          strokeWidth: 2,
          viewBoxWidth: geometry.props.viewBoxWidth,
          viewBoxHeight: geometry.props.viewBoxHeight,
          pathData: geometry.props.pathData
        }
      })
    );
    setSelectedElementIds([elementId]);
    setCustomShapeEditElementId(elementId);
    setInsertTool("select");
  }

  function handleCommitCustomShapeGeometry(
    slideId: string,
    elementId: string,
    nodes: CustomShapeNode[],
    closed: boolean
  ) {
    const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === elementId
    );

    if (!slide || !element || element.type !== "customShape" || nodes.length < 2) {
      return;
    }

    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);

    commitPatch({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [
        {
          type: "update_element_frame",
          slideId,
          elementId,
          frame: normalizeElementFrameDraft(deck.canvas, element, geometry.frame)
        },
        {
          type: "update_element_props",
          slideId,
          elementId,
          props: {
            closed: geometry.props.closed,
            nodes: geometry.props.nodes,
            pathData: geometry.props.pathData,
            viewBoxWidth: geometry.props.viewBoxWidth,
            viewBoxHeight: geometry.props.viewBoxHeight
          }
        }
      ]
    });
  }

  function handleElementFrameChange(
    slideId: string,
    elementId: string,
    frame: ElementFrameChange
  ) {
    const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === elementId
    );

    if (!slide || !element) {
      return;
    }

    try {
      commitPatch(
        element.type === "group"
          ? createGroupedElementFramePatch(deck, slideId, elementId, frame)
          : createElementFramePatch(deck, slideId, elementId, frame)
      );
    } catch (error) {
      setLastPatchLabel(
        error instanceof Error ? `실패 · ${error.message}` : "실패 · unknown"
      );
    }
  }

  function handleCreateGroupFromSelection() {
    if (!currentSlide || selectedElements.length < 2) {
      return;
    }

    const elementId = createElementId(deck);
    const bounds = getGroupedSelectionBounds(selectedElements);
    const highestZIndex = selectedElements.reduce(
      (currentHighest, element) => Math.max(currentHighest, element.zIndex),
      0
    );

    commitPatch(
      createAddElementPatch(deck, currentSlide.slideId, {
        elementId,
        type: "group",
        role: "decoration",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        opacity: 1,
        zIndex: highestZIndex + 1,
        locked: false,
        visible: true,
        props: {
          childElementIds: selectedElements.map((element) => element.elementId)
        }
      })
    );
    setElementContextMenu(null);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setSelectedElementIds([elementId]);
  }

  function handleUngroupElement(slideId: string, elementId: string) {
    const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
    const groupElement = slide?.elements.find(
      (candidate) => candidate.elementId === elementId
    );

    if (!slide || !groupElement || groupElement.type !== "group") {
      return;
    }

    const groupProps = groupElement.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    commitPatch({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [
        {
          type: "delete_element",
          slideId,
          elementId
        }
      ]
    });
    setElementContextMenu(null);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setSelectedElementIds(childElements.map((childElement) => childElement.elementId));
  }

  function handleCanvasBackgroundSelectionClear() {
    setElementContextMenu(null);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
  }

  function handleOpenElementContextMenu(args: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) {
    const isSelectedElement = selectedElementIds.includes(args.element.elementId);
    const isGroupingTarget = isSelectedElement && selectedElementIds.length > 1;

    if (
      !isGroupingTarget &&
      args.element.type !== "image" &&
      args.element.type !== "group"
    ) {
      return;
    }

    const { left, top } = getContextMenuPosition({
      clientX: args.clientX,
      clientY: args.clientY,
      height: 60,
      width: 196
    });

    setEditingElementId(null);

    if (isGroupingTarget) {
      setElementContextMenu({
        elementIds: selectedElementIds,
        left,
        slideId: args.slideId,
        top,
        type: "selection"
      });
      return;
    }

    setSelectedElementIds([args.element.elementId]);

    if (args.element.type === "group") {
      setElementContextMenu({
        elementId: args.element.elementId,
        left,
        slideId: args.slideId,
        top,
        type: "group"
      });
      return;
    }

    setElementContextMenu({
      elementId: args.element.elementId,
      left,
      slideId: args.slideId,
      top,
      type: "image"
    });
  }

  function handleSlidesPaneResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    setIsSlidesPaneCollapsed(false);

    const startX = event.clientX;
    const startWidth = isSlidesPaneCollapsed
      ? minSlidesPaneWidth
      : slidesPaneWidth;

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidth = Math.min(
        maxSlidesPaneWidth,
        Math.max(minSlidesPaneWidth, startWidth + pointerEvent.clientX - startX)
      );
      setSlidesPaneWidth(nextWidth);
    }

    function handlePointerUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleRightPaneResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = rightPaneWidth;

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidth = Math.min(
        maxRightPaneWidth,
        Math.max(
          minRightPaneWidth,
          startWidth + (startX - pointerEvent.clientX)
        )
      );
      setRightPaneWidth(nextWidth);
    }

    function handlePointerUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  useEffect(() => {
    if (!activeTopMenu) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!topbarRef.current?.contains(event.target as Node)) {
        setActiveTopMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveTopMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeTopMenu]);

  useEffect(() => {
    if (!isShapeMenuOpen) {
      setShapeMenuPosition(null);
      return;
    }

    function updateShapeMenuPosition() {
      const buttonRect = shapeMenuButtonRef.current?.getBoundingClientRect();
      if (!buttonRect) {
        setShapeMenuPosition(null);
        return;
      }

      const viewportPadding = 12;
      const popoverWidth = 196;
      const left = Math.min(
        Math.max(viewportPadding, buttonRect.left),
        Math.max(
          viewportPadding,
          window.innerWidth - popoverWidth - viewportPadding
        )
      );

      setShapeMenuPosition({
        left,
        top: buttonRect.bottom + 10
      });
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsShapeMenuOpen(false);
      }
    }

    updateShapeMenuPosition();
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("scroll", updateShapeMenuPosition, true);
    window.addEventListener("resize", updateShapeMenuPosition);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("scroll", updateShapeMenuPosition, true);
      window.removeEventListener("resize", updateShapeMenuPosition);
    };
  }, [isShapeMenuOpen]);

  useEffect(() => {
    if (
      selectedKeywordId &&
      !currentSlide?.keywords.some(
        (keyword) => keyword.keywordId === selectedKeywordId
      )
    ) {
      setSelectedKeywordId(null);
    }
  }, [currentSlide, selectedKeywordId]);

  useEffect(() => {
    setSelectedElementIds((current) =>
      current.filter((elementId) =>
        currentSlide?.elements.some((element) => element.elementId === elementId)
      )
    );
  }, [currentSlide]);

  useEffect(() => {
    if (
      customShapeEditElementId &&
      (selectedElementIds.length !== 1 ||
        selectedElementId !== customShapeEditElementId ||
        selectedElement?.type !== "customShape")
    ) {
      setCustomShapeEditElementId(null);
    }
  }, [
    customShapeEditElementId,
    selectedElement,
    selectedElementId,
    selectedElementIds.length
  ]);

  useEffect(() => {
    if (currentSlideIndex > 0 && currentSlideIndex >= deck.slides.length) {
      setCurrentSlideIndex(Math.max(0, deck.slides.length - 1));
    }
  }, [currentSlideIndex, deck.slides.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Test hook for reliable Playwright frame updates when Konva anchors are too brittle.
    window.__ORBIT_EDITOR_TEST_API__ = {
      updateSelectedElementFrame: (frame) => {
        if (!selectedElement || !currentSlide) {
          return false;
        }

        handleElementFrameChange(currentSlide.slideId, selectedElement.elementId, frame);
        return true;
      },
      updateCurrentSlideStyle: (style) => {
        if (!currentSlide) {
          return false;
        }

        handleSlideStyleChange(currentSlide.slideId, style);
        return true;
      }
    };

    return () => {
      delete window.__ORBIT_EDITOR_TEST_API__;
    };
  }, [currentSlide, selectedElement]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isEditableTarget = isKeyboardEditableTarget(event.target);

      if (
        !isEditableTarget &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }

      if (
        !isEditableTarget &&
        !isCustomShapeEditingSelection &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        if (
          selectedElementIds.length > 0 &&
          (!editingElementId ||
            selectedElementIds.length > 1 ||
            editingElementId !== selectedElementId)
        ) {
          event.preventDefault();
          handleDeleteSelectedElement();
        }
      }

      if (
        !isEditableTarget &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "d"
      ) {
        if (selectedElementIds.length === 1) {
          event.preventDefault();
          handleDuplicateSelectedElement();
        }
      }

      if (!isEditableTarget && (event.metaKey || event.ctrlKey)) {
        const normalizedKey = event.key.toLowerCase();

        if (normalizedKey === "c" && selectedElement) {
          event.preventDefault();
          handleCopySelectedElement();
        }

        if (normalizedKey === "v" && copiedElementRef.current) {
          event.preventDefault();
          handlePasteCopiedElement();
        }
      }

      if (event.key === "Escape") {
        if (isCustomShapeEditingSelection) {
          setCustomShapeEditElementId(null);
          return;
        }

        if (
          selectedElementIds.length > 0 &&
          (selectedElementIds.length > 1 || editingElementId !== selectedElementId)
        ) {
          setSelectedElementIds([]);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentSlide,
    deck,
    editingElementId,
    isCustomShapeEditingSelection,
    selectedElement,
    selectedElementId,
    selectedElementIds
  ]);

  useEffect(() => {
    if (!elementContextMenu) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setElementContextMenu(null);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [elementContextMenu]);

  const shapeMenuOverlay =
    typeof document !== "undefined" && isShapeMenuOpen && shapeMenuPosition
      ? createPortal(
          <div
            className="shape-menu-overlay"
            onMouseDown={() => setIsShapeMenuOpen(false)}
          >
            <div
              className="shape-menu-popover"
              role="menu"
              style={shapeMenuPosition}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="shape-menu-title">기본 도형</span>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("rect")}
              >
                <span className="shape-menu-symbol">▭</span>
                <span>사각형</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("ellipse")}
              >
                <span className="shape-menu-symbol">◯</span>
                <span>원</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("triangle")}
              >
                <span className="shape-menu-symbol">⬡</span>
                <span>삼각형</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("polygon")}
              >
                <span className="shape-menu-symbol">⬢</span>
                <span>다각형</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("star")}
              >
                <span className="shape-menu-symbol">★</span>
                <span>별</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("customShape")}
              >
                <PenLine size={14} />
                <span>커스텀 도형 그리기</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("line")}
              >
                <Minus size={14} />
                <span>선</span>
              </button>
              <button
                className="shape-menu-item"
                role="menuitem"
                type="button"
                onClick={() => handleInsertShapeElement("arrow")}
              >
                <MoveRight size={14} />
                <span>화살표</span>
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  const elementContextMenuOverlay =
    typeof document !== "undefined" && elementContextMenu
      ? createPortal(
          <div
            className="element-context-menu-overlay"
            onMouseDown={() => setElementContextMenu(null)}
          >
            <div
              className="element-context-menu-popover"
              role="menu"
              style={{
                left: elementContextMenu.left,
                top: elementContextMenu.top
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {elementContextMenu.type === "image" ? (
                <button
                  className="element-context-menu-item"
                  disabled={isImageUploadPending}
                  role="menuitem"
                  type="button"
                  onClick={() =>
                    openImageFilePicker({
                      elementId: elementContextMenu.elementId,
                      slideId: elementContextMenu.slideId,
                      type: "replace"
                    })
                  }
                >
                  <ImagePlus size={16} />
                  <span>{isImageUploadPending ? "업로드 중..." : "이미지 바꾸기"}</span>
                </button>
              ) : elementContextMenu.type === "group" ? (
                <button
                  className="element-context-menu-item"
                  role="menuitem"
                  type="button"
                  onClick={() =>
                    handleUngroupElement(
                      elementContextMenu.slideId,
                      elementContextMenu.elementId
                    )
                  }
                >
                  <Shapes size={16} />
                  <span>그룹 해제</span>
                </button>
              ) : (
                <button
                  className="element-context-menu-item"
                  role="menuitem"
                  type="button"
                  onClick={handleCreateGroupFromSelection}
                >
                  <Shapes size={16} />
                  <span>그룹</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <main
        aria-busy={isDeckLoading}
        className={`editor-app-shell orbit-shell ${isDeckLoading ? "is-deck-loading" : ""}`}
      >
        <header className="app-topbar" ref={topbarRef}>
        <div className="topbar-left">
          <img alt="Orbit" className="brand-mark" src={orbitLogo} />
          <button className="top-home-button" type="button" title="Home">
            <Home size={16} />
          </button>
          <div className="topbar-divider" />
          <div className="menu-stack">
            <div className="menu-row">
              <button
                aria-expanded={activeTopMenu === "file"}
                aria-haspopup="menu"
                className={`top-menu-button ${activeTopMenu === "file" ? "active" : ""}`}
                type="button"
                onClick={() =>
                  setActiveTopMenu((current) => (current === "file" ? null : "file"))
                }
              >
                파일 <ChevronDown size={14} />
              </button>
              <button
                aria-expanded={activeTopMenu === "resize"}
                aria-haspopup="menu"
                className={`top-menu-button ${activeTopMenu === "resize" ? "active" : ""}`}
                type="button"
                onClick={() =>
                  setActiveTopMenu((current) => (current === "resize" ? null : "resize"))
                }
              >
                크기 조정 <ChevronDown size={14} />
              </button>
              <button
                aria-expanded={activeTopMenu === "editMode"}
                aria-haspopup="menu"
                className={`top-menu-button ${activeTopMenu === "editMode" ? "active" : ""}`}
                type="button"
                onClick={() =>
                  setActiveTopMenu((current) =>
                    current === "editMode" ? null : "editMode"
                  )
                }
              >
                편집 중 <ChevronDown size={14} />
              </button>
              <button
                aria-expanded={activeTopMenu === "quickEdit"}
                aria-haspopup="menu"
                className={`top-icon-button ${activeTopMenu === "quickEdit" ? "active" : ""}`}
                type="button"
                title="Quick edit"
                onClick={() =>
                  setActiveTopMenu((current) =>
                    current === "quickEdit" ? null : "quickEdit"
                  )
                }
              >
                <PenLine size={15} />
              </button>
            </div>

            {activeTopMenu === "file" ? (
              <div className="file-menu-popover" role="menu">
                <div className="file-menu-header">
                  <div>
                    <strong>{deck.title}</strong>
                    <span>
                      프레젠테이션 · {deck.canvas.width} × {deck.canvas.height}px
                    </span>
                  </div>
                  <button className="menu-ghost-button" type="button" title="Rename">
                    <PenLine size={15} />
                  </button>
                </div>

                <div className="file-menu-list">
                  {fileMenuItems.map(({ icon: Icon, label, meta }) => (
                    <button
                      className="file-menu-item"
                      key={label}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        if (label.startsWith("저장")) {
                          void handleSaveDeck();
                        }
                      }}
                    >
                      <span className="file-menu-label">
                        <Icon size={16} />
                        {label}
                      </span>
                      <span className="file-menu-meta">
                        {meta ? <small>{meta}</small> : null}
                      </span>
                    </button>
                  ))}
                  <span className="menu-section-label">내보내기</span>
                  {exportMenuItems.map(({ icon: Icon, label }) => (
                    <button className="file-menu-item" key={label} role="menuitem" type="button">
                      <span className="file-menu-label">
                        <Icon size={16} />
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTopMenu === "resize" ? (
              <div className="file-menu-popover compact-popover" role="menu">
                <div className="file-menu-list">
                  {resizeMenuItems.map((item) => (
                    <button
                      className={`file-menu-item ${item.active ? "selected" : ""}`}
                      key={item.label}
                      role="menuitemradio"
                      type="button"
                    >
                      <span className="file-menu-label">{item.label}</span>
                      <span className="file-menu-meta">
                        <small>{item.meta}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTopMenu === "editMode" ? (
              <div className="file-menu-popover compact-popover" role="menu">
                <div className="file-menu-list">
                  {editModeItems.map((item) => (
                    <button
                      className={`file-menu-item ${item.active ? "selected" : ""}`}
                      key={item.label}
                      role="menuitemradio"
                      type="button"
                    >
                      <span className="file-menu-label">{item.label}</span>
                      <span className="file-menu-meta">
                        <small>{item.meta}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTopMenu === "quickEdit" ? (
              <div className="file-menu-popover compact-popover" role="menu">
                <div className="file-menu-list">
                  {quickEditItems.map(({ icon: Icon, label }) => (
                    <button className="file-menu-item" key={label} role="menuitem" type="button">
                      <span className="file-menu-label">
                        <Icon size={16} />
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="topbar-center">
          <span className="deck-title">{deck.title}</span>
          {isDev ? <span className="save-state">{saveStatusLabel}</span> : null}
        </div>

        <div className="top-actions">
          <span className="avatar">김</span>
          <div className="top-action-menu">
            <button
              aria-expanded={activeTopMenu === "presentation"}
              aria-haspopup="menu"
              className={`header-chip-button ${
                activeTopMenu === "presentation" ? "active" : ""
              }`}
              type="button"
              onClick={() =>
                setActiveTopMenu((current) =>
                  current === "presentation" ? null : "presentation"
                )
              }
            >
              프레젠테이션 <ChevronDown size={14} />
            </button>
            {activeTopMenu === "presentation" ? (
              <div className="file-menu-popover action-popover" role="menu">
                <div className="file-menu-list">
                  {presentationItems.map(({ icon: Icon, label, meta }) => {
                    const isRehearsalItem = label === presentationItems[2]?.label;

                    return (
                      <button
                        className="file-menu-item"
                        disabled={isRehearsalItem && !canStartRehearsal}
                        key={label}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          if (isRehearsalItem) {
                            void handleStartRehearsal();
                          }
                        }}
                      >
                        <span className="file-menu-label">
                          <Icon size={16} />
                          {label}
                        </span>
                        <span className="file-menu-meta">
                          <small>
                            {isRehearsalItem && isRehearsalPreparing ? "리허설 준비 중..." : meta}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button
            className="share-top-button"
            type="button"
          >
            <Share2 size={15} />
            공유
          </button>
          <button
            className="refresh-top-button"
            type="button"
            onClick={() => {
              void health.refetch();
              void deckQuery.refetch();
            }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>
      {isDeckLoading ? (
        <div className="editor-loading-guard" role="status">
          <span className="editor-loading-spinner" aria-hidden="true" />
          <strong>발표 자료를 불러오는 중입니다</strong>
        </div>
      ) : null}

      <section
        className={`editor-panel ${isRightPanelOpen ? "" : "right-panel-closed"} ${
          isSlidesPaneCollapsed ? "slides-panel-collapsed" : ""
        }`}
        aria-label="Presentation editor"
        style={
          {
            "--slides-pane-width": `${
              isSlidesPaneCollapsed ? collapsedSlidesPaneWidth : slidesPaneWidth
            }px`,
            "--right-pane-width": `${rightPaneWidth}px`,
            "--right-pane-collapsed-width": `${collapsedRightPaneWidth}px`
          } as CSSProperties
        }
      >
        <aside
          className={`slides-pane ${isSlidesPaneCollapsed ? "collapsed" : ""}`}
        >
          <div className="slides-pane-header">
            {!isSlidesPaneCollapsed ? (
              <button className="add-slide-button" type="button" onClick={handleAddSlide}>
                + 슬라이드
              </button>
            ) : null}
            <button
              className="collapse-slides-button"
              type="button"
              title={isSlidesPaneCollapsed ? "슬라이드 패널 펼치기" : "슬라이드 패널 접기"}
              onClick={() => setIsSlidesPaneCollapsed((current) => !current)}
            >
              {isSlidesPaneCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          </div>

          {isSlidesPaneCollapsed ? (
            <div className="collapsed-slide-rail">
              {deck.slides.map((slide, index) => (
                <button
                  className={`rail-slide-button ${
                    index === currentSlideIndex ? "active" : ""
                  }`}
                  key={slide.slideId}
                  type="button"
                  title={slide.title || `슬라이드 ${index + 1}`}
                  onClick={() => setCurrentSlideIndex(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          ) : (
            <div className={`slides-list ${slidePanelView}-view`}>
              {hasSlides ? (
                deck.slides.map((slide, index) => (
                  <button
                    className={`slide-item ${index === currentSlideIndex ? "active" : ""}`}
                    key={slide.slideId}
                    type="button"
                    onClick={() => setCurrentSlideIndex(index)}
                  >
                    <span className="slide-number">{index + 1}</span>
                    <span className="slide-title">
                      <strong className="slide-title-text">
                        {slide.title || `슬라이드 ${index + 1}`}
                      </strong>
                      {showIds ? <IdBadge id={slide.slideId} /> : null}
                    </span>
                    <span
                      className="slide-thumb orbit-thumb"
                      style={{
                        background: buildSlideThumbBackground(slide, deck)
                      }}
                    >
                      <small>
                        {slide.thumbnailUrl ? "미리보기 준비됨" : "미리보기 없음"}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <EmptyPanel
                  title="슬라이드 없음"
                  description="덱에 표시할 슬라이드가 없습니다. 새 슬라이드 또는 가져오기 기능이 연결되면 이 영역에 목록이 표시됩니다."
                />
              )}
            </div>
          )}

          {!isSlidesPaneCollapsed ? (
            <div className="side-footer">
              <button
                className={slidePanelView === "thumbnail" ? "active" : ""}
                type="button"
                onClick={() => setSlidePanelView("thumbnail")}
              >
                썸네일
              </button>
              <button
                className={slidePanelView === "list" ? "active" : ""}
                type="button"
                onClick={() => setSlidePanelView("list")}
              >
                목록
              </button>
            </div>
          ) : null}

          <button
            aria-label="슬라이드 패널 크기 조정"
            className="slides-pane-resizer"
            type="button"
            onPointerDown={handleSlidesPaneResizeStart}
          />
        </aside>

        <section className="stage-pane">
          <div className="stage-top-controls">
            <div className="editor-toolbar">
              <div className="tool-group">
                <button
                  className="icon-button"
                  disabled={undoStack.length === 0}
                  type="button"
                  title="Undo"
                  onClick={handleUndo}
                >
                  ‹
                </button>
                <button
                  className="icon-button"
                  disabled={redoStack.length === 0}
                  type="button"
                  title="Redo"
                  onClick={handleRedo}
                >
                  ›
                </button>
                <button
                  className={`icon-button ${insertTool === "select" ? "selected-tool" : ""}`}
                  type="button"
                  title="Select"
                  onClick={() => setInsertTool("select")}
                >
                  <MousePointer2 size={14} />
                </button>
                <div className="toolbar-divider" />
                <button className="tool-button" type="button" onClick={handleAddTextElement}>
                  <Type size={14} />
                  텍스트
                </button>
                <div className="shape-menu-anchor">
                  <button
                    aria-expanded={isShapeMenuOpen}
                    aria-haspopup="menu"
                    className={`tool-button ${
                      isShapeMenuOpen || insertTool === "customShape" ? "active" : ""
                    }`}
                    ref={shapeMenuButtonRef}
                    type="button"
                    onClick={() => setIsShapeMenuOpen((current) => !current)}
                  >
                    <Shapes size={14} />
                    도형
                    <ChevronDown size={14} />
                  </button>
                </div>
                <button className="tool-button" type="button" onClick={handleAddChartElement}>
                  <BarChart3 size={14} />
                  차트
                </button>
                <button
                  className="tool-button"
                  disabled={!currentSlide || isImageUploadPending}
                  type="button"
                  onClick={() =>
                    currentSlide
                      ? openImageFilePicker({
                          slideId: currentSlide.slideId,
                          type: "insert"
                        })
                      : undefined
                  }
                >
                  <ImagePlus size={14} />
                  이미지
                </button>
              </div>

              <div className="tool-group">
                <button className="tool-button" type="button">
                  <LayoutTemplate size={14} />
                  템플릿
                </button>
                <button
                  aria-pressed={showIds}
                  className={`toolbar-toggle ${showIds ? "active" : ""}`}
                  type="button"
                  onClick={() => setShowIds((current) => !current)}
                >
                  <span className="toolbar-toggle-label">ID 표시</span>
                  <span className="toolbar-toggle-track" aria-hidden="true">
                    <span className="toolbar-toggle-thumb" />
                  </span>
                </button>
                {imageUploadNotice ? (
                  <span className={`toolbar-status-pill ${imageUploadNotice.tone}`}>
                    {imageUploadNotice.message}
                  </span>
                ) : null}
              </div>
            </div>

            <SelectionQuickBar
              key={`quickbar-${selectedElement?.elementId ?? currentSlide?.slideId ?? "none"}`}
              customShapeEditActive={isCustomShapeEditingSelection}
              element={selectedElement}
              slide={selectedElementIds.length > 1 ? null : currentSlide}
              showIds={showIds}
              onToggleCustomShapeClosed={() => {
                if (!selectedElement || !currentSlide || selectedElement.type !== "customShape") {
                  return;
                }
                handleCommitCustomShapeGeometry(
                  currentSlide.slideId,
                  selectedElement.elementId,
                  getCustomShapeAbsoluteNodes(selectedElement),
                  !(selectedElement.props as CustomShapeElementProps).closed
                );
              }}
              onToggleCustomShapeEdit={() => {
                if (!selectedElement || selectedElement.type !== "customShape") {
                  return;
                }
                setEditingElementId(null);
                setCustomShapeEditElementId((current) =>
                  current === selectedElement.elementId ? null : selectedElement.elementId
                );
              }}
              onChangeFrame={(frame) => {
                if (!selectedElement || !currentSlide) {
                  return;
                }
                handleElementFrameChange(
                  currentSlide.slideId,
                  selectedElement.elementId,
                  frame
                );
              }}
              onChangeProps={(props) => {
                if (!selectedElement || !currentSlide) {
                  return;
                }
                handleElementPropsChange(
                  currentSlide.slideId,
                  selectedElement.elementId,
                  props
                );
              }}
              onChangeSlideStyle={(style) => {
                if (!currentSlide) {
                  return;
                }
                handleSlideStyleChange(currentSlide.slideId, style);
              }}
            />
          </div>

          <div className="canvas-scroll">
            {currentSlide ? (
              <div className="konva-wrap">
                <div
                  className="konva-stage-shell orbit-stage-shell"
                  data-testid="editor-stage-shell"
                  style={{
                    width: deck.canvas.width * stageScale,
                    height: deck.canvas.height * stageScale,
                    color: currentSlide.style.textColor ?? deck.theme.textColor,
                    ...buildSlideBackgroundStyle(currentSlide, deck)
                  }}
                >
                  <EditableCanvas
                    customShapeEditElementId={customShapeEditElementId}
                    deck={deck}
                    editingElementId={editingElementId}
                    insertTool={insertTool}
                    selectedElementIds={selectedElementIds}
                    showIds={showIds}
                    slide={currentSlide}
                    stageScale={stageScale}
                    stageRef={editorStageRef}
                    visibleElements={visibleElements}
                    onClearSelection={handleCanvasBackgroundSelectionClear}
                    onCommitElementFrame={handleElementFrameChange}
                    onCommitElementProps={(elementId, props) =>
                      handleElementPropsChange(currentSlide.slideId, elementId, props)
                    }
                    onCreateElement={handleCreateDrawnElement}
                    onCreateCustomShape={handleCreateCustomShape}
                    onCommitCustomShapeGeometry={(elementId, nodes, closed) =>
                      handleCommitCustomShapeGeometry(
                        currentSlide.slideId,
                        elementId,
                        nodes,
                        closed
                      )
                    }
                    onDoubleClickElement={(elementId) => setEditingElementId(elementId)}
                    onFinishEditing={() => setEditingElementId(null)}
                    onSetCustomShapeEditElementId={setCustomShapeEditElementId}
                    onSetInsertTool={setInsertTool}
                    onOpenElementContextMenu={handleOpenElementContextMenu}
                    onSelectElement={handleElementSelection}
                  />
                </div>
                {renderingDeck ? (
                  <HiddenSlideRenderStages
                    deck={renderingDeck}
                    stageRefs={slideRenderStageRefs}
                  />
                ) : null}
              </div>
            ) : (
              <EmptyCanvasState canvas={deck.canvas} />
            )}

            <section className="script-panel">
              <div className="script-panel-header">
                <strong>발표 메모</strong>
                <span>
                  {currentSlide && showIds ? (
                    <IdBadge id={currentSlide.slideId} />
                  ) : (
                    currentSlide?.title || `슬라이드 ${currentSlideIndex + 1}`
                  )}
                </span>
              </div>
              <KeywordHighlightedNotes
                keywords={currentSlide?.keywords ?? []}
                notes={currentSlide?.speakerNotes ?? ""}
                selectedKeywordId={selectedKeywordId}
                showIds={showIds}
                onSelectKeyword={setSelectedKeywordId}
              />
              <KeywordList
                keywords={currentSlide?.keywords ?? []}
                selectedKeywordId={selectedKeywordId}
                showIds={showIds}
                onSelectKeyword={setSelectedKeywordId}
              />
              {selectedKeyword ? (
                <KeywordDetail keyword={selectedKeyword} showIds={showIds} />
              ) : null}
            </section>
          </div>
        </section>

        <aside className={`ai-pane ${isRightPanelOpen ? "" : "collapsed"}`}>
          {isRightPanelOpen ? (
            <>
              <button
                aria-label="오른쪽 패널 크기 조정"
                className="right-pane-resizer"
                type="button"
                onPointerDown={handleRightPaneResizeStart}
              />
              <div className="ai-header">
                <h2>AI</h2>
                <div>
                  <button
                    className="collapse-right-pane-button"
                    type="button"
                    title="오른쪽 패널 접기"
                    onClick={() => setIsRightPanelOpen(false)}
                  >
                    <PanelRightClose size={16} />
                  </button>
                </div>
              </div>
              <div className="assistant-panel-slot">
                <SuggestionPanel
                  deck={deck}
                  projectId={projectId}
                  slideId={currentSlide?.slideId ?? null}
                  onApplySuccess={handleAiSuggestionApplied}
                />
              </div>
            </>
          ) : (
            <div className="collapsed-right-rail">
              <button
                className="collapse-right-pane-button"
                type="button"
                title="오른쪽 패널 펼치기"
                onClick={() => setIsRightPanelOpen(true)}
              >
                <PanelRightOpen size={16} />
              </button>
              <span>AI</span>
            </div>
          )}
        </aside>
      </section>

      <div data-testid="editor-elements-debug" hidden>
        {JSON.stringify(
          visibleElements.map((element) => ({
            elementId: element.elementId,
            type: element.type,
            x: Math.round(element.x),
            y: Math.round(element.y),
            width: Math.round(element.width),
            height: Math.round(element.height),
            rotation: Math.round(element.rotation)
          }))
        )}
      </div>
      <div data-testid="editor-slide-style-debug" hidden>
        {JSON.stringify(
          currentSlide
            ? {
                backgroundColor:
                  currentSlide.style.backgroundColor ?? deck.theme.backgroundColor,
                textColor: currentSlide.style.textColor ?? deck.theme.textColor,
                accentColor: currentSlide.style.accentColor ?? deck.theme.accentColor
              }
            : null
        )}
      </div>

      {isDev ? (
        <button
          className={`data-view-fab ${isDataViewOpen ? "active" : ""}`}
          data-testid="editor-data-view-toggle"
          type="button"
          onClick={() => setIsDataViewOpen((current) => !current)}
        >
          Data View
        </button>
      ) : null}

      {isDev && isDataViewOpen ? (
        <section className="floating-dev-panel">
          <div className="ai-header dev-panel-header">
            <h2>ORBIT-14 Data View</h2>
            <div>
              <button type="button" onClick={() => setIsDataViewOpen(false)}>
                ×
              </button>
            </div>
          </div>

          <InfoCard
            title="Deck Meta"
            lines={[
              `deckId: ${deck.deckId}`,
              `version: ${deck.version}`,
              `theme: ${deck.theme.name}`,
              `font: ${deck.theme.fontFamily}`,
              `palette.primary: ${deck.theme.palette.primary}`,
              `effects.radius: ${deck.theme.effects.borderRadius}`
            ]}
          />

          <InfoCard
            title="Slide Style"
            lines={
              currentSlide
                ? [
                    `canvas: ${deck.canvas.preset} / ${deck.canvas.width} × ${deck.canvas.height}`,
                    `locale: ${deck.metadata.language} / ${deck.metadata.locale}`,
                    `layout: ${currentSlide.style.layout ?? "none"}`,
                    `fontFamily: ${currentSlide.style.fontFamily ?? deck.theme.fontFamily}`,
                    `backgroundColor: ${currentSlide.style.backgroundColor ?? deck.theme.backgroundColor}`,
                    `textColor: ${currentSlide.style.textColor ?? deck.theme.textColor}`,
                    `accentColor: ${currentSlide.style.accentColor ?? deck.theme.accentColor}`,
                    `backgroundImage: ${currentSlide.style.backgroundImage?.src ?? "none"}`
                  ]
                : ["empty deck: no selected slide"]
            }
          />

          <InfoCard
            title="Editor Debug"
            lines={[
              `saveStatus: ${saveStatusLabel}`,
              `baseVersion: ${deck.version}`,
              `undo: ${undoStack.length}`,
              `redo: ${redoStack.length}`,
              `lastPatch: ${lastPatchLabel}`
            ]}
          />

          <section className="suggestion-card">
            <strong>Keywords</strong>
            <div className="stack-list">
              {currentSlide && currentSlide.keywords.length > 0 ? (
                currentSlide.keywords.map((keyword) => (
                  <KeywordSummary
                    key={keyword.keywordId}
                    keyword={keyword}
                    showIds
                  />
                ))
              ) : (
                <div className="stack-item compact">
                  <span>no keywords</span>
                </div>
              )}
            </div>
          </section>

          <section className="suggestion-card">
            <strong>Animations</strong>
            <div className="stack-list">
              {currentSlideAnimations.map((animation) => (
                <div className="stack-item" key={animation.animationId}>
                  <span>{animation.animationId}</span>
                  <strong>
                    {animation.type} → {animation.elementId}
                  </strong>
                  <small>
                    order {animation.order} · {animation.durationMs}ms · delay {animation.delayMs}ms ·{" "}
                    {animation.easing}
                  </small>
                </div>
              ))}
            </div>
          </section>

          <section className="suggestion-card">
            <strong>Elements</strong>
            <div className="stack-list">
              {visibleElements.length > 0 ? (
                visibleElements.map((element) => (
                  <ElementSummary key={element.elementId} element={element} />
                ))
              ) : (
                <div className="stack-item compact">
                  <span>no elements</span>
                </div>
              )}
            </div>
          </section>
        </section>
      ) : null}
        <input
          ref={imageFileInputRef}
          accept={editorImageAccept}
          hidden
          type="file"
          onChange={handleImageFileInputChange}
        />
      </main>
      {shapeMenuOverlay}
      {elementContextMenuOverlay}
    </>
  );
}

function buildSlideThumbBackground(slide: Slide, deck: Deck) {
  const background = slide.style.backgroundColor ?? deck.theme.backgroundColor;

  if (slide.thumbnailUrl) {
    return `url("${resolveEditorAssetUrl(slide.thumbnailUrl)}") center / cover no-repeat, ${background}`;
  }

  const backgroundImage = slide.style.backgroundImage;

  if (!backgroundImage?.src) {
    return background;
  }

  const size = getSlideBackgroundSize(backgroundImage.fit);
  const overlayOpacity = clampBackgroundOverlayOpacity(backgroundImage.opacity);

  return [
    `linear-gradient(rgba(255,255,255,${overlayOpacity}), rgba(255,255,255,${overlayOpacity}))`,
    `url("${resolveEditorAssetUrl(backgroundImage.src)}") center / ${size} no-repeat`,
    background
  ].join(",");
}

function buildSlideBackgroundStyle(slide: Slide, deck: Deck): CSSProperties {
  const backgroundColor = slide.style.backgroundColor ?? deck.theme.backgroundColor;
  const backgroundImage = slide.style.backgroundImage;

  if (!backgroundImage?.src) {
    return {
      backgroundColor,
      borderRadius: 0
    };
  }

  const size = getSlideBackgroundSize(backgroundImage.fit);
  const overlayOpacity = clampBackgroundOverlayOpacity(backgroundImage.opacity);

  return {
    backgroundColor,
    backgroundImage: `linear-gradient(rgba(255,255,255,${overlayOpacity}), rgba(255,255,255,${overlayOpacity})), url("${resolveEditorAssetUrl(backgroundImage.src)}")`,
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: `100% 100%, ${size}`,
    borderRadius: 0
  };
}

function getSlideBackgroundSize(fit: NonNullable<Slide["style"]["backgroundImage"]>["fit"]) {
  if (fit === "stretch") {
    return "100% 100%";
  }

  return fit;
}

function clampBackgroundOverlayOpacity(opacity: number) {
  return Math.max(0, Math.min(1, 1 - opacity));
}

function getEditorStatusLabel(props: {
  isDeckError: boolean;
  isDeckLoading: boolean;
  isUsingFallbackDeck: boolean;
  saveState: SaveState;
}) {
  if (props.isDeckLoading) {
    return "불러오는 중";
  }

  if (props.isDeckError) {
    return "오프라인 데모";
  }

  if (props.isUsingFallbackDeck) {
    return "로컬 데모";
  }

  if (props.saveState === "error") {
    return "저장 실패";
  }

  if (props.saveState === "saving") {
    return "저장 중";
  }

  if (props.saveState === "pending") {
    return "저장 대기 중";
  }

  return "자동 저장됨";
}


function getRenderableSlideElements(slide: Slide, canvas: DeckCanvas) {
  const groupedChildElementIds = new Set<string>();

  for (const element of slide.elements) {
    if (element.type !== "group") {
      continue;
    }

    const groupProps = element.props as GroupElementProps;

    for (const childElementId of groupProps.childElementIds) {
      groupedChildElementIds.add(childElementId);
    }
  }

  return [...slide.elements]
    .filter((element) => !groupedChildElementIds.has(element.elementId))
    .map((element) => normalizeRenderableElement(canvas, element))
    .sort((left, right) => left.zIndex - right.zIndex);
}

function normalizeRenderableElement(
  canvas: DeckCanvas,
  element: DeckElement
): DeckElement {
  const frame = normalizeElementFrameDraft(canvas, element, {});

  return {
    ...element,
    role: frame.role ?? undefined,
    x: frame.x ?? element.x,
    y: frame.y ?? element.y,
    width: frame.width ?? element.width,
    height: frame.height ?? element.height,
    rotation: frame.rotation ?? element.rotation,
    opacity: frame.opacity ?? element.opacity,
    zIndex: frame.zIndex ?? element.zIndex,
    locked: frame.locked ?? element.locked,
    visible: frame.visible ?? element.visible
  };
}

function getNextElementZIndex(elements: DeckElement[]) {
  return (
    elements.reduce(
      (currentMaxZIndex, element) => Math.max(currentMaxZIndex, element.zIndex),
      0
    ) + 1
  );
}

export function getGroupedChildPreviewFrame(args: {
  childElement: DeckElement;
  currentGroupFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  previewGroupFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
}) {
  const { childElement, currentGroupFrame, previewGroupFrame } = args;
  const scaleX = previewGroupFrame.width / Math.max(1, currentGroupFrame.width);
  const scaleY = previewGroupFrame.height / Math.max(1, currentGroupFrame.height);

  return {
    height: Math.max(1, childElement.height * scaleY),
    rotation: childElement.rotation - currentGroupFrame.rotation,
    width: Math.max(1, childElement.width * scaleX),
    x: (childElement.x - currentGroupFrame.x) * scaleX,
    y: (childElement.y - currentGroupFrame.y) * scaleY
  };
}

function getContextMenuPosition(args: {
  clientX: number;
  clientY: number;
  width: number;
  height: number;
}) {
  const viewportPadding = 12;

  return {
    left: Math.min(
      Math.max(viewportPadding, args.clientX),
      Math.max(viewportPadding, window.innerWidth - args.width - viewportPadding)
    ),
    top: Math.min(
      Math.max(viewportPadding, args.clientY),
      Math.max(viewportPadding, window.innerHeight - args.height - viewportPadding)
    )
  };
}


function isKeyboardEditableTarget(target: EventTarget | null) {
  if (target instanceof HTMLElement) {
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target.closest("[contenteditable='true'], input, textarea, select"))
    );
  }

  if (target instanceof Node) {
    return Boolean(
      target.parentElement?.closest("[contenteditable='true'], input, textarea, select")
    );
  }

  return false;
}

export function useLoadedImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();

    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
      }
    };
    nextImage.src = src;

    if (nextImage.complete && nextImage.naturalWidth > 0) {
      setImage(nextImage);
    } else {
      setImage(null);
    }

    return () => {
      cancelled = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  return image;
}

function getEditorImageValidationMessage(file: Pick<File, "name" | "size" | "type">) {
  if (!isSupportedEditorImageFile(file)) {
    return "JPG, PNG, WebP 이미지 파일만 업로드할 수 있습니다.";
  }

  if (file.size > maxAssetUploadSizeBytes) {
    return `이미지 크기는 최대 ${formatBytes(maxAssetUploadSizeBytes)}까지 가능합니다.`;
  }

  if (file.size <= 0) {
    return "빈 파일은 업로드할 수 없습니다.";
  }

  return "";
}

function isSupportedEditorImageFile(file: Pick<File, "name" | "type">) {
  if (editorImageMimeTypes.has(file.type.toLowerCase())) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp";
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function toEditorErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

async function readImageNaturalSize(file: File) {
  if (typeof window === "undefined") {
    return {
      height: defaultImageInsertFrame.height,
      width: defaultImageInsertFrame.width
    };
  }

  const objectUrl = window.URL.createObjectURL(file);

  try {
    return await new Promise<{ height: number; width: number }>((resolve, reject) => {
      const image = new window.Image();

      image.onload = () => {
        resolve({
          height: image.naturalHeight || defaultImageInsertFrame.height,
          width: image.naturalWidth || defaultImageInsertFrame.width
        });
      };
      image.onerror = () => reject(new Error("이미지 크기를 읽지 못했습니다."));
      image.src = objectUrl;
    });
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}

function getDefaultImageInsertFrame(
  canvas: DeckCanvas,
  imageSize: { height: number; width: number }
) {
  const safeWidth = Math.max(1, imageSize.width || defaultImageInsertFrame.width);
  const safeHeight = Math.max(1, imageSize.height || defaultImageInsertFrame.height);
  const scale = Math.min(520 / safeWidth, 320 / safeHeight, 1);
  const width = Math.max(140, Math.round(safeWidth * scale));
  const height = Math.max(96, Math.round(safeHeight * scale));

  return {
    height,
    width,
    x: Math.max(40, Math.round((canvas.width - width) / 2)),
    y: Math.max(40, Math.round((canvas.height - height) / 2))
  };
}

export function getImageElementLayout(args: {
  fit: ImageElementProps["fit"];
  frameHeight: number;
  frameWidth: number;
  imageHeight: number;
  imageWidth: number;
}) {
  const { fit, frameHeight, frameWidth, imageHeight, imageWidth } = args;

  if (fit === "stretch") {
    return {
      crop: undefined,
      height: frameHeight,
      width: frameWidth,
      x: 0,
      y: 0
    };
  }

  if (fit === "contain") {
    const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;

    return {
      crop: undefined,
      height,
      width,
      x: (frameWidth - width) / 2,
      y: (frameHeight - height) / 2
    };
  }

  const frameRatio = frameWidth / frameHeight;
  const imageRatio = imageWidth / imageHeight;

  if (imageRatio > frameRatio) {
    const cropWidth = imageHeight * frameRatio;

    return {
      crop: {
        height: imageHeight,
        width: cropWidth,
        x: (imageWidth - cropWidth) / 2,
        y: 0
      },
      height: frameHeight,
      width: frameWidth,
      x: 0,
      y: 0
    };
  }

  const cropHeight = imageWidth / frameRatio;

  return {
    crop: {
      height: cropHeight,
      width: imageWidth,
      x: 0,
      y: (imageHeight - cropHeight) / 2
    },
    height: frameHeight,
    width: frameWidth,
    x: 0,
    y: 0
  };
}
