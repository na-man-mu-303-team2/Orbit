import {
  createAddElementPatch,
  createAddSlidePatch,
  createDemoDeck,
  createDeleteElementPatch,
  createElementId,
  createSlideId,
  createUpdateElementPropsPatch
} from "../../../../../packages/editor-core/src/index";
import { applyDeckPatch } from "../../../../../packages/editor-core/src/patches/applyPatch";
import { createElementFramePatch } from "../../../../../packages/editor-core/src/patches/elementFrame";
import { demoIds, maxAssetUploadSizeBytes } from "@orbit/shared";
import orbitLogo from "../../assets/orbit-logo.png";
import {
  createProject,
  fetchProjects,
  uploadProjectAsset
} from "../projects/ProjectAssetWorkspace";
import type {
  Chart,
  Deck,
  DeckCanvas,
  DeckElement,
  DeckElementRole,
  DeckPatch,
  ShapeElementProps,
  TextElementProps,
  GetDeckResponse,
  GroupElementProps,
  ImageElementProps,
  Keyword,
  Slide
} from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import type Konva from "konva";
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
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  RegularPolygon,
  Stage,
  Star as KonvaStar,
  Text,
  Transformer
} from "react-konva";
import type {
  ChangeEvent,
  CSSProperties,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./editor-shell.css";

interface HealthResponse {
  status: string;
  app: string;
  demo: typeof demoIds;
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
type InsertTool = "select" | "text" | "rect" | "ellipse" | "line";
type ShapeInsertType = "rect" | "ellipse" | "line" | "polygon" | "star";
type ShapeMenuPosition = {
  left: number;
  top: number;
};
type ElementContextMenuState = {
  elementId: string;
  left: number;
  slideId: string;
  top: number;
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

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json() as Promise<HealthResponse>;
}

async function fetchDeck(): Promise<Deck> {
  const response = await fetch(`/api/v1/projects/${demoIds.projectId}/deck`);
  if (!response.ok) {
    throw new Error("Deck fetch failed");
  }
  const payload = (await response.json()) as GetDeckResponse;
  return payload.deck;
}

export function EditorShell() {
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeTopMenu, setActiveTopMenu] = useState<TopMenu | null>(null);
  const [lastPatchLabel, setLastPatchLabel] = useState("편집 없음");
  const [insertTool, setInsertTool] = useState<InsertTool>("select");
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
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
  const [undoStack, setUndoStack] = useState<Deck[]>([]);
  const [redoStack, setRedoStack] = useState<Deck[]>([]);
  const topbarRef = useRef<HTMLElement | null>(null);
  const shapeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const copiedElementRef = useRef<ElementClipboardState | null>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });

  const deckQuery = useQuery({
    queryKey: ["deck", demoIds.projectId],
    queryFn: fetchDeck,
    retry: false
  });

  const loadedDeck = deckQuery.data ?? fallbackDeck;
  const [deck, setDeck] = useState<Deck>(loadedDeck);
  const deckRef = useRef(loadedDeck);
  const imageUploadTargetRef = useRef<ImageUploadTarget | null>(null);
  const resolvedUploadProjectIdRef = useRef<string | null>(null);
  const isUsingFallbackDeck = !deckQuery.data;
  const isDeckLoading = deckQuery.isPending;
  const isDeckError = deckQuery.isError;
  const hasSlides = deck.slides.length > 0;
  const currentSlide = deck.slides[currentSlideIndex] ?? deck.slides[0] ?? null;
  const saveStatusLabel = getEditorStatusLabel({
    isDeckError,
    isDeckLoading,
    isUsingFallbackDeck
  });
  const visibleElements = currentSlide
    ? [...currentSlide.elements].sort((left, right) => left.zIndex - right.zIndex)
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
  const selectedElement =
    visibleElements.find((element) => element.elementId === selectedElementId) ??
    null;
  const isDev = import.meta.env.DEV;
  const fileMenuItems = [
    { icon: FolderPlus, label: "새 프레젠테이션", meta: "빈 덱" },
    { icon: Upload, label: "PPTX 가져오기", meta: "업로드" },
    { icon: Cloud, label: "저장", meta: deckQuery.data ? "자동 저장됨" : "demo fallback" }
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
    deckRef.current = loadedDeck;
    setDeck(loadedDeck);
    setUndoStack([]);
    setRedoStack([]);
  }, [loadedDeck]);

  useEffect(() => {
    if (!deckQuery.data?.projectId) {
      return;
    }

    resolvedUploadProjectIdRef.current = deckQuery.data.projectId;
  }, [deckQuery.data]);

  function commitPatch(patch: DeckPatch, baseDeck: Deck = deckRef.current) {
    const result = applyDeckPatch(baseDeck, patch);

    if (!result.ok) {
      setLastPatchLabel(`실패 · ${result.error.code}`);
      return;
    }

    deckRef.current = result.deck;
    setUndoStack((current) => [...current.slice(-49), baseDeck]);
    setRedoStack([]);
    setDeck(result.deck);
    setLastPatchLabel(
      `${result.changeRecord.operations[0]?.type ?? "patch"} · v${result.metadata.nextVersion}`
    );
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
      const uploadProjectId = await resolveUploadProject(deckRef.current.projectId);
      const uploaded = await uploadProjectAsset(
        uploadProjectId,
        file,
        "reference-material"
      );
      const activeDeck = deckRef.current;
      const targetSlideIndex = activeDeck.slides.findIndex(
        (slide) => slide.slideId === target.slideId
      );

      if (targetSlideIndex < 0) {
        throw new Error("이미지를 넣을 슬라이드를 찾지 못했습니다.");
      }

      const targetSlide = activeDeck.slides[targetSlideIndex];

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
            src: uploaded.url
          }),
          activeDeck
        );
        setCurrentSlideIndex(targetSlideIndex);
        setSelectedElementId(target.elementId);
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
            zIndex: targetSlide.elements.length + 1,
            locked: false,
            visible: true,
            props: {
              alt: file.name,
              fit: "contain",
              src: uploaded.url
            }
          }),
          activeDeck
        );
        setCurrentSlideIndex(targetSlideIndex);
        setSelectedElementId(elementId);
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
        zIndex: visibleElements.length + 1,
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
    setSelectedElementId(elementId);
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
        zIndex: visibleElements.length + 1,
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
    setSelectedElementId(elementId);
  }

  function handleInsertShapeElement(shapeType: ShapeInsertType) {
    if (!currentSlide) {
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
      polygon: { x: 260, y: 220, width: 180, height: 180 },
      star: { x: 260, y: 220, width: 180, height: 180 }
    };
    const frame = defaultFrameByShape[shapeType];

    commitPatch(
      createAddElementPatch(deck, currentSlide.slideId, {
        elementId,
        type: shapeType,
        role: shapeType === "line" ? "decoration" : "highlight",
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        rotation: 0,
        opacity: 1,
        zIndex: visibleElements.length + 1,
        locked: false,
        visible: true,
        props: {
          fill: shapeType === "line" ? "transparent" : "#dbeafe",
          stroke: "#2563eb",
          strokeWidth: 3,
          borderRadius: 18
        }
      })
    );
    setSelectedElementId(elementId);
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
    setSelectedElementId(null);
  }

  function handleDeleteSelectedElement() {
    if (!currentSlide || !selectedElementId) {
      return;
    }

    setElementContextMenu(null);
    commitPatch(
      createDeleteElementPatch(deck, currentSlide.slideId, selectedElementId)
    );
    setSelectedElementId(null);
    setEditingElementId(null);
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

    setSelectedElementId(nextElementId);
    setEditingElementId(null);

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
          zIndex: visibleElements.length + 1,
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
          zIndex: visibleElements.length + 1,
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

    setSelectedElementId(elementId);
    setInsertTool("select");
  }

  function handleElementFrameChange(
    slideId: string,
    elementId: string,
    frame: ElementFrameChange
  ) {
    try {
      commitPatch(createElementFramePatch(deck, slideId, elementId, frame));
    } catch (error) {
      setLastPatchLabel(
        error instanceof Error ? `실패 · ${error.message}` : "실패 · unknown"
      );
    }
  }

  function handleCanvasBackgroundSelectionClear() {
    setElementContextMenu(null);
    setSelectedElementId(null);
    setEditingElementId(null);
  }

  function handleOpenElementContextMenu(args: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) {
    if (args.element.type !== "image") {
      return;
    }

    const viewportPadding = 12;
    const menuWidth = 196;
    const menuHeight = 60;
    const left = Math.min(
      Math.max(viewportPadding, args.clientX),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
    );
    const top = Math.min(
      Math.max(viewportPadding, args.clientY),
      Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding)
    );

    setSelectedElementId(args.element.elementId);
    setEditingElementId(null);
    setElementContextMenu({
      elementId: args.element.elementId,
      left,
      slideId: args.slideId,
      top
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
    if (
      selectedElementId &&
      !currentSlide?.elements.some(
        (element) => element.elementId === selectedElementId
      )
    ) {
      setSelectedElementId(null);
    }
  }, [currentSlide, selectedElementId]);

  useEffect(() => {
    if (currentSlideIndex > 0 && currentSlideIndex >= deck.slides.length) {
      setCurrentSlideIndex(Math.max(0, deck.slides.length - 1));
    }
  }, [currentSlideIndex, deck.slides.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isEditableTarget = isKeyboardEditableTarget(event.target);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedElementId && editingElementId !== selectedElementId) {
          event.preventDefault();
          handleDeleteSelectedElement();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        if (selectedElementId) {
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
        if (editingElementId !== selectedElementId && selectedElementId) {
          setSelectedElementId(null);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deck, editingElementId, selectedElementId, selectedElement, currentSlide]);

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
                onClick={() => handleInsertShapeElement("polygon")}
              >
                <span className="shape-menu-symbol">△</span>
                <span>삼각형</span>
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
                onClick={() => handleInsertShapeElement("line")}
              >
                <Minus size={14} />
                <span>선</span>
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
                    <button className="file-menu-item" key={label} role="menuitem" type="button">
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
                    <button className="file-menu-item" key={label} role="menuitem" type="button">
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
                        {slide.thumbnailUrl ? "미리보기 준비 중" : "미리보기 없음"}
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
                    className={`tool-button ${isShapeMenuOpen ? "active" : ""}`}
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
              element={selectedElement}
              slide={currentSlide}
              showIds={showIds}
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
                  style={{
                    width: deck.canvas.width * stageScale,
                    height: deck.canvas.height * stageScale,
                    color: currentSlide.style.textColor ?? deck.theme.textColor,
                    ...buildSlideBackgroundStyle(currentSlide, deck)
                  }}
                >
                  <EditableCanvas
                    deck={deck}
                    editingElementId={editingElementId}
                    insertTool={insertTool}
                    selectedElementId={selectedElementId}
                    showIds={showIds}
                    slide={currentSlide}
                    stageScale={stageScale}
                    visibleElements={visibleElements}
                    onClearSelection={handleCanvasBackgroundSelectionClear}
                    onCommitElementFrame={handleElementFrameChange}
                    onCommitElementProps={(elementId, props) =>
                      handleElementPropsChange(currentSlide.slideId, elementId, props)
                    }
                    onCreateElement={handleCreateDrawnElement}
                    onDoubleClickElement={(elementId) => setEditingElementId(elementId)}
                    onFinishEditing={() => setEditingElementId(null)}
                    onOpenElementContextMenu={handleOpenElementContextMenu}
                    onSelectElement={(elementId) => setSelectedElementId(elementId)}
                  />
                </div>
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
                <div className="assistant-panel-empty">
                  <strong>AI 편집 도우미</strong>
                  <p>대화, 수정 제안, 초안 생성은 이 패널에서만 처리하도록 분리했습니다.</p>
                </div>
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

      {isDev ? (
        <button
          className={`data-view-fab ${isDataViewOpen ? "active" : ""}`}
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
  const backgroundImage = slide.style.backgroundImage;

  if (!backgroundImage?.src) {
    return background;
  }

  const size = getSlideBackgroundSize(backgroundImage.fit);
  const overlayOpacity = clampBackgroundOverlayOpacity(backgroundImage.opacity);

  return [
    `linear-gradient(rgba(255,255,255,${overlayOpacity}), rgba(255,255,255,${overlayOpacity}))`,
    `url("${backgroundImage.src}") center / ${size} no-repeat`,
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
    backgroundImage: `linear-gradient(rgba(255,255,255,${overlayOpacity}), rgba(255,255,255,${overlayOpacity})), url("${backgroundImage.src}")`,
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
    <div className="stack-item">
      <IdBadge id={element.elementId} />
      <strong>
        {element.type}
        {element.role ? ` · ${element.role}` : ""}
      </strong>
      <small>
        {Math.round(element.x)},{Math.round(element.y)} · {Math.round(element.width)}×
        {Math.round(element.height)} · z{element.zIndex} · opacity {element.opacity}
      </small>
    </div>
  );
}

function SelectionQuickBar(props: {
  element: DeckElement | null;
  slide: Slide | null;
  onChangeFrame: (frame: ElementFrameChange) => void;
  onChangeProps: (props: Record<string, unknown>) => void;
  onChangeSlideStyle: (style: {
    backgroundColor?: string | null;
    textColor?: string | null;
    accentColor?: string | null;
  }) => void;
  showIds: boolean;
  }) {
  const {
    element,
    onChangeFrame,
    onChangeProps,
    onChangeSlideStyle,
    showIds,
    slide
  } = props;

  if (!element && !slide) {
    return null;
  }

  if (!element && slide) {
    return (
      <section className="selection-quickbar">
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
    <section className="selection-quickbar">
      {showMeta ? (
        <div className="selection-quickbar-meta">
          {showIds ? <IdBadge id={element.elementId} /> : null}
        </div>
      ) : null}
      <div className="selection-quickbar-fields">
        <ElementQuickBarFields element={element} onChangeProps={onChangeProps} />
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
  element: DeckElement;
  onChangeProps: (props: Record<string, unknown>) => void;
}) {
  const { element, onChangeProps } = props;

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
    element.type === "polygon" ||
    element.type === "star" ||
    element.type === "ring"
  ) {
    const shapeProps = element.props as ShapeElementProps;

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

function truncateValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function isKeyboardEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
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
  deck: Deck;
  editingElementId: string | null;
  insertTool: InsertTool;
  selectedElementId: string | null;
  showIds: boolean;
  slide: Slide;
  stageScale: number;
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
  onDoubleClickElement: (elementId: string) => void;
  onFinishEditing: () => void;
  onOpenElementContextMenu: (args: {
    clientX: number;
    clientY: number;
    element: DeckElement;
    slideId: string;
  }) => void;
  onSelectElement: (elementId: string) => void;
}) {
  const {
    deck,
    editingElementId,
    insertTool,
    selectedElementId,
    showIds,
    slide,
    stageScale,
    visibleElements,
    onClearSelection,
    onCommitElementProps,
    onCommitElementFrame,
    onCreateElement,
    onDoubleClickElement,
    onFinishEditing,
    onOpenElementContextMenu,
    onSelectElement
  } = props;
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draftElement, setDraftElement] = useState<{
    type: InsertTool;
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    const selectedNode = selectedElementId
      ? nodeRefs.current[selectedElementId]
      : null;

    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementId, visibleElements]);

  return (
    <div className="konva-editor-stage" ref={containerRef}>
      <Stage
        className="konva-canvas-layer"
        height={deck.canvas.height * stageScale}
        scaleX={stageScale}
        scaleY={stageScale}
        width={deck.canvas.width * stageScale}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            if (insertTool !== "select") {
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer) {
                return;
              }
              setDraftElement({
                type: insertTool,
                start: {
                  x: pointer.x / stageScale,
                  y: pointer.y / stageScale
                },
                end: {
                  x: pointer.x / stageScale,
                  y: pointer.y / stageScale
                }
              });
              return;
            }
            onClearSelection();
          }
        }}
        onMouseMove={(event) => {
          if (!draftElement) {
            return;
          }
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer) {
            return;
          }
          setDraftElement((current) =>
            current
              ? {
                  ...current,
                  end: {
                    x: pointer.x / stageScale,
                    y: pointer.y / stageScale
                  }
                }
              : current
          );
        }}
        onMouseUp={() => {
          if (!draftElement) {
            return;
          }
          const rect = normalizeDraftRect(draftElement.start, draftElement.end);
          setDraftElement(null);
          if (!rect) {
            return;
          }
          onCreateElement({
            type: draftElement.type === "select" ? "rect" : draftElement.type,
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
              element={element}
              isSelected={element.elementId === selectedElementId}
              showIds={showIds}
              slide={slide}
              onCommitFrame={(frame) =>
                onCommitElementFrame(slide.slideId, element.elementId, frame)
              }
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
              onSelect={() => onSelectElement(element.elementId)}
            />
          ))}
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
            boundBoxFunc={(_, nextBox) => ({
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
          onFinishEditing={onFinishEditing}
        />
      ) : null}
    </div>
  );
}

