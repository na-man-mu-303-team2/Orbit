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
} from "../../../../../packages/editor-core/src/index";
import { applyDeckPatch } from "../../../../../packages/editor-core/src/patches/applyPatch";
import {
  createElementFramePatch,
  normalizeElementFrameDraft
} from "../../../../../packages/editor-core/src/patches/elementFrame";
import {
  appendDeckPatchResponseSchema,
  demoIds,
  getDeckResponseSchema,
  maxAssetUploadSizeBytes,
  putDeckResponseSchema
} from "@orbit/shared";
import orbitLogo from "../../assets/orbit-logo.png";
import {
  createProject,
  fetchProjects,
  uploadProjectAsset
} from "../projects/ProjectAssetWorkspace";
import {
  normalizeEditorAssetUrl,
  resolveEditorAssetUrl
} from "./editorAssetUrl";
import type {
  ApplyAiSuggestionResponse,
  Chart,
  CustomShapeElementProps,
  CustomShapeNode,
  Deck,
  DeckCanvas,
  DeckElement,
  DeckElementRole,
  DeckPatch,
  GroupElementProps,
  ImageElementProps,
  Keyword,
  ShapeElementProps,
  Slide,
  TextElementProps
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type Konva from "konva";
import type { Box as TransformerBox } from "konva/lib/shapes/Transformer";
import { Path as KonvaPathShape } from "konva/lib/shapes/Path";
import { Text as KonvaTextShape } from "konva/lib/shapes/Text";
import {
  BarChart3,
  ChevronDown,
  Cloud,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  Home,
  ImagePlus,
  LayoutTemplate,
  Lock,
  LockOpen,
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
import {
  Arrow as KonvaArrowComponent,
  Circle as KonvaCircle,
  Group as KonvaGroup,
  Image as KonvaImageComponent,
  Layer as KonvaLayer,
  Line as KonvaLine,
  Rect as KonvaRect,
  RegularPolygon as KonvaRegularPolygon,
  Shape as KonvaShape,
  Stage as KonvaStage,
  Star as KonvaStarComponent,
  Text as KonvaText,
  Transformer as KonvaTransformer
} from "react-konva";
import type {
  ChangeEvent,
  ComponentType,
  CSSProperties,
  MutableRefObject,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { SuggestionPanel } from "./suggestions/SuggestionPanel";
import "./editor-shell.css";

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

type KonvaComponent = ComponentType<any>;

const Circle = KonvaCircle as unknown as KonvaComponent;
const Group = KonvaGroup as unknown as KonvaComponent;
const KonvaArrow = KonvaArrowComponent as unknown as KonvaComponent;
const KonvaImage = KonvaImageComponent as unknown as KonvaComponent;
const KonvaStar = KonvaStarComponent as unknown as KonvaComponent;
const Layer = KonvaLayer as unknown as KonvaComponent;
const Line = KonvaLine as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const RegularPolygon = KonvaRegularPolygon as unknown as KonvaComponent;
const Shape = KonvaShape as unknown as KonvaComponent;
const Stage = KonvaStage as unknown as KonvaComponent;
const Text = KonvaText as unknown as KonvaComponent;
const Transformer = KonvaTransformer as unknown as KonvaComponent;
const maxSlidesPaneWidth = 280;
const collapsedRightPaneWidth = 52;
const defaultRightPaneWidth = 320;
const minRightPaneWidth = 260;
const maxRightPaneWidth = 560;
const textElementPadding = 4;
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
type DrawableInsertTool = Exclude<InsertTool, "select" | "customShape">;
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
type CanvasPoint = {
  x: number;
  y: number;
};
type CustomShapeInsertDraft = {
  activeNodeIndex: number | null;
  nodes: CustomShapeNode[];
  pointer: CanvasPoint | null;
};
type CustomShapeEditDraft = {
  closed: boolean;
  elementId: string;
  nodes: CustomShapeNode[];
  selectedNodeIndex: number | null;
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

function RenderOnlyElementNode(props: {
  accentColor: string;
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { accentColor, deck, element, frame, slide } = props;

  return (
    <Group
      listening={false}
      opacity={element.visible ? element.opacity : 0}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
    >
      <ElementNodeContent
        accentColor={accentColor}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
    </Group>
  );
}

function HiddenSlideRenderStages(props: {
  deck: Deck;
  stageRefs: MutableRefObject<Map<string, Konva.Stage>>;
}) {
  const { deck, stageRefs } = props;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: -10000,
        left: -10000,
        width: deck.canvas.width,
        height: deck.canvas.height,
        pointerEvents: "none",
        opacity: 0,
      }}
    >
      {deck.slides.map((slide) => {
        const visibleElements = getRenderableSlideElements(slide, deck.canvas);

        return (
          <Stage
            height={deck.canvas.height}
            key={slide.slideId}
            ref={(stage: Konva.Stage | null) => {
              if (stage) {
                stageRefs.current.set(slide.slideId, stage);
              } else {
                stageRefs.current.delete(slide.slideId);
              }
            }}
            width={deck.canvas.width}
          >
            <Layer>
              {visibleElements.map((element) => (
                <RenderOnlyElementNode
                  key={element.elementId}
                  accentColor={slide.style.accentColor ?? deck.theme.accentColor}
                  deck={deck}
                  element={element}
                  frame={{
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: element.height,
                    rotation: element.rotation,
                  }}
                  slide={slide}
                />
              ))}
            </Layer>
          </Stage>
        );
      })}
    </div>
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

function isSameDeckIdentity(left: Deck, right: Deck) {
  return left.deckId === right.deckId && left.projectId === right.projectId;
}

export function shouldApplyManualSaveResult(args: {
  snapshotDeck: Deck;
  currentDeck: Deck;
}) {
  const { snapshotDeck, currentDeck } = args;

  return (
    currentDeck.version === snapshotDeck.version &&
    isSameDeckIdentity(currentDeck, snapshotDeck)
  );
}

export function mergeDeckIntoQueryCache(
  currentDeck: Deck | undefined,
  nextDeck: Deck
) {
  if (!currentDeck) {
    return nextDeck;
  }

  if (!isSameDeckIdentity(currentDeck, nextDeck)) {
    return nextDeck;
  }

  return nextDeck.version > currentDeck.version ? nextDeck : currentDeck;
}

export function shouldHydrateDeckFromQuery(args: {
  currentDeck: Deck;
  nextDeck: Deck;
  hasHydratedPersistedDeck: boolean;
  hasLocalOptimisticChanges: boolean;
}) {
  const {
    currentDeck,
    nextDeck,
    hasHydratedPersistedDeck,
    hasLocalOptimisticChanges
  } = args;

  if (!hasHydratedPersistedDeck) {
    if (!hasLocalOptimisticChanges) {
      return true;
    }

    if (!isSameDeckIdentity(currentDeck, nextDeck)) {
      return false;
    }
  } else if (!isSameDeckIdentity(currentDeck, nextDeck)) {
    return true;
  }

  return nextDeck.version > currentDeck.version;
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
      const renderResult = await syncSlideRenderAssets(activeProjectId, persistedDeck);
      const finalDeck = await putProjectDeck(activeProjectId, renderResult.deck);

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
      <main className="editor-app-shell orbit-shell">
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
                  {presentationItems.map(({ icon: Icon, label, meta }) => (
                    <button
                    className="file-menu-item"
                    key={label}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      if (label === presentationItems[2]?.label) {
                        void handleStartRehearsal();
                      }
                    }}
                  >
                      <span className="file-menu-label">
                        <Icon size={16} />
                        {label}
                      </span>
                      <span className="file-menu-meta">
                        <small>{meta}</small>
                      </span>
                    </button>
                  ))}
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

export function EditorStateNotice(props: {
  isError: boolean;
  isLoading: boolean;
  isUsingFallback: boolean;
}) {
  if (props.isLoading) {
    return (
      <section className="editor-state-notice loading">
        <strong>덱을 불러오는 중</strong>
        <span>프로젝트 덱 응답을 기다리는 동안 데모 덱 미리보기를 유지합니다.</span>
      </section>
    );
  }

  if (props.isError) {
    return (
      <section className="editor-state-notice error">
        <strong>덱을 불러올 수 없음</strong>
        <span>403/404 또는 네트워크 오류일 수 있습니다. 현재 화면은 demo fallback 데이터입니다.</span>
      </section>
    );
  }

  if (props.isUsingFallback) {
    return (
      <section className="editor-state-notice fallback">
        <strong>Demo fallback</strong>
        <span>API 덱이 아직 없어서 로컬 데모 DeckSchema 데이터를 표시합니다.</span>
      </section>
    );
  }

  return null;
}

function EmptyPanel(props: { title: string; description: string }) {
  return (
    <section className="empty-panel">
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </section>
  );
}

function EmptyCanvasState(props: { canvas: DeckCanvas }) {
  return (
    <section className="empty-canvas-state">
      <strong>빈 덱</strong>
      <p>
        현재 덱에는 슬라이드가 없습니다. 캔버스 프리셋은 {props.canvas.preset} /{" "}
        {props.canvas.width} × {props.canvas.height}px로 유지됩니다.
      </p>
    </section>
  );
}

interface KeywordMatch {
  end: number;
  keyword: Keyword;
  start: number;
  value: string;
}

function KeywordHighlightedNotes(props: {
  keywords: Keyword[];
  notes: string;
  selectedKeywordId: string | null;
  showIds: boolean;
  onSelectKeyword: (keywordId: string) => void;
}) {
  const { keywords, notes, selectedKeywordId, showIds, onSelectKeyword } = props;

  if (!notes) {
    return <p className="script-copy">발표 메모가 아직 없습니다.</p>;
  }

  const matches = findKeywordMatches(notes, keywords);

  if (matches.length === 0) {
    return <p className="script-copy">{notes}</p>;
  }

  const parts: Array<string | KeywordMatch> = [];
  let cursor = 0;

  matches.forEach((match) => {
    if (cursor < match.start) {
      parts.push(notes.slice(cursor, match.start));
    }
    parts.push(match);
    cursor = match.end;
  });

  if (cursor < notes.length) {
    parts.push(notes.slice(cursor));
  }

  return (
    <p className="script-copy">
      {parts.map((part, index) => {
        if (typeof part === "string") {
          return part;
        }

        const isSelected = part.keyword.keywordId === selectedKeywordId;

        return (
          <button
            className={`keyword-mark ${isSelected ? "selected" : ""}`}
            key={`${part.keyword.keywordId}-${part.start}-${index}`}
            type="button"
            onClick={() => onSelectKeyword(part.keyword.keywordId)}
          >
            <strong>{part.value}</strong>
            {showIds ? <IdBadge id={part.keyword.keywordId} /> : null}
          </button>
        );
      })}
    </p>
  );
}

function KeywordList(props: {
  keywords: Keyword[];
  selectedKeywordId: string | null;
  showIds: boolean;
  onSelectKeyword: (keywordId: string) => void;
}) {
  const { keywords, selectedKeywordId, showIds, onSelectKeyword } = props;

  return (
    <div className="keyword-strip">
      {keywords.length > 0 ? (
        keywords.map((keyword) => (
          <button
            className={`keyword-chip ${
              keyword.keywordId === selectedKeywordId ? "selected" : ""
            }`}
            key={keyword.keywordId}
            type="button"
            onClick={() => onSelectKeyword(keyword.keywordId)}
          >
            <span>{keyword.text}</span>
            {showIds ? <IdBadge id={keyword.keywordId} /> : null}
          </button>
        ))
      ) : (
        <span className="keyword-empty">등록된 키워드 없음</span>
      )}
    </div>
  );
}

function KeywordDetail(props: { keyword: Keyword; showIds: boolean }) {
  const { keyword, showIds } = props;

  return (
    <section className="keyword-detail-card">
      <div className="keyword-detail-header">
        <strong>{keyword.text}</strong>
        {showIds ? <IdBadge id={keyword.keywordId} /> : null}
      </div>
      <KeywordAliases label="유의어" values={keyword.synonyms} />
      <KeywordAliases label="약어" values={keyword.abbreviations} />
    </section>
  );
}

function KeywordAliases(props: { label: string; values: string[] }) {
  return (
    <div className="keyword-alias-row">
      <span>{props.label}</span>
      <div>
        {props.values.length > 0 ? (
          props.values.map((value) => (
            <small className="keyword-alias" key={value}>
              {value}
            </small>
          ))
        ) : (
          <small className="keyword-alias muted">없음</small>
        )}
      </div>
    </div>
  );
}

function KeywordSummary(props: { keyword: Keyword; showIds: boolean }) {
  const { keyword, showIds } = props;

  return (
    <div className="stack-item">
      {showIds ? <IdBadge id={keyword.keywordId} /> : null}
      <strong>{keyword.text}</strong>
      <small>
        synonyms {keyword.synonyms.join(", ") || "none"} · abbreviations{" "}
        {keyword.abbreviations.join(", ") || "none"}
      </small>
    </div>
  );
}

function findKeywordMatches(notes: string, keywords: Keyword[]) {
  const candidates = keywords
    .flatMap((keyword) =>
      [keyword.text, ...keyword.synonyms, ...keyword.abbreviations]
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => ({ keyword, value }))
    )
    .sort((left, right) => right.value.length - left.value.length);
  const normalizedNotes = notes.toLocaleLowerCase();
  const matches: KeywordMatch[] = [];

  candidates.forEach(({ keyword, value }) => {
    const normalizedValue = value.toLocaleLowerCase();
    let start = normalizedNotes.indexOf(normalizedValue);

    while (start !== -1) {
      const end = start + value.length;
      const overlaps = matches.some(
        (match) => start < match.end && end > match.start
      );

      if (!overlaps) {
        matches.push({
          end,
          keyword,
          start,
          value: notes.slice(start, end)
        });
      }

      start = normalizedNotes.indexOf(normalizedValue, end);
    }
  });

  return matches.sort((left, right) => left.start - right.start);
}

function InfoCard(props: { title: string; lines: string[] }) {
  return (
    <section className="suggestion-card">
      <strong>{props.title}</strong>
      <div className="stack-list">
        {props.lines.map((line) => (
          <div className="stack-item compact" key={line}>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ElementSummary(props: { element: DeckElement }) {
  const { element } = props;

  return (
    <div className="stack-item" data-testid={`debug-element-${element.elementId}`}>
      <IdBadge id={element.elementId} />
      <strong>
        {element.type}
        {element.role ? ` · ${element.role}` : ""}
      </strong>
      <small>
        {Math.round(element.x)},{Math.round(element.y)} · {Math.round(element.width)}×
        {Math.round(element.height)} · r{Math.round(element.rotation)} · z
        {element.zIndex} · opacity {element.opacity}
      </small>
    </div>
  );
}

function SelectionQuickBar(props: {
  customShapeEditActive: boolean;
  element: DeckElement | null;
  slide: Slide | null;
  onChangeFrame: (frame: ElementFrameChange) => void;
  onChangeProps: (props: Record<string, unknown>) => void;
  onChangeSlideStyle: (style: {
    backgroundColor?: string | null;
    textColor?: string | null;
    accentColor?: string | null;
  }) => void;
  onToggleCustomShapeClosed: () => void;
  onToggleCustomShapeEdit: () => void;
  showIds: boolean;
  }) {
  const {
    customShapeEditActive,
    element,
    onChangeFrame,
    onChangeProps,
    onChangeSlideStyle,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit,
    showIds,
    slide
  } = props;

  if (!element && !slide) {
    return null;
  }

  if (!element && slide) {
    return (
      <section className="selection-quickbar" data-testid="editor-slide-quickbar">
        {showIds ? (
          <div className="selection-quickbar-meta">
            <IdBadge id={slide.slideId} />
          </div>
        ) : null}
        <div className="selection-quickbar-fields">
          <PropertyColorField
            className="compact-property-field compact-property-field-color"
            label="배경색"
            value={slide.style.backgroundColor ?? "#ffffff"}
            onCommit={(value) => onChangeSlideStyle({ backgroundColor: value })}
          />
        </div>
      </section>
    );
  }

  if (!element) {
    return null;
  }

  const showOpacityControl = element.type !== "text";
  const showMeta = showIds;

  return (
    <section className="selection-quickbar" data-testid="editor-element-quickbar">
      {showMeta ? (
        <div className="selection-quickbar-meta">
          {showIds ? <IdBadge id={element.elementId} /> : null}
        </div>
      ) : null}
      <div className="selection-quickbar-fields">
        <ElementQuickBarFields
          customShapeEditActive={customShapeEditActive}
          element={element}
          onChangeProps={onChangeProps}
          onToggleCustomShapeClosed={onToggleCustomShapeClosed}
          onToggleCustomShapeEdit={onToggleCustomShapeEdit}
        />
        <div className="quickbar-divider" />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="회전"
          onCommit={(value) => onChangeFrame({ rotation: value })}
          value={element.rotation}
        />
        {showOpacityControl ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="투명도"
            max={1}
            min={0}
            step="0.05"
            onCommit={(value) => onChangeFrame({ opacity: value })}
            value={element.opacity}
          />
        ) : null}
        <button
          className={`quickbar-toggle ${element.locked ? "active" : ""}`}
          aria-label={element.locked ? "잠금 해제" : "잠금"}
          type="button"
          title={element.locked ? "잠금 해제" : "잠금"}
          onClick={() => onChangeFrame({ locked: !element.locked })}
        >
          {element.locked ? <Lock size={16} /> : <LockOpen size={16} />}
        </button>
        <button
          className={`quickbar-toggle ${element.visible ? "active" : ""}`}
          aria-label={element.visible ? "숨기기" : "표시"}
          type="button"
          title={element.visible ? "숨기기" : "표시"}
          onClick={() => onChangeFrame({ visible: !element.visible })}
        >
          {element.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        {element.type === "image" ? (
          <span className="quickbar-inline-hint">
            우클릭해 이미지를 바꿀 수 있습니다
          </span>
        ) : null}
      </div>
    </section>
  );
}

function ElementQuickBarFields(props: {
  customShapeEditActive: boolean;
  element: DeckElement;
  onChangeProps: (props: Record<string, unknown>) => void;
  onToggleCustomShapeClosed: () => void;
  onToggleCustomShapeEdit: () => void;
}) {
  const {
    customShapeEditActive,
    element,
    onChangeProps,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit
  } = props;

  if (element.type === "text") {
    const textProps = element.props as TextElementProps;

    return (
      <>
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="크기"
          min={1}
          onCommit={(value) => onChangeProps({ fontSize: value })}
          value={textProps.fontSize}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="글자색"
          value={textProps.color ?? "#111827"}
          onCommit={(value) => onChangeProps({ color: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="굵기"
          value={String(textProps.fontWeight)}
          options={[
            { value: "normal", label: "보통" },
            { value: "medium", label: "중간" },
            { value: "semibold", label: "세미" },
            { value: "bold", label: "굵게" }
          ]}
          onChange={(value) => onChangeProps({ fontWeight: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="정렬(가로)"
          value={textProps.align}
          options={[
            { value: "left", label: "왼쪽" },
            { value: "center", label: "가운데" },
            { value: "right", label: "오른쪽" },
            { value: "justify", label: "양쪽" }
          ]}
          onChange={(value) => onChangeProps({ align: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="정렬(세로)"
          value={textProps.verticalAlign}
          options={[
            { value: "top", label: "위" },
            { value: "middle", label: "가운데" },
            { value: "bottom", label: "아래" }
          ]}
          onChange={(value) => onChangeProps({ verticalAlign: value })}
        />
      </>
    );
  }

  if (
    element.type === "rect" ||
    element.type === "ellipse" ||
    element.type === "line" ||
    element.type === "arrow" ||
    element.type === "polygon" ||
    element.type === "star" ||
    element.type === "ring"
  ) {
    const shapeProps = element.props as ShapeElementProps & { sides?: number };

    return (
      <>
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="채우기"
          value={shapeProps.fill === "transparent" ? "#dbeafe" : shapeProps.fill}
          onCommit={(value) => onChangeProps({ fill: value })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선 색"
          value={
            shapeProps.stroke === "transparent" ? "#2563eb" : shapeProps.stroke
          }
          onCommit={(value) => onChangeProps({ stroke: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="두께"
          min={0}
          onCommit={(value) => onChangeProps({ strokeWidth: value })}
          value={shapeProps.strokeWidth}
        />
        {element.type === "rect" ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="둥글기"
            min={0}
            onCommit={(value) => onChangeProps({ borderRadius: value })}
            value={shapeProps.borderRadius}
          />
        ) : null}
        {element.type === "polygon" ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="꼭짓점"
            max={12}
            min={3}
            onCommit={(value) =>
              onChangeProps({ sides: Math.max(3, Math.min(12, Math.round(value))) })
            }
            value={shapeProps.sides ?? 3}
          />
        ) : null}
      </>
    );
  }

  if (element.type === "group") {
    return null;
  }

  if (element.type === "customShape") {
    const customShapeProps = element.props as CustomShapeElementProps;
    const customShapeNodes = getCustomShapeNodes(customShapeProps);

    return (
      <>
        <button
          className={`quickbar-action-chip ${customShapeEditActive ? "active" : ""}`}
          type="button"
          onClick={onToggleCustomShapeEdit}
        >
          <PenLine size={14} />
          노드 편집
        </button>
        <button
          className={`quickbar-action-chip ${customShapeProps.closed ? "active" : ""}`}
          type="button"
          onClick={onToggleCustomShapeClosed}
        >
          경로 닫기
        </button>
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="채우기"
          value={getCustomShapePaint(customShapeProps, "fill", "#f5edff")}
          onCommit={(value) => onChangeProps({ fill: value })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선 색"
          value={getCustomShapePaint(customShapeProps, "stroke", "#9333ea")}
          onCommit={(value) => onChangeProps({ stroke: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="두께"
          min={0}
          onCommit={(value) => onChangeProps({ strokeWidth: value })}
          value={getCustomShapeStrokeWidth(customShapeProps)}
        />
        <span className="quickbar-inline-hint">
          {customShapeNodes.length > 0
            ? "점 선택 후 드래그, 더블클릭으로 코너/곡선 전환"
            : "노드 정보가 없는 도형입니다"}
        </span>
      </>
    );
  }

  if (element.type === "image") {
    const imageProps = element.props as ImageElementProps;

    return (
      <QuickBarSelectField
        className="compact-property-field compact-property-field-sm"
        label="채우기"
        value={imageProps.fit}
        options={[
          { value: "contain", label: "맞춤" },
          { value: "cover", label: "채우기" },
          { value: "stretch", label: "늘리기" }
        ]}
        onChange={(value) => onChangeProps({ fit: value })}
      />
    );
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;

    return (
      <>
        <PropertyTextField
          className="compact-property-field compact-property-field-lg"
          label="제목"
          value={chart.title}
          onCommit={(value) => onChangeProps({ title: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="종류"
          value={chart.type}
          options={[
            { value: "bar", label: "막대" },
            { value: "line", label: "선" },
            { value: "pie", label: "원형" },
            { value: "doughnut", label: "도넛" }
          ]}
          onChange={(value) => onChangeProps({ type: value })}
        />
      </>
    );
  }

  return null;
}

function QuickBarSelectField(props: {
  className?: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const { className, label, onChange, options, value } = props;

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PropertyNumberField(props: {
  className?: string;
  label: string;
  min?: number;
  max?: number;
  step?: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  const { className, label, max, min, onCommit, step = "1", value } = props;
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commitValue(nextRawValue: string) {
    const nextValue = Number(nextRawValue);

    if (Number.isFinite(nextValue)) {
      onCommit(nextValue);
      setDraftValue(String(nextValue));
      return;
    }

    setDraftValue(String(value));
  }

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input
        max={max}
        min={min}
        step={step}
        type="number"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={(event) => commitValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitValue(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function PropertyTextField(props: {
  className?: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { className, label, onCommit, value } = props;
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commitValue(nextValue: string) {
    onCommit(nextValue);
    setDraftValue(nextValue);
  }

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input
        type="text"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={(event) => commitValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitValue(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function PropertyColorField(props: {
  className?: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { className, label, onCommit, value } = props;

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
    </label>
  );
}

function cloneCustomShapeNodes(nodes: CustomShapeNode[]) {
  return nodes.map((node) => ({ ...node }));
}

function getCustomShapeNodes(props: CustomShapeElementProps) {
  return Array.isArray(props.nodes) ? cloneCustomShapeNodes(props.nodes) : [];
}

function buildCustomShapePathDataFromNodes(
  nodes: CustomShapeNode[],
  closed: boolean
) {
  if (nodes.length === 0) {
    return "";
  }

  const segments = [`M ${formatSvgNumber(nodes[0].x)} ${formatSvgNumber(nodes[0].y)}`];

  for (let index = 1; index < nodes.length; index += 1) {
    segments.push(buildCustomShapeSegment(nodes[index - 1], nodes[index]));
  }

  if (closed && nodes.length > 1) {
    segments.push(buildCustomShapeSegment(nodes[nodes.length - 1], nodes[0]));
    segments.push("Z");
  }

  return segments.join(" ");
}

function buildCustomShapeSegment(from: CustomShapeNode, to: CustomShapeNode) {
  const hasCurve =
    typeof from.outX === "number" ||
    typeof from.outY === "number" ||
    typeof to.inX === "number" ||
    typeof to.inY === "number";

  if (!hasCurve) {
    return `L ${formatSvgNumber(to.x)} ${formatSvgNumber(to.y)}`;
  }

  return [
    "C",
    formatSvgNumber(from.outX ?? from.x),
    formatSvgNumber(from.outY ?? from.y),
    formatSvgNumber(to.inX ?? to.x),
    formatSvgNumber(to.inY ?? to.y),
    formatSvgNumber(to.x),
    formatSvgNumber(to.y)
  ].join(" ");
}

function formatSvgNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function normalizeCustomShapeAbsoluteGeometry(
  nodes: CustomShapeNode[],
  closed: boolean
) {
  const bounds = getCustomShapeNodeBounds(nodes);
  const frameX = Math.max(0, Math.floor(bounds.minX));
  const frameY = Math.max(0, Math.floor(bounds.minY));
  const maxX = Math.max(frameX + 1, Math.ceil(bounds.maxX));
  const maxY = Math.max(frameY + 1, Math.ceil(bounds.maxY));
  const width = Math.max(1, maxX - frameX);
  const height = Math.max(1, maxY - frameY);
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    x: node.x - frameX,
    y: node.y - frameY,
    ...(typeof node.inX === "number" ? { inX: node.inX - frameX } : {}),
    ...(typeof node.inY === "number" ? { inY: node.inY - frameY } : {}),
    ...(typeof node.outX === "number" ? { outX: node.outX - frameX } : {}),
    ...(typeof node.outY === "number" ? { outY: node.outY - frameY } : {})
  }));

  return {
    frame: {
      x: frameX,
      y: frameY,
      width,
      height
    },
    props: {
      closed,
      nodes: normalizedNodes,
      pathData: buildCustomShapePathDataFromNodes(normalizedNodes, closed),
      viewBoxWidth: width,
      viewBoxHeight: height
    }
  };
}

function getCustomShapeNodeBounds(nodes: CustomShapeNode[]) {
  const points = nodes.flatMap((node) => [
    { x: node.x, y: node.y },
    ...(typeof node.inX === "number" && typeof node.inY === "number"
      ? [{ x: node.inX, y: node.inY }]
      : []),
    ...(typeof node.outX === "number" && typeof node.outY === "number"
      ? [{ x: node.outX, y: node.outY }]
      : [])
  ]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys)
  };
}

function getCustomShapeAbsoluteNodes(element: DeckElement) {
  if (element.type !== "customShape") {
    return [] as CustomShapeNode[];
  }

  const props = element.props as CustomShapeElementProps;
  const viewBoxWidth = getCustomShapeDimension(
    props,
    "viewBoxWidth",
    element.width
  );
  const viewBoxHeight = getCustomShapeDimension(
    props,
    "viewBoxHeight",
    element.height
  );

  return convertCustomShapeNodesToAbsolute({
    frame: {
      height: element.height,
      width: element.width,
      x: element.x,
      y: element.y
    },
    nodes: getCustomShapeNodes(props),
    viewBoxHeight,
    viewBoxWidth
  });
}

function convertCustomShapeNodesToAbsolute(args: {
  frame: { x: number; y: number; width: number; height: number };
  nodes: CustomShapeNode[];
  viewBoxWidth: number;
  viewBoxHeight: number;
}) {
  const { frame, nodes, viewBoxHeight, viewBoxWidth } = args;
  const scaleX = frame.width / viewBoxWidth;
  const scaleY = frame.height / viewBoxHeight;

  return nodes.map((node) => ({
    ...node,
    x: frame.x + node.x * scaleX,
    y: frame.y + node.y * scaleY,
    ...(typeof node.inX === "number" ? { inX: frame.x + node.inX * scaleX } : {}),
    ...(typeof node.inY === "number" ? { inY: frame.y + node.inY * scaleY } : {}),
    ...(typeof node.outX === "number" ? { outX: frame.x + node.outX * scaleX } : {}),
    ...(typeof node.outY === "number" ? { outY: frame.y + node.outY * scaleY } : {})
  }));
}

function createCustomShapeNode(point: CanvasPoint): CustomShapeNode {
  return {
    x: point.x,
    y: point.y,
    mode: "corner"
  };
}

function moveCustomShapeNode(
  node: CustomShapeNode,
  point: CanvasPoint
): CustomShapeNode {
  const deltaX = point.x - node.x;
  const deltaY = point.y - node.y;

  return {
    ...node,
    x: point.x,
    y: point.y,
    ...(typeof node.inX === "number" ? { inX: node.inX + deltaX } : {}),
    ...(typeof node.inY === "number" ? { inY: node.inY + deltaY } : {}),
    ...(typeof node.outX === "number" ? { outX: node.outX + deltaX } : {}),
    ...(typeof node.outY === "number" ? { outY: node.outY + deltaY } : {})
  };
}

function updateCustomShapeNodeHandle(
  node: CustomShapeNode,
  handle: "in" | "out",
  point: CanvasPoint
): CustomShapeNode {
  const deltaX = point.x - node.x;
  const deltaY = point.y - node.y;
  const mirroredPoint = {
    x: node.x - deltaX,
    y: node.y - deltaY
  };
  const hasMeaningfulHandle = Math.hypot(deltaX, deltaY) >= 4;

  if (!hasMeaningfulHandle) {
    return {
      x: node.x,
      y: node.y,
      mode: "corner" as const
    };
  }

  if (handle === "in") {
    return {
      ...node,
      mode: "smooth" as const,
      inX: point.x,
      inY: point.y,
      outX: mirroredPoint.x,
      outY: mirroredPoint.y
    };
  }

  return {
    ...node,
    mode: "smooth" as const,
    inX: mirroredPoint.x,
    inY: mirroredPoint.y,
    outX: point.x,
    outY: point.y
  };
}

function toggleCustomShapeNodeMode(
  node: CustomShapeNode,
  handleLength: number
): CustomShapeNode {
  if (node.mode === "smooth") {
    return {
      x: node.x,
      y: node.y,
      mode: "corner"
    };
  }

  return {
    ...node,
    mode: "smooth",
    inX: node.x - handleLength,
    inY: node.y,
    outX: node.x + handleLength,
    outY: node.y
  };
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

function getGroupedChildPreviewFrame(args: {
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

function getCustomShapePathData(props: CustomShapeElementProps) {
  const pathData = props.pathData;
  return typeof pathData === "string" ? pathData.trim() : "";
}

function getCustomShapeDimension(
  props: CustomShapeElementProps,
  key: "viewBoxWidth" | "viewBoxHeight",
  fallback: number
) {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function getCustomShapePaint(
  props: CustomShapeElementProps,
  key: "fill" | "stroke",
  fallback: string
) {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getCustomShapeStrokeWidth(props: CustomShapeElementProps) {
  const value = props.strokeWidth;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 2;
}

function getCustomShapeDataArray(pathData: string) {
  if (!pathData) {
    return [] as ReturnType<typeof KonvaPathShape.parsePathData>;
  }

  try {
    return KonvaPathShape.parsePathData(pathData);
  } catch {
    return [] as ReturnType<typeof KonvaPathShape.parsePathData>;
  }
}

function drawCustomShapeScene(
  context: Konva.Context,
  shape: Konva.Shape,
  dataArray: ReturnType<typeof KonvaPathShape.parsePathData>
) {
  context.beginPath();

  let isClosed = false;

  for (const segment of dataArray) {
    const { command, points } = segment;

    switch (command) {
      case "L":
        context.lineTo(points[0], points[1]);
        break;
      case "M":
        context.moveTo(points[0], points[1]);
        break;
      case "C":
        context.bezierCurveTo(
          points[0],
          points[1],
          points[2],
          points[3],
          points[4],
          points[5]
        );
        break;
      case "Q":
        context.quadraticCurveTo(points[0], points[1], points[2], points[3]);
        break;
      case "A": {
        const cx = points[0];
        const cy = points[1];
        const rx = points[2];
        const ry = points[3];
        const theta = points[4];
        const deltaTheta = points[5];
        const psi = points[6];
        const sweepFlag = points[7];
        const radius = rx > ry ? rx : ry;
        const scaleX = rx > ry ? 1 : rx / ry;
        const scaleY = rx > ry ? ry / rx : 1;

        context.translate(cx, cy);
        context.rotate(psi);
        context.scale(scaleX, scaleY);
        context.arc(
          0,
          0,
          radius,
          theta,
          theta + deltaTheta,
          sweepFlag === 0
        );
        context.scale(1 / scaleX, 1 / scaleY);
        context.rotate(-psi);
        context.translate(-cx, -cy);
        break;
      }
      case "z":
        isClosed = true;
        context.closePath();
        break;
    }
  }

  if (!isClosed && !shape.hasFill()) {
    context.strokeShape(shape);
    return;
  }

  context.fillStrokeShape(shape);
}

function truncateValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
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

function useLoadedImage(src: string) {
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

function getImageElementLayout(args: {
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

function IdBadge(props: { id: string }) {
  const kind = getIdKind(props.id);
  const displayId = getDisplayIdLabel(props.id);

  return (
    <span className={`id-badge id-badge-${kind}`} title={props.id}>
      {displayId}
    </span>
  );
}

function getIdKind(id: string): string {
  if (id.startsWith("deck_")) {
    return "deck";
  }
  if (id.startsWith("project_")) {
    return "project";
  }
  if (id.startsWith("slide_")) {
    return "slide";
  }
  if (id.startsWith("el_")) {
    return "element";
  }
  if (id.startsWith("anim_")) {
    return "animation";
  }
  if (id.startsWith("kw_")) {
    return "keyword";
  }
  if (id.startsWith("change_")) {
    return "change";
  }
  if (id.startsWith("snapshot_")) {
    return "snapshot";
  }
  return "default";
}

function getDisplayIdLabel(id: string) {
  const kind = getIdKind(id);
  const suffix = getDisplayIdSuffix(id);

  switch (kind) {
    case "project":
      return `project${suffix}`;
    case "deck":
      return `deck${suffix}`;
    case "slide":
      return `slide${suffix}`;
    case "element":
      return `element${suffix}`;
    case "animation":
      return `animation${suffix}`;
    case "keyword":
      return `keyword${suffix}`;
    case "change":
      return `change${suffix}`;
    case "snapshot":
      return `snapshot${suffix}`;
    default:
      return truncateValue(id.replace(/_/g, ""), 18);
  }
}

function getDisplayIdSuffix(id: string) {
  const normalized = id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;

  return truncateValue(normalized.replace(/_/g, ""), 12);
}

const CANVAS_ID_BADGE_FONT_SIZE = 27;
const CANVAS_ID_BADGE_HEIGHT = 60;
const CANVAS_ID_BADGE_GAP = 10;
const CANVAS_ID_BADGE_PADDING = 15;
const CANVAS_ID_STAGE_PADDING = 12;

function getCanvasIdBadgeWidth(label: string) {
  return Math.max(172, label.length * 19 + 36);
}

function getCanvasIdBadgeOffset(args: {
  canvas: DeckCanvas;
  frame: { x: number; y: number; width: number; height: number };
  badgeWidth: number;
  badgeHeight: number;
}) {
  const { canvas, frame, badgeWidth, badgeHeight } = args;
  const hasRoomOnRight = frame.x + badgeWidth <= canvas.width - CANVAS_ID_STAGE_PADDING;
  const hasRoomAbove =
    frame.y >= badgeHeight + CANVAS_ID_BADGE_GAP + CANVAS_ID_STAGE_PADDING;
  const hasRoomBelow =
    frame.y + frame.height + CANVAS_ID_BADGE_GAP + badgeHeight <=
    canvas.height - CANVAS_ID_STAGE_PADDING;

  return {
    x: hasRoomOnRight ? 0 : Math.min(0, frame.width - badgeWidth),
    y: hasRoomAbove || !hasRoomBelow ? -badgeHeight - CANVAS_ID_BADGE_GAP : frame.height + CANVAS_ID_BADGE_GAP
  };
}

function EditableCanvas(props: {
  customShapeEditElementId: string | null;
  deck: Deck;
  editingElementId: string | null;
  insertTool: InsertTool;
  selectedElementIds: string[];
  showIds: boolean;
  slide: Slide;
  stageScale: number;
  stageRef: MutableRefObject<Konva.Stage | null>;
  visibleElements: DeckElement[];
  onClearSelection: () => void;
  onCommitElementProps: (elementId: string, props: Record<string, unknown>) => void;
  onCommitElementFrame: (
    slideId: string,
    elementId: string,
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    }
  ) => void;
  onCreateElement: (
    draft:
      | { type: "text"; x: number; y: number; width: number; height: number }
      | {
          type: "rect" | "ellipse" | "line";
          x: number;
          y: number;
          width: number;
          height: number;
        }
  ) => void;
  onCreateCustomShape: (nodes: CustomShapeNode[], closed: boolean) => void;
  onCommitCustomShapeGeometry: (
    elementId: string,
    nodes: CustomShapeNode[],
    closed: boolean
  ) => void;
  onDoubleClickElement: (elementId: string) => void;
  onFinishEditing: () => void;
  onOpenElementContextMenu: (args: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) => void;
  onSetCustomShapeEditElementId: (elementId: string | null) => void;
  onSetInsertTool: (tool: InsertTool) => void;
  onSelectElement: (elementId: string, options?: { append?: boolean }) => void;
}) {
  const {
    customShapeEditElementId,
    deck,
    editingElementId,
    insertTool,
    selectedElementIds,
    showIds,
    slide,
    stageScale,
    stageRef,
    visibleElements,
    onClearSelection,
    onCommitElementProps,
    onCommitElementFrame,
    onCreateElement,
    onCreateCustomShape,
    onCommitCustomShapeGeometry,
    onDoubleClickElement,
    onFinishEditing,
    onOpenElementContextMenu,
    onSetCustomShapeEditElementId,
    onSetInsertTool,
    onSelectElement
  } = props;
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingTextBlurActionRef = useRef<"clear-selection" | null>(null);
  const [draftElement, setDraftElement] = useState<{
    end: CanvasPoint;
    start: CanvasPoint;
    type: DrawableInsertTool;
  } | null>(null);
  const [customShapeInsertDraft, setCustomShapeInsertDraft] =
    useState<CustomShapeInsertDraft | null>(null);
  const [customShapeEditDraft, setCustomShapeEditDraft] =
    useState<CustomShapeEditDraft | null>(null);
  const editingCustomShapeElement =
    customShapeEditElementId && customShapeEditElementId !== editingElementId
      ? (visibleElements.find(
          (candidate) =>
            candidate.elementId === customShapeEditElementId &&
            candidate.type === "customShape"
        ) ?? null)
      : null;

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    if (customShapeEditElementId) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const selectedNodes = selectedElementIds
      .map((elementId) => nodeRefs.current[elementId])
      .filter((node): node is Konva.Group => Boolean(node));

    transformer.nodes(selectedNodes);
    transformer.getLayer()?.batchDraw();
  }, [customShapeEditElementId, selectedElementIds, visibleElements]);

  useEffect(() => {
    if (insertTool !== "customShape") {
      setCustomShapeInsertDraft(null);
    }
  }, [insertTool]);

  useEffect(() => {
    pendingTextBlurActionRef.current = null;
  }, [editingElementId]);

  useEffect(() => {
    if (!editingCustomShapeElement) {
      setCustomShapeEditDraft(null);
      return;
    }

    const customShapeProps = editingCustomShapeElement.props as CustomShapeElementProps;

    setCustomShapeEditDraft({
      closed: customShapeProps.closed,
      elementId: editingCustomShapeElement.elementId,
      nodes: getCustomShapeNodes(customShapeProps),
      selectedNodeIndex: null
    });
  }, [editingCustomShapeElement]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isKeyboardEditableTarget(event.target)) {
        return;
      }

      if (insertTool === "customShape") {
        if (event.key === "Escape") {
          event.preventDefault();
          setCustomShapeInsertDraft(null);
          onSetInsertTool("select");
        }

        if (
          (event.key === "Delete" || event.key === "Backspace") &&
          customShapeInsertDraft &&
          customShapeInsertDraft.nodes.length > 0
        ) {
          event.preventDefault();
          setCustomShapeInsertDraft((current) =>
            current
              ? {
                  ...current,
                  activeNodeIndex: null,
                  nodes: current.nodes.slice(0, -1)
                }
              : current
          );
        }

        if (
          event.key === "Enter" &&
          customShapeInsertDraft &&
          customShapeInsertDraft.nodes.length > 1
        ) {
          event.preventDefault();
          onCreateCustomShape(customShapeInsertDraft.nodes, false);
          setCustomShapeInsertDraft(null);
        }

        return;
      }

      if (!customShapeEditDraft || !editingCustomShapeElement) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (customShapeEditDraft.selectedNodeIndex !== null) {
          setCustomShapeEditDraft((current) =>
            current
              ? {
                  ...current,
                  selectedNodeIndex: null
                }
              : current
          );
          return;
        }

        onSetCustomShapeEditElementId(null);
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        customShapeEditDraft.selectedNodeIndex !== null &&
        customShapeEditDraft.nodes.length > 2
      ) {
        event.preventDefault();
        const nextNodes = customShapeEditDraft.nodes.filter(
          (_, index) => index !== customShapeEditDraft.selectedNodeIndex
        );
        const nextClosed =
          customShapeEditDraft.closed && nextNodes.length > 2;
        const nextDraft = {
          ...customShapeEditDraft,
          closed: nextClosed,
          nodes: nextNodes,
          selectedNodeIndex:
            nextNodes.length === 0
              ? null
              : Math.min(
                  customShapeEditDraft.selectedNodeIndex,
                  nextNodes.length - 1
                )
        };

        setCustomShapeEditDraft(nextDraft);
        onCommitCustomShapeGeometry(
          editingCustomShapeElement.elementId,
          convertCustomShapeNodesToAbsolute({
            frame: {
              height: editingCustomShapeElement.height,
              width: editingCustomShapeElement.width,
              x: editingCustomShapeElement.x,
              y: editingCustomShapeElement.y
            },
            nodes: nextDraft.nodes,
            viewBoxHeight: getCustomShapeDimension(
              editingCustomShapeElement.props as CustomShapeElementProps,
              "viewBoxHeight",
              editingCustomShapeElement.height
            ),
            viewBoxWidth: getCustomShapeDimension(
              editingCustomShapeElement.props as CustomShapeElementProps,
              "viewBoxWidth",
              editingCustomShapeElement.width
            )
          }),
          nextDraft.closed
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    customShapeEditDraft,
    customShapeInsertDraft,
    editingCustomShapeElement,
    insertTool,
    onCommitCustomShapeGeometry,
    onCreateCustomShape,
    onSetCustomShapeEditElementId,
    onSetInsertTool
  ]);

  function getCanvasPointerPosition(event: Konva.KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return {
      x: pointer.x / stageScale,
      y: pointer.y / stageScale
    };
  }

  function getCanvasPointFromClientPosition(clientX: number, clientY: number) {
    const stageContainer = stageRef.current?.container();
    const containerRect = stageContainer?.getBoundingClientRect();

    if (!containerRect) {
      return null;
    }

    return {
      x: (clientX - containerRect.left) / stageScale,
      y: (clientY - containerRect.top) / stageScale
    };
  }

  function commitCustomShapeEdit(nextDraft: CustomShapeEditDraft) {
    if (!editingCustomShapeElement) {
      return;
    }

    const customShapeProps = editingCustomShapeElement.props as CustomShapeElementProps;

    onCommitCustomShapeGeometry(
      editingCustomShapeElement.elementId,
      convertCustomShapeNodesToAbsolute({
        frame: {
          height: editingCustomShapeElement.height,
          width: editingCustomShapeElement.width,
          x: editingCustomShapeElement.x,
          y: editingCustomShapeElement.y
        },
        nodes: nextDraft.nodes,
        viewBoxHeight: getCustomShapeDimension(
          customShapeProps,
          "viewBoxHeight",
          editingCustomShapeElement.height
        ),
        viewBoxWidth: getCustomShapeDimension(
          customShapeProps,
          "viewBoxWidth",
          editingCustomShapeElement.width
        )
      }),
      nextDraft.closed
    );
  }

  function handleInlineTextEditingFinish(options?: { clearSelection?: boolean }) {
    const shouldClearSelection =
      options?.clearSelection ||
      pendingTextBlurActionRef.current === "clear-selection";

    pendingTextBlurActionRef.current = null;

    if (shouldClearSelection) {
      onClearSelection();
      return;
    }

    onFinishEditing();
  }

  function handleCanvasBackgroundSelection() {
    if (editingElementId) {
      pendingTextBlurActionRef.current = "clear-selection";
      return;
    }

    const customShapeDraftElementId = customShapeEditDraft?.elementId ?? null;
    const shouldClearCustomShapeNode =
      customShapeEditDraft?.selectedNodeIndex !== null &&
      customShapeDraftElementId !== null &&
      (selectedElementIds.length === 0 ||
        selectedElementIds.includes(customShapeDraftElementId));

    if (shouldClearCustomShapeNode) {
      setCustomShapeEditDraft((current) =>
        current
          ? {
              ...current,
              selectedNodeIndex: null
            }
          : current
      );
      return;
    }

    onClearSelection();
  }

  useEffect(() => {
    const stageContainer = stageRef.current?.container();

    if (!stageContainer) {
      return;
    }

    function handleNativeBackgroundCapture(event: MouseEvent | PointerEvent) {
      if (event.button !== 0 || insertTool !== "select") {
        return;
      }

      if (isKeyboardEditableTarget(event.target)) {
        return;
      }

      const point = getCanvasPointFromClientPosition(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      const isElementHit = visibleElements.some((element) =>
        isCanvasPointInsideElementSelectionArea({
          deck,
          element,
          point,
          slide
        })
      );

      if (!isElementHit) {
        handleCanvasBackgroundSelection();
      }
    }

    stageContainer.addEventListener("pointerdown", handleNativeBackgroundCapture, true);
    stageContainer.addEventListener("mousedown", handleNativeBackgroundCapture, true);
    return () => {
      stageContainer.removeEventListener(
        "pointerdown",
        handleNativeBackgroundCapture,
        true
      );
      stageContainer.removeEventListener(
        "mousedown",
        handleNativeBackgroundCapture,
        true
      );
    };
  }, [deck, insertTool, slide, visibleElements, editingElementId, customShapeEditDraft]);

  return (
    <div className="konva-editor-stage" data-testid="editor-canvas-stage" ref={containerRef}>
      <Stage
        className="konva-canvas-layer"
        height={deck.canvas.height * stageScale}
        ref={stageRef}
        scaleX={stageScale}
        scaleY={stageScale}
        width={deck.canvas.width * stageScale}
        onMouseDown={(event: Konva.KonvaEventObject<MouseEvent>) => {
          if (event.target === event.target.getStage()) {
            const pointer = getCanvasPointerPosition(event);

            if (!pointer) {
              return;
            }

            if (editingElementId) {
              pendingTextBlurActionRef.current = "clear-selection";
              return;
            }

            if (insertTool === "customShape") {
              setCustomShapeInsertDraft((current) => {
                const nextNodes = [...(current?.nodes ?? []), createCustomShapeNode(pointer)];

                return {
                  activeNodeIndex: nextNodes.length - 1,
                  nodes: nextNodes,
                  pointer
                };
              });
              return;
            }

            if (insertTool !== "select") {
              setDraftElement({
                type: insertTool as DrawableInsertTool,
                start: pointer,
                end: pointer
              });
              return;
            }

            if (customShapeEditDraft?.selectedNodeIndex !== null) {
              setCustomShapeEditDraft((current) =>
                current
                  ? {
                      ...current,
                      selectedNodeIndex: null
                    }
                  : current
              );
              return;
            }

            onClearSelection();
          }
        }}
        onMouseMove={(event: Konva.KonvaEventObject<MouseEvent>) => {
          const pointer = getCanvasPointerPosition(event);

          if (insertTool === "customShape") {
            if (!pointer) {
              return;
            }

            setCustomShapeInsertDraft((current) => {
              if (!current) {
                return current;
              }

              if (current.activeNodeIndex === null) {
                return {
                  ...current,
                  pointer
                };
              }

              return {
                ...current,
                nodes: current.nodes.map((node, index) =>
                  index === current.activeNodeIndex
                    ? updateCustomShapeNodeHandle(node, "out", pointer)
                    : node
                ),
                pointer
              };
            });
            return;
          }

          if (!draftElement || !pointer) {
            return;
          }

          setDraftElement((current) =>
            current
              ? {
                  ...current,
                  end: pointer
                }
              : current
          );
        }}
        onMouseUp={() => {
          if (insertTool === "customShape") {
            setCustomShapeInsertDraft((current) =>
              current
                ? {
                    ...current,
                    activeNodeIndex: null
                  }
                : current
            );
            return;
          }

          if (!draftElement) {
            return;
          }
          const rect = normalizeDraftRect(draftElement.start, draftElement.end);
          setDraftElement(null);
          if (!rect) {
            return;
          }
          onCreateElement({
            type: draftElement.type,
            ...rect
          } as
            | { type: "text"; x: number; y: number; width: number; height: number }
            | {
                type: "rect" | "ellipse" | "line";
                x: number;
                y: number;
                width: number;
                height: number;
              });
        }}
      >
        <Layer>
          {visibleElements.map((element) => (
            <EditableElementNode
              key={element.elementId}
              accentColor={slide.style.accentColor ?? deck.theme.accentColor}
              deck={deck}
              disablePointerEvents={insertTool !== "select"}
              element={element}
              isSelected={selectedElementIds.includes(element.elementId)}
              selectedCount={selectedElementIds.length}
              showIds={showIds}
              slide={slide}
              customShapeEditDraft={
                customShapeEditDraft?.elementId === element.elementId
                  ? customShapeEditDraft
                  : null
              }
              onCommitFrame={(frame) =>
                onCommitElementFrame(slide.slideId, element.elementId, frame)
              }
              onChangeCustomShapeEditDraft={setCustomShapeEditDraft}
              onCommitCustomShapeEditDraft={(nextDraft) => {
                setCustomShapeEditDraft(nextDraft);
                commitCustomShapeEdit(nextDraft);
              }}
              onDoubleClick={() => onDoubleClickElement(element.elementId)}
              onMountNode={(node) => {
                nodeRefs.current[element.elementId] = node;
              }}
              onOpenContextMenu={(clientX, clientY) =>
                onOpenElementContextMenu({
                  clientX,
                  clientY,
                  element,
                  slideId: slide.slideId
                })
              }
              onSelect={(append) =>
                onSelectElement(element.elementId, { append })
              }
            />
          ))}
          {customShapeInsertDraft ? (
            <CustomShapeInsertOverlay
              draft={customShapeInsertDraft}
              onClosePath={() => {
                if (customShapeInsertDraft.nodes.length < 3) {
                  return;
                }
                onCreateCustomShape(customShapeInsertDraft.nodes, true);
                setCustomShapeInsertDraft(null);
              }}
            />
          ) : null}
          {draftElement ? (
            <Rect
              dash={[10, 6]}
              fill="rgba(37, 99, 235, 0.08)"
              stroke="#2563eb"
              strokeWidth={2}
              {...(normalizeDraftRect(draftElement.start, draftElement.end) ?? {
                x: draftElement.start.x,
                y: draftElement.start.y,
                width: 1,
                height: 1
              })}
            />
          ) : null}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(_oldBox: TransformerBox, nextBox: TransformerBox) => ({
              ...nextBox,
              width: Math.max(1, nextBox.width),
              height: Math.max(1, nextBox.height)
            })}
            enabledAnchors={[
              "top-left",
              "top-center",
              "top-right",
              "middle-left",
              "middle-right",
              "bottom-left",
              "bottom-center",
              "bottom-right"
            ]}
            ignoreStroke
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          />
        </Layer>
      </Stage>
      {editingElementId ? (
        <InlineTextEditorOverlay
          deck={deck}
          element={
            visibleElements.find((candidate) => candidate.elementId === editingElementId) ??
            null
          }
          slide={slide}
          stageScale={stageScale}
          onCommitProps={onCommitElementProps}
          onFinishEditing={handleInlineTextEditingFinish}
        />
      ) : null}
      {insertTool === "customShape" ? (
        <div className="canvas-mode-hint">
          클릭으로 점 추가, 드래그로 곡선 손잡이 생성, 첫 점 클릭 또는 Enter로
          완료, Esc 취소
        </div>
      ) : customShapeEditDraft ? (
        <div className="canvas-mode-hint">
          점을 드래그해 도형을 다듬고, 더블클릭으로 코너와 곡선을 전환합니다
        </div>
      ) : null}
    </div>
  );
}

function CustomShapeInsertOverlay(props: {
  draft: CustomShapeInsertDraft;
  onClosePath: () => void;
}) {
  const { draft, onClosePath } = props;
  const previewNodes =
    draft.pointer && draft.activeNodeIndex === null && draft.nodes.length > 0
      ? [...draft.nodes, createCustomShapeNode(draft.pointer)]
      : draft.nodes;
  const previewPathData = buildCustomShapePathDataFromNodes(previewNodes, false);
  const previewDataArray = getCustomShapeDataArray(previewPathData);

  return (
    <>
      {previewDataArray.length > 0 ? (
        <Shape
          fillEnabled={false}
          lineCap="round"
          lineJoin="round"
          sceneFunc={(context: Konva.Context, shape: Konva.Shape) =>
            drawCustomShapeScene(context, shape, previewDataArray)
          }
          stroke="#2563eb"
          strokeWidth={2}
        />
      ) : null}
      {draft.nodes.map((node, index) => {
        const isClosableStart = index === 0 && draft.nodes.length > 2;

        return (
          <Group key={`draft-node-${index}`}>
            {typeof node.outX === "number" && typeof node.outY === "number" ? (
              <Line
                dash={[4, 4]}
                points={[node.x, node.y, node.outX, node.outY]}
                stroke="rgba(37, 99, 235, 0.5)"
                strokeWidth={1}
              />
            ) : null}
            {typeof node.outX === "number" && typeof node.outY === "number" ? (
              <Circle
                fill="#dbeafe"
                listening={false}
                radius={4}
                stroke="#2563eb"
                strokeWidth={1.5}
                x={node.outX}
                y={node.outY}
              />
            ) : null}
            <Circle
              fill={isClosableStart ? "#dcfce7" : "#ffffff"}
              radius={isClosableStart ? 7 : 6}
              stroke={isClosableStart ? "#16a34a" : "#2563eb"}
              strokeWidth={2}
              x={node.x}
              y={node.y}
              onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                if (!isClosableStart) {
                  return;
                }
                event.cancelBubble = true;
                onClosePath();
              }}
            />
          </Group>
        );
      })}
    </>
  );
}

function CustomShapeEditOverlay(props: {
  draft: CustomShapeEditDraft;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  onChangeDraft: (draft: CustomShapeEditDraft | null) => void;
  onCommitDraft: (draft: CustomShapeEditDraft) => void;
  viewBoxHeight: number;
  viewBoxWidth: number;
}) {
  const {
    draft,
    frame,
    onChangeDraft,
    onCommitDraft,
    viewBoxHeight,
    viewBoxWidth
  } = props;
  const scaleX = frame.width / Math.max(1, viewBoxWidth);
  const scaleY = frame.height / Math.max(1, viewBoxHeight);
  const handleLength = Math.max(18, Math.min(viewBoxWidth, viewBoxHeight) * 0.08);

  function toDisplayPoint(point: CanvasPoint) {
    return {
      x: point.x * scaleX,
      y: point.y * scaleY
    };
  }

  function toLocalPoint(point: CanvasPoint) {
    return {
      x: point.x / Math.max(scaleX, 0.0001),
      y: point.y / Math.max(scaleY, 0.0001)
    };
  }

  function updateDraft(
    updater: (current: CustomShapeEditDraft) => CustomShapeEditDraft,
    options?: { commit?: boolean }
  ) {
    const nextDraft = updater(draft);
    onChangeDraft(nextDraft);

    if (options?.commit) {
      onCommitDraft(nextDraft);
    }
  }

  return (
    <Group>
      {draft.nodes.map((node, index) => {
        const displayNode = toDisplayPoint({ x: node.x, y: node.y });
        const displayIn =
          typeof node.inX === "number" && typeof node.inY === "number"
            ? toDisplayPoint({ x: node.inX, y: node.inY })
            : null;
        const displayOut =
          typeof node.outX === "number" && typeof node.outY === "number"
            ? toDisplayPoint({ x: node.outX, y: node.outY })
            : null;
        const isSelected = draft.selectedNodeIndex === index;

        return (
          <Group key={`${draft.elementId}-node-${index}`}>
            {displayIn ? (
              <Line
                dash={[4, 4]}
                points={[displayNode.x, displayNode.y, displayIn.x, displayIn.y]}
                stroke="rgba(37, 99, 235, 0.55)"
                strokeWidth={1}
              />
            ) : null}
            {displayOut ? (
              <Line
                dash={[4, 4]}
                points={[displayNode.x, displayNode.y, displayOut.x, displayOut.y]}
                stroke="rgba(37, 99, 235, 0.55)"
                strokeWidth={1}
              />
            ) : null}
            {displayIn ? (
              <Circle
                draggable
                fill="#dbeafe"
                radius={4.5}
                stroke="#2563eb"
                strokeWidth={1.5}
                x={displayIn.x}
                y={displayIn.y}
                onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index
                  }));
                }}
                onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? updateCustomShapeNodeHandle(
                            currentNode,
                            "in",
                            toLocalPoint({
                              x: event.target.x(),
                              y: event.target.y()
                            })
                          )
                        : currentNode
                    )
                  }));
                }}
                onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft(
                    (current) => ({
                      ...current,
                      selectedNodeIndex: index,
                      nodes: current.nodes.map((currentNode, currentIndex) =>
                        currentIndex === index
                          ? updateCustomShapeNodeHandle(
                              currentNode,
                              "in",
                              toLocalPoint({
                                x: event.target.x(),
                                y: event.target.y()
                              })
                            )
                          : currentNode
                      )
                    }),
                    { commit: true }
                  );
                }}
              />
            ) : null}
            {displayOut ? (
              <Circle
                draggable
                fill="#dbeafe"
                radius={4.5}
                stroke="#2563eb"
                strokeWidth={1.5}
                x={displayOut.x}
                y={displayOut.y}
                onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index
                  }));
                }}
                onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft((current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? updateCustomShapeNodeHandle(
                            currentNode,
                            "out",
                            toLocalPoint({
                              x: event.target.x(),
                              y: event.target.y()
                            })
                          )
                        : currentNode
                    )
                  }));
                }}
                onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
                  event.cancelBubble = true;
                  updateDraft(
                    (current) => ({
                      ...current,
                      selectedNodeIndex: index,
                      nodes: current.nodes.map((currentNode, currentIndex) =>
                        currentIndex === index
                          ? updateCustomShapeNodeHandle(
                              currentNode,
                              "out",
                              toLocalPoint({
                                x: event.target.x(),
                                y: event.target.y()
                              })
                            )
                          : currentNode
                      )
                    }),
                    { commit: true }
                  );
                }}
              />
            ) : null}
            <Circle
              draggable
              fill={isSelected ? "#2563eb" : "#ffffff"}
              radius={7}
              stroke="#2563eb"
              strokeWidth={2}
              x={displayNode.x}
              y={displayNode.y}
              onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                event.cancelBubble = true;
                updateDraft((current) => ({
                  ...current,
                  selectedNodeIndex: index
                }));
              }}
              onDblClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
                event.cancelBubble = true;
                updateDraft(
                  (current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? toggleCustomShapeNodeMode(currentNode, handleLength)
                        : currentNode
                    )
                  }),
                  { commit: true }
                );
              }}
              onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
                event.cancelBubble = true;
                updateDraft((current) => ({
                  ...current,
                  selectedNodeIndex: index,
                  nodes: current.nodes.map((currentNode, currentIndex) =>
                    currentIndex === index
                      ? moveCustomShapeNode(
                          currentNode,
                          toLocalPoint({
                            x: event.target.x(),
                            y: event.target.y()
                          })
                        )
                      : currentNode
                  )
                }));
              }}
              onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
                event.cancelBubble = true;
                updateDraft(
                  (current) => ({
                    ...current,
                    selectedNodeIndex: index,
                    nodes: current.nodes.map((currentNode, currentIndex) =>
                      currentIndex === index
                        ? moveCustomShapeNode(
                            currentNode,
                            toLocalPoint({
                              x: event.target.x(),
                              y: event.target.y()
                            })
                          )
                        : currentNode
                    )
                  }),
                  { commit: true }
                );
              }}
            />
          </Group>
        );
      })}
    </Group>
  );
}

function EditableElementNode(props: {
  accentColor: string;
  customShapeEditDraft: CustomShapeEditDraft | null;
  deck: Deck;
  disablePointerEvents: boolean;
  element: DeckElement;
  isSelected: boolean;
  selectedCount: number;
  showIds: boolean;
  slide: Slide;
  onChangeCustomShapeEditDraft: (
    draft: CustomShapeEditDraft | null
  ) => void;
  onDoubleClick: () => void;
  onCommitCustomShapeEditDraft: (draft: CustomShapeEditDraft) => void;
  onCommitFrame: (frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }) => void;
  onMountNode: (node: Konva.Group | null) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onSelect: (append: boolean) => void;
}) {
  const {
    accentColor,
    customShapeEditDraft,
    deck,
    disablePointerEvents,
    element,
    isSelected,
    selectedCount,
    showIds,
    slide,
    onChangeCustomShapeEditDraft,
    onDoubleClick,
    onCommitCustomShapeEditDraft,
    onCommitFrame,
    onMountNode,
    onOpenContextMenu,
    onSelect
  } =
    props;
  const [previewFrame, setPreviewFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  const frame = previewFrame ?? {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation
  };
  const isMultiSelected = isSelected && selectedCount > 1;
  const selectionHitFill = isSelected
    ? isMultiSelected
      ? "rgba(37, 99, 235, 0.16)"
      : "rgba(37, 99, 235, 0.08)"
    : "rgba(15, 23, 42, 0.001)";
  const selectionStroke = isSelected ? "#2563eb" : "transparent";
  const selectionStrokeWidth = isSelected ? (isMultiSelected ? 3 : 2) : 0;
  const selectionDash = isMultiSelected ? [12, 6] : undefined;
  const elementIdLabel = getDisplayIdLabel(element.elementId);
  const canvasIdBadgeWidth = getCanvasIdBadgeWidth(elementIdLabel);
  const canvasIdBadgeOffset = getCanvasIdBadgeOffset({
    badgeHeight: CANVAS_ID_BADGE_HEIGHT,
    badgeWidth: canvasIdBadgeWidth,
    canvas: deck.canvas,
    frame
  });

  useEffect(() => {
    setPreviewFrame(null);
  }, [element.height, element.rotation, element.width, element.x, element.y]);

  function handlePointerSelect(append: boolean) {
    if (!append && element.type === "text" && isSelected && selectedCount === 1) {
      onDoubleClick();
      return;
    }

    onSelect(append);
  }

  return (
    <Group
      draggable={!disablePointerEvents && !element.locked && !customShapeEditDraft}
      listening={!disablePointerEvents}
      opacity={element.visible ? element.opacity : 0}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
      ref={onMountNode}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) =>
        handlePointerSelect(Boolean(event.evt.shiftKey))
      }
      onContextMenu={(event: Konva.KonvaEventObject<PointerEvent>) => {
        const shouldKeepSelection = isSelected && selectedCount > 1;

        if (element.type !== "image" && element.type !== "group" && !shouldKeepSelection) {
          return;
        }

        event.evt.preventDefault();
        if (!shouldKeepSelection) {
          onSelect(false);
        }
        onOpenContextMenu(event.evt.clientX, event.evt.clientY);
      }}
      onDblClick={() => {
        if (element.type === "text") {
          onDoubleClick();
        }
      }}
      onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
        setPreviewFrame(null);
        onCommitFrame({
          x: event.target.x(),
          y: event.target.y(),
          width: frame.width,
          height: frame.height,
          rotation: event.target.rotation()
        });
      }}
      onTap={() => handlePointerSelect(false)}
      onTransform={(event: Konva.KonvaEventObject<Event>) => {
        if (element.type !== "text") {
          return;
        }

        const node = event.target;
        const nextFrame = {
          x: node.x(),
          y: node.y(),
          width: Math.max(1, frame.width * node.scaleX()),
          height: Math.max(1, frame.height * node.scaleY()),
          rotation: node.rotation()
        };

        node.scaleX(1);
        node.scaleY(1);
        setPreviewFrame(nextFrame);
      }}
      onTransformEnd={(event: Konva.KonvaEventObject<Event>) => {
        const node = event.target;
        const nextWidth = Math.max(1, frame.width * node.scaleX());
        const nextHeight = Math.max(1, frame.height * node.scaleY());

        node.scaleX(1);
        node.scaleY(1);

        setPreviewFrame(null);
        onCommitFrame({
          x: node.x(),
          y: node.y(),
          width: nextWidth,
          height: nextHeight,
          rotation: node.rotation()
        });
      }}
    >
      <ElementInteractionHitTargets
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
      <Rect
        cornerRadius={10}
        fill={selectionHitFill}
        dash={selectionDash}
        listening={false}
        stroke={selectionStroke}
        strokeWidth={selectionStrokeWidth}
        width={frame.width}
        height={frame.height}
      />
      <ElementNodeContent
        accentColor={accentColor}
        customShapePreview={customShapeEditDraft}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
      {customShapeEditDraft && element.type === "customShape" ? (
        <CustomShapeEditOverlay
          draft={customShapeEditDraft}
          frame={frame}
          onChangeDraft={onChangeCustomShapeEditDraft}
          onCommitDraft={onCommitCustomShapeEditDraft}
          viewBoxHeight={getCustomShapeDimension(
            element.props as CustomShapeElementProps,
            "viewBoxHeight",
            frame.height
          )}
          viewBoxWidth={getCustomShapeDimension(
            element.props as CustomShapeElementProps,
            "viewBoxWidth",
            frame.width
          )}
        />
      ) : null}
      {showIds ? (
        <Group
          listening={false}
          rotation={-frame.rotation}
          x={canvasIdBadgeOffset.x}
          y={canvasIdBadgeOffset.y}
        >
          <Rect
            cornerRadius={18}
            fill="rgba(255, 255, 255, 0.98)"
            height={CANVAS_ID_BADGE_HEIGHT}
            shadowBlur={14}
            shadowColor="rgba(15, 23, 42, 0.18)"
            shadowOpacity={0.28}
            stroke="#2563eb"
            strokeWidth={1.5}
            width={canvasIdBadgeWidth}
          />
          <Text
            fill="#0f172a"
            fontSize={CANVAS_ID_BADGE_FONT_SIZE}
            fontStyle="bold"
            padding={CANVAS_ID_BADGE_PADDING}
            text={elementIdLabel}
            width={canvasIdBadgeWidth}
          />
        </Group>
      ) : null}
      {element.locked ? (
        <Text
          fill="#b91c1c"
          fontSize={12}
          fontStyle="bold"
          listening={false}
          text="LOCKED"
          x={frame.width - 54}
          y={8}
        />
      ) : null}
    </Group>
  );
}