function EditableElementNode(props: {
  accentColor: string;
  deck: Deck;
  element: DeckElement;
  isSelected: boolean;
  showIds: boolean;
  slide: Slide;
  onDoubleClick: () => void;
  onCommitFrame: (frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }) => void;
  onMountNode: (node: Konva.Group | null) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onSelect: () => void;
}) {
  const {
    accentColor,
    deck,
    element,
    isSelected,
    showIds,
    slide,
    onDoubleClick,
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
  const selectionHitFill = isSelected
    ? "rgba(37, 99, 235, 0.08)"
    : "rgba(15, 23, 42, 0.001)";
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

  function handlePointerSelect() {
    if (element.type === "text" && isSelected) {
      onDoubleClick();
      return;
    }

    onSelect();
  }

  return (
    <Group
      draggable={!element.locked}
      opacity={element.visible ? element.opacity : 0}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
      ref={onMountNode}
      onClick={handlePointerSelect}
      onContextMenu={(event) => {
        if (element.type !== "image") {
          return;
        }

        event.evt.preventDefault();
        onSelect();
        onOpenContextMenu(event.evt.clientX, event.evt.clientY);
      }}
      onDblClick={() => {
        if (element.type === "text") {
          onDoubleClick();
        }
      }}
      onDragEnd={(event) => {
        setPreviewFrame(null);
        onCommitFrame({
          x: event.target.x(),
          y: event.target.y(),
          width: frame.width,
          height: frame.height,
          rotation: event.target.rotation()
        });
      }}
      onTap={handlePointerSelect}
      onTransform={(event) => {
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
      onTransformEnd={(event) => {
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
      <Rect
        cornerRadius={10}
        fill={selectionHitFill}
        stroke={isSelected ? "#2563eb" : "transparent"}
        strokeWidth={isSelected ? 2 : 0}
        width={frame.width}
        height={frame.height}
      />
      <ElementNodeContent
        accentColor={accentColor}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
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

function ElementNodeContent(props: {
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
    const barWidth = element.width / Math.max(chart.data.length, 1);

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
          text={`GROUP\n${groupProps.childElementIds.join(", ") || "empty"}`}
          align="center"
          verticalAlign="middle"
          width={frame.width}
          height={frame.height}
          padding={12}
        />
      </Group>
    );
  }

  if (element.type === "customShape") {
    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          fill="rgba(250, 245, 255, 0.92)"
          stroke="#9333ea"
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#6b21a8"
          fontSize={14}
          text={truncateValue(JSON.stringify(element.props), 80)}
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
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <RegularPolygon
          sides={3}
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

  if (element.type === "line" || element.type === "arrow") {
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
  const image = useLoadedImage(imageProps.src);
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
  onFinishEditing: () => void;
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

function estimateTextContentHeight(args: {
  text: string;
  width: number;
  fontSize: number;
  lineHeight: number;
}) {
  const { text, width, fontSize, lineHeight } = args;
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(fontSize * 0.55, 1)));
  const lineCount = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);

  return lineCount * fontSize * lineHeight;
}

function measureTextContentHeight(args: {
  align: TextElementProps["align"];
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold";
  lineHeight: number;
  text: string;
  width: number;
}) {
  if (typeof document === "undefined") {
    return estimateTextContentHeight({
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

  measureNode.destroy();

  return contentHeight;
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
  const contentHeight = Math.min(
    measureTextContentHeight({
      align: props.align,
      fontFamily,
      fontSize: props.fontSize,
      fontStyle,
      lineHeight: props.lineHeight,
      text: props.text,
      width
    }),
    availableHeight
  );
  const spareHeight = Math.max(0, availableHeight - contentHeight);
  let y = textElementPadding;

  if (props.verticalAlign === "middle") {
    y += spareHeight / 2;
  } else if (props.verticalAlign === "bottom") {
    y += spareHeight;
  }

  return {
    color,
    fontFamily,
    fontStyle,
    width,
    x: textElementPadding,
    y
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