function ElementInteractionHitTargets(props: {
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { deck, element, frame, slide } = props;
  const hitFill = "rgba(15, 23, 42, 0.001)";

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    return (
      <>
        {childElements.map((childElement) => {
          const childFrame = getGroupedChildPreviewFrame({
            childElement,
            currentGroupFrame: element,
            previewGroupFrame: frame
          });

          return (
            <Group
              key={`group-hit-${childElement.elementId}`}
              rotation={childFrame.rotation}
              x={childFrame.x}
              y={childFrame.y}
            >
              <Rect
                fill={hitFill}
                width={Math.max(1, childFrame.width)}
                height={Math.max(1, childFrame.height)}
              />
            </Group>
          );
        })}
      </>
    );
  }

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame,
      props: element.props as TextElementProps,
      slide,
      theme: deck.theme
    });

    return (
      <Rect
        fill={hitFill}
        x={textLayout.contentX}
        y={textLayout.y}
        width={Math.max(24, textLayout.contentWidth)}
        height={Math.max(1, textLayout.contentHeight)}
      />
    );
  }

  return (
    <Rect
      fill={hitFill}
      width={Math.max(1, frame.width)}
      height={Math.max(1, frame.height)}
    />
  );
}

function ElementNodeContent(props: {
  accentColor: string;
  customShapePreview?: CustomShapeEditDraft | null;
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { accentColor, customShapePreview, deck, element, frame, slide } = props;

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame,
      props: element.props,
      slide,
      theme: deck.theme
    });

    return (
      <Text
        align={element.props.align}
        fill={textLayout.color}
        fontFamily={textLayout.fontFamily}
        fontSize={element.props.fontSize}
        fontStyle={textLayout.fontStyle}
        lineHeight={element.props.lineHeight}
        listening={false}
        padding={0}
        text={element.props.text}
        width={textLayout.width}
        wrap="word"
        x={textLayout.x}
        y={textLayout.y}
      />
    );
  }

  if (element.type === "image") {
    return <ImageElementContent frame={frame} imageProps={element.props} />;
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;
    const values = chart.data.map((datum) =>
      "value" in datum ? Math.abs(datum.value) : Math.abs(datum.y)
    );
    const maxValue = Math.max(1, ...values);
    const barWidth = frame.width / Math.max(chart.data.length, 1);

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          fill="#fff"
          stroke={accentColor}
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#0f172a"
          fontSize={18}
          fontStyle="bold"
          text={chart.title || `${chart.type} chart`}
          x={14}
          y={12}
        />
        {chart.data.slice(0, 6).map((datum, index) => {
          const value = "value" in datum ? Math.abs(datum.value) : Math.abs(datum.y);
          const height = Math.max(
            18,
            ((frame.height - 84) * value) / maxValue
          );

          return (
            <Group key={`${datum.label ?? "item"}-${index}`}>
              <Rect
                fill={chart.style.colors[index] ?? accentColor}
                x={14 + index * barWidth}
                y={frame.height - height - 24}
                width={Math.max(18, barWidth - 16)}
                height={height}
                cornerRadius={8}
              />
            </Group>
          );
        })}
      </Group>
    );
  }

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    if (childElements.length === 0) {
      return (
        <Group listening={false}>
          <Rect
            dash={[10, 6]}
            cornerRadius={18}
            fill="rgba(241, 245, 249, 0.7)"
            stroke="#64748b"
            strokeWidth={2}
            width={frame.width}
            height={frame.height}
          />
          <Text
            fill="#334155"
            fontSize={15}
            text="빈 그룹"
            align="center"
            verticalAlign="middle"
            width={frame.width}
            height={frame.height}
            padding={12}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        {childElements.map((childElement) => {
          const childFrame = getGroupedChildPreviewFrame({
            childElement,
            currentGroupFrame: element,
            previewGroupFrame: frame
          });

          return (
            <Group
              key={childElement.elementId}
              rotation={childFrame.rotation}
              x={childFrame.x}
              y={childFrame.y}
            >
              <ElementNodeContent
                accentColor={accentColor}
                deck={deck}
                element={childElement}
                frame={{
                  x: 0,
                  y: 0,
                  width: childFrame.width,
                  height: childFrame.height,
                  rotation: childFrame.rotation
                }}
                slide={slide}
              />
            </Group>
          );
        })}
      </Group>
    );
  }

  if (element.type === "customShape") {
    const customShapeProps = element.props as CustomShapeElementProps;
    const isClosed = customShapePreview?.closed ?? customShapeProps.closed;
    const pathData =
      customShapePreview?.nodes.length
        ? buildCustomShapePathDataFromNodes(
            customShapePreview.nodes,
            isClosed
          )
        : getCustomShapePathData(customShapeProps);
    const dataArray = getCustomShapeDataArray(pathData);
    const fill = getCustomShapePaint(customShapeProps, "fill", "#f5edff");
    const stroke = getCustomShapePaint(customShapeProps, "stroke", "#9333ea");
    const strokeWidth = getCustomShapeStrokeWidth(customShapeProps);
    const viewBoxWidth = getCustomShapeDimension(
      customShapeProps,
      "viewBoxWidth",
      frame.width
    );
    const viewBoxHeight = getCustomShapeDimension(
      customShapeProps,
      "viewBoxHeight",
      frame.height
    );

    if (dataArray.length > 0) {
      return (
        <Group listening={false}>
          <Rect fill="transparent" width={frame.width} height={frame.height} />
          <Shape
            fill={isClosed ? fill : "transparent"}
            fillEnabled={isClosed}
            lineJoin="round"
            scaleX={frame.width / viewBoxWidth}
            scaleY={frame.height / viewBoxHeight}
            sceneFunc={(context: Konva.Context, shape: Konva.Shape) =>
              drawCustomShapeScene(context, shape, dataArray)
            }
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          dash={[10, 6]}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#6b21a8"
          fontSize={16}
          fontStyle="bold"
          text="SVG PATH"
          width={frame.width}
          height={frame.height}
          padding={14}
        />
      </Group>
    );
  }

  if (element.type === "ellipse") {
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <Circle
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "polygon") {
    const polygonProps = element.props as ShapeElementProps & { sides?: number };
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);
    const sides = polygonProps.sides ?? 3;

    return (
      <Group listening={false}>
        <RegularPolygon
          sides={sides}
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "star") {
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const outerRadius = Math.max(
      1,
      Math.min(frame.width, frame.height) / 2 - strokeWidth / 2
    );

    return (
      <Group listening={false}>
        <KonvaStar
          numPoints={5}
          innerRadius={outerRadius * 0.48}
          outerRadius={outerRadius}
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
        />
      </Group>
    );
  }

  if (element.type === "ring") {
    const strokeWidth = Math.max(6, element.props.strokeWidth * 4 || 12);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <Circle
          fill="transparent"
          stroke={
            element.props.stroke === "transparent"
              ? element.props.fill === "transparent"
                ? "#2563eb"
                : element.props.fill
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "arrow") {
    const stroke = element.props.stroke === "transparent" ? "#2563eb" : element.props.stroke;
    const strokeWidth = Math.max(2, element.props.strokeWidth);
    const pointerLength = Math.max(18, Math.min(42, frame.width * 0.1));
    const pointerWidth = Math.max(14, Math.min(30, frame.height * 1.2));

    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(20, frame.height)} />
        <KonvaArrow
          fill={stroke}
          pointerLength={pointerLength}
          pointerWidth={pointerWidth}
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={stroke}
          strokeWidth={strokeWidth}
          tension={0}
        />
      </Group>
    );
  }

  if (element.type === "line") {
    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(16, frame.height)} />
        <Line
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={
            element.props.stroke === "transparent"
              ? "#2563eb"
              : element.props.stroke
          }
          strokeWidth={Math.max(2, element.props.strokeWidth)}
          tension={0}
        />
      </Group>
    );
  }

  return (
    <Group listening={false}>
      <Rect
        cornerRadius={element.props.borderRadius}
        fill={element.props.fill === "transparent" ? "rgba(49, 87, 245, 0.08)" : element.props.fill}
        stroke={
          element.props.stroke === "transparent"
            ? "rgba(16, 24, 40, 0.18)"
            : element.props.stroke
        }
        strokeWidth={Math.max(1, element.props.strokeWidth)}
        width={frame.width}
        height={frame.height}
      />
    </Group>
  );
}

function ImageElementContent(props: {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  imageProps: ImageElementProps;
}) {
  const { frame, imageProps } = props;
  const image = useLoadedImage(resolveEditorAssetUrl(imageProps.src));
  const layout =
    image && image.naturalWidth > 0 && image.naturalHeight > 0
      ? getImageElementLayout({
          fit: imageProps.fit,
          frameHeight: frame.height,
          frameWidth: frame.width,
          imageHeight: image.naturalHeight,
          imageWidth: image.naturalWidth
        })
      : null;

  return (
    <Group
      listening={false}
      clipX={0}
      clipY={0}
      clipWidth={frame.width}
      clipHeight={frame.height}
    >
      <Rect
        fill="#f8fafc"
        stroke={image ? "#cbd5e1" : "#93c5fd"}
        strokeWidth={1}
        width={frame.width}
        height={frame.height}
      />
      {image && layout ? (
        <KonvaImage
          crop={layout.crop}
          image={image}
          x={layout.x}
          y={layout.y}
          width={layout.width}
          height={layout.height}
        />
      ) : (
        <Text
          align="center"
          fill="#475467"
          fontSize={14}
          fontStyle="bold"
          padding={16}
          text={`IMAGE\n${truncateValue(imageProps.alt || imageProps.src, 44)}`}
          verticalAlign="middle"
          width={frame.width}
          height={frame.height}
        />
      )}
    </Group>
  );
}

function InlineTextEditorOverlay(props: {
  deck: Deck;
  element: DeckElement | null;
  slide: Slide;
  stageScale: number;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: (options?: { clearSelection?: boolean }) => void;
}) {
  const { deck, element, slide, stageScale, onCommitProps, onFinishEditing } = props;

  if (!element || element.type !== "text") {
    return null;
  }

  return (
    <textarea
      autoFocus
      className="inline-text-editor"
      defaultValue={element.props.text}
      style={{
        left: `${element.x * stageScale}px`,
        top: `${element.y * stageScale}px`,
        width: `${element.width * stageScale}px`,
        height: `${element.height * stageScale}px`,
        color: element.props.color ?? slide.style.textColor ?? deck.theme.textColor,
        fontFamily:
          element.props.fontFamily ??
          slide.style.fontFamily ??
          deck.theme.typography.bodyFontFamily,
        fontSize: `${element.props.fontSize * stageScale}px`,
        fontWeight: String(getCssFontWeight(element.props.fontWeight)),
        lineHeight: String(element.props.lineHeight),
        textAlign: element.props.align,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "top left"
      }}
      onBlur={(event) => {
        onCommitProps(element.elementId, { text: event.target.value });
        onFinishEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onFinishEditing();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onCommitProps(element.elementId, { text: event.currentTarget.value });
          onFinishEditing();
        }
      }}
    />
  );
}

function getCssFontWeight(fontWeight: TextElementProps["fontWeight"]) {
  if (typeof fontWeight === "number") {
    return fontWeight;
  }

  switch (fontWeight) {
    case "medium":
      return 500;
    case "semibold":
      return 600;
    case "bold":
      return 700;
    case "normal":
    default:
      return 400;
  }
}

function getKonvaFontStyle(fontWeight: TextElementProps["fontWeight"]) {
  return getCssFontWeight(fontWeight) >= 600 ? "bold" : "normal";
}

function getTextElementLayout(args: {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  props: TextElementProps;
  slide: Slide;
  theme: Deck["theme"];
}) {
  const { frame, props, slide, theme } = args;
  const fontFamily =
    props.fontFamily ?? slide.style.fontFamily ?? theme.typography.bodyFontFamily;
  const color = props.color ?? slide.style.textColor ?? theme.textColor;
  const fontStyle = getKonvaFontStyle(props.fontWeight);
  const width = Math.max(1, frame.width - textElementPadding * 2);
  const availableHeight = Math.max(1, frame.height - textElementPadding * 2);
  const contentMetrics = measureTextContentBounds({
    align: props.align,
    fontFamily,
    fontSize: props.fontSize,
    fontStyle,
    lineHeight: props.lineHeight,
    text: props.text,
    width
  });
  const contentHeight = Math.min(contentMetrics.height, availableHeight);
  const spareHeight = Math.max(0, availableHeight - contentHeight);
  const contentWidth =
    props.align === "justify"
      ? width
      : Math.max(1, Math.min(contentMetrics.width, width));
  let y = textElementPadding;
  let contentX = textElementPadding;

  if (props.verticalAlign === "middle") {
    y += spareHeight / 2;
  } else if (props.verticalAlign === "bottom") {
    y += spareHeight;
  }

  if (props.align === "center") {
    contentX += Math.max(0, (width - contentWidth) / 2);
  } else if (props.align === "right") {
    contentX += Math.max(0, width - contentWidth);
  }

  return {
    color,
    contentHeight,
    contentWidth,
    contentX,
    fontFamily,
    fontStyle,
    width,
    x: textElementPadding,
    y
  };
}

function isCanvasPointInsideElementSelectionArea(args: {
  deck: Deck;
  element: DeckElement;
  point: CanvasPoint;
  slide: Slide;
}) {
  const { deck, element, point, slide } = args;

  if (!element.visible) {
    return false;
  }

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation
      },
      props: element.props as TextElementProps,
      slide,
      theme: deck.theme
    });

    return isCanvasPointInsideRotatedFrame({
      frame: {
        x: element.x + textLayout.contentX,
        y: element.y + textLayout.y,
        width: Math.max(24, textLayout.contentWidth),
        height: Math.max(1, textLayout.contentHeight),
        rotation: element.rotation
      },
      point
    });
  }

  return isCanvasPointInsideRotatedFrame({
    frame: {
      x: element.x,
      y: element.y,
      width: Math.max(1, element.width),
      height: Math.max(1, element.height),
      rotation: element.rotation
    },
    point
  });
}

function isCanvasPointInsideRotatedFrame(args: {
  frame: {
    height: number;
    rotation: number;
    width: number;
    x: number;
    y: number;
  };
  point: CanvasPoint;
}) {
  const { frame, point } = args;
  const rotationRadians = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const relativeX = point.x - frame.x;
  const relativeY = point.y - frame.y;
  const localX = relativeX * cos + relativeY * sin;
  const localY = -relativeX * sin + relativeY * cos;

  return (
    localX >= 0 &&
    localX <= frame.width &&
    localY >= 0 &&
    localY <= frame.height
  );
}

function estimateTextContentBounds(args: {
  text: string;
  width: number;
  fontSize: number;
  lineHeight: number;
}) {
  const { text, width, fontSize, lineHeight } = args;
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(fontSize * 0.55, 1)));
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const estimatedLineLengths: number[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      estimatedLineLengths.push(0);
      continue;
    }

    for (let start = 0; start < paragraph.length; start += charsPerLine) {
      estimatedLineLengths.push(
        Math.min(charsPerLine, paragraph.length - start)
      );
    }
  }

  const maxCharsInLine = Math.max(0, ...estimatedLineLengths);
  const lineCount = Math.max(1, estimatedLineLengths.length);

  return {
    height: lineCount * fontSize * lineHeight,
    width: Math.min(width, maxCharsInLine * fontSize * 0.55)
  };
}

function measureTextContentBounds(args: {
  align: TextElementProps["align"];
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold";
  lineHeight: number;
  text: string;
  width: number;
}) {
  if (typeof document === "undefined") {
    return estimateTextContentBounds({
      text: args.text,
      width: args.width,
      fontSize: args.fontSize,
      lineHeight: args.lineHeight
    });
  }

  const measureNode = new KonvaTextShape({
    align: args.align,
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    fontStyle: args.fontStyle,
    lineHeight: args.lineHeight,
    padding: 0,
    text: args.text,
    width: args.width,
    wrap: "word"
  });
  const contentHeight = measureNode.height();
  const contentWidth = Math.min(
    args.width,
    measureNode.textArr.reduce(
      (maxWidth, line) => Math.max(maxWidth, line.width),
      0
    )
  );

  measureNode.destroy();

  return {
    height: contentHeight,
    width: contentWidth
  };
}

function normalizeDraftRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (width < 4 && height < 4) {
    return null;
  }

  return {
    x,
    y,
    width: Math.max(8, width),
    height: Math.max(8, height)
  };
}
