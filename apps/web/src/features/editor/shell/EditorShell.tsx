import {
  createAddAnimationPatch,
  createAddElementPatch,
  createAddAnimationWithKeywordTriggerPatch,
  createAddSlidePatch,
  createDuplicateSlidePatch,
  createKeyword,
  createDefaultAnimation,
  createDeleteAnimationPatch,
  createElementId,
  createReplaceKeywordsPatch,
  createUpsertAdvanceSlideKeywordActionPatch,
  findKeywordByTerm,
  createGroupedElementFramePatch,
  createUpdateAnimationPatch,
  getElementAnimations,
  getGroupChildElements,
  getGroupedSelectionBounds,
  createSlideId,
  createUpdateElementPropsPatch,
  deriveKeywordActionUsage,
  findDanglingKeywordOccurrenceActions,
  validateSlideAnimations
} from "../../../../../../packages/editor-core/src/index";
import { applyDeckPatch } from "../../../../../../packages/editor-core/src/patches/applyPatch";
import {
  createElementFramePatch,
  normalizeElementFrameDraft
} from "../../../../../../packages/editor-core/src/patches/elementFrame";
import {
  appendDeckPatchAckResponseSchema,
  appendDeckPatchRequestSchema,
  appendDeckPatchResponseSchema,
  createKeywordOccurrenceId,
  deckApiErrorSchema,
  deckExportJobResultSchema,
  demoIds,
  getDeckResponseSchema,
  maxAssetUploadSizeBytes,
  meResponseSchema,
  pptxOoxmlGenerationJobResultSchema,
  putDeckResponseSchema,
  type DeckExportJobResult,
  type PptxOoxmlGenerationJobResult,
  type QualityReport
} from "@orbit/shared";
import { jobSchema, type Job } from "../../../../../../packages/shared/src/jobs/job.schema";
import {
  createInitialProjectDeck,
  createProject,
  fetchProjects,
  uploadProjectAsset
} from "../../projects/ProjectAssetWorkspace";
import {
  ProjectReadOnlyBanner,
  useProjectAccess
} from "../../projects/ProjectAccessContext";
import {
  normalizeEditorAssetUrl,
  resolveEditorAssetUrl
} from "../shared/editorAssetUrl";
import {
  EditableCanvas,
  HiddenSlideRenderStages,
  getRenderableSlideElements
} from "../canvas/EditorCanvas";
import {
  getCustomShapeAbsoluteNodes,
  normalizeCustomShapeAbsoluteGeometry
} from "../canvas/custom-shape/geometry";
import {
  AnimationSidePanel,
  buildAnimationKeywordTriggerPolicy,
  maxAnimationPaneWidth,
  minAnimationPaneWidth,
  toAnimationKeywordTriggerOptions,
  useEditorAnimationPreview
} from "./components/animation";
import {
  EmptyCanvasState,
  EmptyPanel,
  EditorStateNotice
} from "./components/EditorStateNotice";
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
import { EditorSaveControl } from "./components/EditorSaveControl";
import { EditorUndoToast } from "./components/EditorUndoToast";
import { EditorExitConfirmModal } from "./components/EditorExitConfirmModal";
import { EditorZoomControl } from "./components/EditorZoomControl";
import { PresentationMenu } from "./components/PresentationMenu";
import { SlideRail } from "./components/SlideRail";
import {
  ShareAccessModal
} from "./components/ShareAccessModal";
import {
  AiChatPanel,
  createInitialAiChatState
} from "./components/AiChatPanel";
import {
  SelectionQuickBar
} from "./components/SelectionQuickBar";
import { MultiSelectionQuickBar } from "./components/MultiSelectionQuickBar";
import { SelectionInspector } from "./components/SelectionInspector";
import {
  useEditorPersistenceState,
  type PatchProducer,
  type SaveErrorCode,
  type SaveState
} from "./hooks/useEditorPersistenceState";
import { useProjectShareAccess } from "./hooks/useProjectShareAccess";
import { useEditorShellUiStore } from "./editorShellUiStore";
import {
  fitEditorZoomState,
  maximumManualEditorZoom,
  minimumManualEditorZoom,
  persistProjectEditorZoom,
  readProjectEditorZoom,
  resolveEditorStageScale,
  stepEditorZoom,
  type EditorZoomState
} from "./editorZoom";
import {
  isEditorKeyboardCommandSuppressedTarget,
  resolveEditorKeyboardCommand
} from "./editorKeyboardCommands";
import {
  buildSlideRailItems,
  resolveSelectedSlideId,
  resolveSelectedSlideIdAfterDelete,
} from "./slideRailModel";
import { beginHorizontalPaneResize } from "./utils/beginHorizontalPaneResize";
import { createDistributeSelectionPatch } from "./utils/selectionDistribution";
import { createSelectionNudgePatch } from "./utils/selectionNudge";
import { createThemeCascadePatch } from "./utils/themeCascadePatch";
import {
  createSelectionInspectorModel,
  resolveSelectionInspectorCompactMode
} from "./selectionInspectorModel";
import { storePreparedRehearsalSlideSnapshots } from "../../rehearsal/rehearsalSlideSnapshots";
export {
  EditorStateNotice
} from "./components/EditorStateNotice";
export {
  mergeDeckIntoQueryCache,
  buildSlideThumbnailPatch,
  getDeckThumbnailRefreshSlideIds,
  getImportedSlideThumbnailRefreshSlideIds,
  getPatchThumbnailRefreshSlideIds,
  shouldRefreshImportedSlideThumbnails,
  shouldApplyManualSaveResult,
  shouldHydrateDeckFromQuery
} from "./utils/deckState";
export { createDistributeSelectionPatch } from "./utils/selectionDistribution";
export { getResponsiveEditorStageScale } from "./editorZoom";
export { getEditorValidationItems } from "../ai/quality/editorValidation";
import type {
  ApplyDesignAgentProposalResponse,
  AppendDeckPatchAckResponse,
  CustomShapeElementProps,
  CustomShapeNode,
  Deck,
  DeckCanvas,
  DeckAnimation,
  DeckElement,
  DeckElementRole,
  Keyword,
  DeckPatch,
  GroupElementProps,
  ImageElementProps,
  SemanticCue,
  ShapeElementProps,
  Slide,
  DeckApiErrorCode,
  SpeakerNotesSuggestionMode,
  SpeakerNotesSuggestionResult
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type Konva from "konva";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowRight as MoveRight,
  IconChartBar as BarChart3,
  IconChevronDown as ChevronDown,
  IconCloud as Cloud,
  IconDownload as Download,
  IconFileText as FileText,
  IconGripHorizontal as GripHorizontal,
  IconHistory as History,
  IconHome as Home,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconLayoutSidebarRightCollapse as PanelRightClose,
  IconLayoutSidebarRightExpand as PanelRightOpen,
  IconMinus as Minus,
  IconPencil as PenLine,
  IconPhotoPlus as ImagePlus,
  IconPlus as Plus,
  IconPointer as MousePointer2,
  IconRefresh as RefreshCw,
  IconShape as Shapes,
  IconShare as Share2,
  IconSparkles as Sparkles,
  IconTypography as Type,
  IconUpload as Upload
} from "@tabler/icons-react";
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { io } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import orbitLogo from "../../../assets/orbit-logo.png";
import { AudienceLinkModal } from "../audience-link/AudienceLinkModal";
import {
  fetchPresentationBrief,
  presentationBriefQueryKey
} from "../../coaching/presentationBriefApi";
import { ValidationPanel } from "../ai/quality/ValidationPanel";
import { getEditorValidationItems } from "../ai/quality/editorValidation";
import { createSafeTextOverflowRepair } from "../ai/quality/safeTextOverflowRepair";
import {
  presentEditorValidationItems,
  type EditorValidationTargetView
} from "../ai/quality/validationPresentation";
import { SourceLedgerPanel } from "../ai/quality/SourceLedgerPanel";
import {
  SemanticCueReviewPanel,
  type SemanticCueExtractionUiState
} from "../semantic-cues/SemanticCueReviewPanel";
import { createSemanticCueReviewPatch } from "../semantic-cues/semanticCueReviewModel";
import { PresentationJourneyPanel } from "../outcome/components/PresentationJourneyPanel";
import {
  createPresentationJourneyViewModel,
  type PresentationJourneyAction,
  type PresentationJourneySaveState
} from "../outcome/presentationJourney";
import {
  createPresentationJourneyNavigationCoordinator,
  type PresentationJourneyDestination,
  type PresentationJourneyNavigationCoordinator,
  type PresentationJourneyNavigationDependencies,
  type PresentationJourneySaveOutcome
} from "../outcome/presentationJourneyNavigation";
import {
  SpeakerNotesAssistantDialog,
  SpeakerNotesLengthMeter,
  type SpeakerNotesAssistantStatus
} from "./components/SpeakerNotesAssistantDialog";
import {
  createSpeakerNotesSuggestionJob,
  getSpeakerNotesLengthGuidance,
  waitForSpeakerNotesSuggestionJob
} from "./speakerNotesAssistant";
import {
  getDeckThumbnailRefreshSlideIds,
  mergeDeckIntoQueryCache,
  shouldApplyManualSaveResult,
  shouldHydrateDeckFromQuery
} from "./utils/deckState";
import type { EditorCapabilities } from "./editorCapabilities";
import "../editor-shell.css";

interface HealthResponse {
  status: string;
  app: string;
  demo: typeof demoIds;
}

type ProjectPresenceUser = {
  id: string;
  connectedAt: string;
  email?: string;
  userId?: string;
};

type ProjectPresenceEvent = {
  payload?: {
    projectId?: string;
    users?: ProjectPresenceUser[];
  };
};

type EditorSocketStatus = "connecting" | "connected" | "disconnected" | "error";

type EditorSessionDebugState =
  | { status: "idle" | "loading"; message: string }
  | {
      authenticatedAt: string;
      email: string;
      expiresAt: string;
      status: "ready";
      userId: string;
    }
  | { status: "error"; message: string };

type ProjectEditorZoomState = {
  projectId: string;
  zoom: EditorZoomState;
};

export function shouldPromptSpeakerNotesDraftDiscard(input: {
  draft: string;
  isEditing: boolean;
  savedDraftBase: string;
}) {
  return input.isEditing && input.draft !== input.savedDraftBase;
}

export function shouldPromptSpeakerNotesOverwrite(input: {
  currentNotes: string;
  draft: string;
  savedDraftBase: string;
}) {
  return (
    input.currentNotes !== input.savedDraftBase &&
    input.draft !== input.currentNotes
  );
}

export function isSpeakerNotesDraftBoundToSlide(input: {
  editSlideId: string | null;
  selectedSlideId: string | null;
}) {
  return Boolean(
    input.editSlideId && input.selectedSlideId === input.editSlideId,
  );
}

export function resolveSpeakerNotesDraftDispositionForSlideDelete(input: {
  deletedSlideId: string;
  selectedSlideId: string | null;
}) {
  return input.deletedSlideId === input.selectedSlideId
    ? "discard-after-delete"
    : "preserve";
}

export function resolveDeleteUndoToastOpenAfterPatch(input: {
  commitSucceeded: boolean;
  currentOpen: boolean;
}) {
  return input.commitSucceeded ? false : input.currentOpen;
}

export const danglingKeywordOccurrenceSaveMessage =
  "발표 메모 수정으로 기존 키워드 트리거 위치를 찾을 수 없습니다. 연결된 애니메이션 또는 다음 슬라이드 트리거를 새 위치에 다시 연결한 뒤 저장하세요.";

export function getSpeakerNotesDanglingOccurrenceSaveBlock(
  slide: Pick<Slide, "slideId" | "speakerNotes" | "keywords" | "actions">,
  nextSpeakerNotes: string
) {
  const danglingActions = findDanglingKeywordOccurrenceActions(
    slide,
    nextSpeakerNotes
  );

  return danglingActions.length > 0
    ? {
        danglingActions,
        message: danglingKeywordOccurrenceSaveMessage
      }
    : null;
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

const collapsedSlidesPaneWidth = 0;
const minSlidesPaneWidth = 132;

const maxSlidesPaneWidth = 280;
const collapsedRightPaneWidth = 52;
const minRightPaneWidth = 260;
const maxRightPaneWidth = 560;
const defaultSpeakerNotesPanelHeight = 240;
const initialSpeakerNotesPanelHeight = 360;
const minSpeakerNotesPanelHeight = 120;
const speakerNotesPanelHideThreshold = 84;
const speakerNotesPanelKeyboardStep = 24;
const editorUploadProjectTitle = "ORBIT Editor Uploads";
const defaultImageInsertFrame = {
  height: 240,
  width: 420,
  x: 260,
  y: 220
};
const editorImageAccept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const editorImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const pptxImportAccept =
  ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ooxmlSyncJobEventName = "orbit:ooxml-sync-job";

type ShapeInsertType =
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "triangle"
  | "polygon"
  | "star"
  | "customShape";
type ElementClipboardState = {
  element: DeckElement;
  pasteCount: number;
};
export type HistoryEntry = {
  deck: Deck;
  slideId: string | null;
};
export function resolveHistoryNavigation(args: {
  currentDeck: Deck;
  currentSlideId: string | null;
  stack: HistoryEntry[];
}) {
  const targetEntry = args.stack.at(-1);

  if (!targetEntry) {
    return null;
  }

  return {
    currentEntry: {
      deck: args.currentDeck,
      slideId: resolveSelectedSlideId(
        args.currentDeck.slides,
        args.currentSlideId,
      ),
    },
    nextStack: args.stack.slice(0, -1),
    targetEntry,
    targetSlideId: resolveSelectedSlideId(
      targetEntry.deck.slides,
      targetEntry.slideId,
    ),
  };
}
export function appendAppliedDesignProposalHistory(args: {
  currentDeck: Deck;
  currentSlideId: string | null;
  undoStack: HistoryEntry[];
}) {
  return [
    ...args.undoStack.slice(-49),
    {
      deck: args.currentDeck,
      slideId: resolveSelectedSlideId(args.currentDeck.slides, args.currentSlideId),
    }
  ];
}

export function createSlideRailReorderPatch(
  deck: Deck,
  orderedSlideIds: readonly string[],
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "reorder_slides",
        slideOrders: orderedSlideIds.map((slideId, index) => ({
          slideId,
          order: index + 1,
        })),
      },
    ],
  };
}

export function getAddedSlideId(patch: DeckPatch) {
  return (
    patch.operations.find((operation) => operation.type === "add_slide")?.slide
      .slideId ?? null
  );
}

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
  visible?: boolean;
};
type PptxImportState =
  | { status: "idle"; warnings: string[]; qualityReport: null; message: string }
  | {
      status: "uploading" | "importing";
      warnings: string[];
      qualityReport: null;
      message: string;
    }
  | {
      status: "succeeded";
      warnings: string[];
      qualityReport: QualityReport;
      message: string;
    }
  | {
      status: "error";
      warnings: string[];
      qualityReport: null;
      message: string;
    };

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json() as Promise<HealthResponse>;
}

async function readResponseError(response: Response, fallbackMessage: string) {
  const text = await response.text();

  if (!text) {
    return new DeckRequestError(fallbackMessage, response.status);
  }

  try {
    const payload = deckApiErrorSchema.parse(JSON.parse(text));
    return new DeckRequestError(payload.message, response.status, payload.code, payload.details);
  } catch {
    return new DeckRequestError(text, response.status);
  }
}

class DeckRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: DeckApiErrorCode,
    readonly details: string[] = []
  ) {
    super(message);
    this.name = "DeckRequestError";
  }
}

function isDeckRequestErrorWithCode(
  error: unknown,
  code: DeckApiErrorCode
): error is DeckRequestError {
  return error instanceof DeckRequestError && error.code === code;
}

function withSaveErrorCode(error: Error, saveErrorCode: SaveErrorCode) {
  (error as Error & { saveErrorCode?: SaveErrorCode }).saveErrorCode = saveErrorCode;
  return error;
}

function resolvePatchInput(
  deck: Deck,
  patchInput: DeckPatch | PatchProducer
): DeckPatch {
  return typeof patchInput === "function" ? patchInput(deck) : patchInput;
}

export function buildPatchBatch(
  baseDeck: Deck,
  patchInputs: (DeckPatch | PatchProducer)[]
): { patch: DeckPatch; deck: Deck } {
  let workingDeck = baseDeck;
  const operations: DeckPatch["operations"] = [];
  let source: DeckPatch["source"] = "user";

  for (const patchInput of patchInputs) {
    const resolvedPatch = resolvePatchInput(workingDeck, patchInput);
    const nextPatch = {
      ...resolvedPatch,
      baseVersion: workingDeck.version
    } satisfies DeckPatch;
    const result = applyDeckPatch(workingDeck, nextPatch);

    if (!result.ok) {
      throw new Error("최신 내용과 충돌해 저장할 수 없습니다. 다시 저장해 주세요.");
    }

    operations.push(...nextPatch.operations);
    source = nextPatch.source;
    workingDeck = result.deck;
  }

  if (operations.length === 0) {
    throw new Error("저장할 변경 사항이 없습니다.");
  }

  return {
    patch: {
      deckId: baseDeck.deckId,
      baseVersion: baseDeck.version,
      operations,
      source
    },
    deck: workingDeck
  };
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export async function waitForSlideRenderStages(
  slideIds: readonly string[],
  stageRefs: ReadonlyMap<string, unknown>,
  waitForNextFrame: () => Promise<void> = waitForAnimationFrame,
  maxFrames = 90,
  isCancelled: () => boolean = () => false
) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (isCancelled()) {
      throw new Error("슬라이드 snapshot 준비가 취소되었습니다.");
    }
    await waitForNextFrame();
    if (isCancelled()) {
      throw new Error("슬라이드 snapshot 준비가 취소되었습니다.");
    }
    if (slideIds.every((slideId) => stageRefs.has(slideId))) {
      return;
    }
  }

  throw new Error("슬라이드 렌더링 스테이지를 찾지 못했습니다.");
}

function getSlideRenderBackgroundColor(slide: Slide, deck: Deck) {
  return slide.style.backgroundColor ?? deck.theme.backgroundColor;
}

export class SnapshotPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotPreparationError";
  }
}

export function requireLoadedRehearsalSnapshotAssets(
  missingAssetCount: number,
) {
  if (missingAssetCount <= 0) return;
  throw new SnapshotPreparationError(
    `슬라이드 이미지 ${missingAssetCount}개를 불러오지 못했습니다. 이미지 연결을 확인한 뒤 리허설을 다시 시작해 주세요.`,
  );
}

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = "image/png",
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(
          new SnapshotPreparationError(
            "슬라이드 이미지를 생성하지 못했습니다. 리허설을 다시 시작해 주세요.",
          ),
        );
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
  requireAssets?: boolean;
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
  if (usesImportedSlideFallback(args.slide, args.deck)) {
    await drawSlideRenderFallbackImage(
      context,
      args.slide.thumbnailUrl,
      canvas,
      args.requireAssets,
    );
  } else {
    await drawSlideRenderBackgroundImage(
      context,
      args.slide,
      canvas,
      args.requireAssets,
    );
    context.drawImage(stageCanvas, 0, 0, canvas.width, canvas.height);
  }

  const blob = await canvasToBlob(canvas);

  return new File(
    [blob],
    `slide-${String(args.slideNumber).padStart(2, "0")}-thumbnail-v${args.deck.version}.png`,
    {
      type: "image/png"
    },
  );
}

export function requireCompleteRehearsalSlideRender(
  deck: Deck,
  files: ReadonlyMap<string, File>,
) {
  return deck.slides.map((slide) => {
    const file = files.get(slide.slideId);
    if (!file) {
      throw new Error(
        "모든 슬라이드 snapshot을 준비하지 못했습니다. 리허설을 다시 시작해 주세요.",
      );
    }
    return { file, slide };
  });
}

async function drawSlideRenderFallbackImage(
  context: CanvasRenderingContext2D,
  imageUrl: string,
  canvas: HTMLCanvasElement,
  requireAssets = false,
) {
  const image = await loadCanvasImage(imageUrl);
  if (!image) {
    if (requireAssets) requireLoadedRehearsalSnapshotAssets(1);
    return;
  }

  const frame = getBackgroundImageDrawFrame({
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    fit: "contain",
    imageHeight: image.naturalHeight || image.height,
    imageWidth: image.naturalWidth || image.width,
  });
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
}

async function drawSlideRenderBackgroundImage(
  context: CanvasRenderingContext2D,
  slide: Slide,
  canvas: HTMLCanvasElement,
  requireAssets = false,
) {
  const backgroundImage = slide.style.backgroundImage;

  if (!backgroundImage?.src) {
    return;
  }

  const image = await loadCanvasImage(backgroundImage.src);

  if (!image) {
    if (requireAssets) requireLoadedRehearsalSnapshotAssets(1);
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

function usesImportedSlideFallback(slide: Slide, deck: Deck) {
  return Boolean(
    slide.thumbnailUrl &&
      getRenderableSlideElements(slide, deck.canvas).length === 0 &&
      (deck.metadata.sourceType === "import" ||
        deck.metadata.thumbnailSource === "import-render"),
  );
}

export function collectRehearsalSnapshotAssetUrls(
  slide: Slide,
  deck: Deck,
) {
  const urls = new Set<string>();

  if (usesImportedSlideFallback(slide, deck) && slide.thumbnailUrl) {
    return [slide.thumbnailUrl];
  }

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

async function waitForSlideAssets(slide: Slide, deck: Deck) {
  const assetUrls = collectRehearsalSnapshotAssetUrls(slide, deck);

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

type EditorFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type ProjectDeckLoadResult =
  | { kind: "ready"; deck: Deck }
  | { kind: "missing" }
  | { kind: "access-denied"; message: string; status: 401 | 403 }
  | { kind: "server-error"; message: string; status: number }
  | { kind: "network-error"; message: string };

export async function loadProjectDeck(
  projectId: string,
  fetcher: EditorFetcher = fetch
): Promise<ProjectDeckLoadResult> {
  try {
    const response = await fetcher(
      `/api/v1/projects/${encodeURIComponent(projectId)}/deck`,
      { credentials: "include" }
    );

    if (response.status === 404) return { kind: "missing" };

    if (response.status === 401 || response.status === 403) {
      return {
        kind: "access-denied",
        message: (await response.text()) || "발표 자료를 볼 권한이 없습니다.",
        status: response.status
      };
    }

    if (!response.ok) {
      return {
        kind: "server-error",
        message: (await response.text()) || "발표 자료를 불러오지 못했습니다.",
        status: response.status
      };
    }

    try {
      const payload = getDeckResponseSchema.parse(await response.json());
      return { kind: "ready", deck: payload.deck };
    } catch {
      return {
        kind: "server-error",
        message: "발표 자료 응답 형식이 올바르지 않습니다.",
        status: response.status
      };
    }
  } catch (error) {
    return {
      kind: "network-error",
      message: error instanceof Error
        ? error.message
        : "네트워크 연결을 확인해 주세요."
    };
  }
}

async function fetchProjectDeck(projectId: string): Promise<Deck | null> {
  const result = await loadProjectDeck(projectId);
  if (result.kind === "ready") return result.deck;
  if (result.kind === "missing") return null;
  throw new DeckRequestError(
    result.message,
    result.kind === "network-error" ? 0 : result.status
  );
}

function navigateToRehearsal(projectId: string, snapshotPreparationId?: string) {
  const search = snapshotPreparationId
    ? `?snapshotPreparationId=${encodeURIComponent(snapshotPreparationId)}`
    : "";
  window.history.pushState(
    {},
    "",
    `/rehearsal/${encodeURIComponent(projectId)}${search}`,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToBrief(projectId: string) {
  window.history.pushState({}, "", `/project/${encodeURIComponent(projectId)}/brief`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToPresentation(projectId: string) {
  window.history.pushState({}, "", `/presentation/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateToHome() {
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function hasPendingEditorChanges(args: {
  hasUnackedLocalChanges: boolean;
  pendingPatchCount: number;
  saveState: SaveState;
}) {
  return (
    args.hasUnackedLocalChanges ||
    args.pendingPatchCount > 0 ||
    args.saveState === "auto-pending" ||
    isSaveInFlight(args.saveState) ||
    args.saveState === "error"
  );
}

export function consumeScheduledUndoRedoPersistLabel(args: {
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  labelRef: { current: string | null };
  timerRef: { current: ReturnType<typeof setTimeout> | null };
}) {
  const timer = args.timerRef.current;

  if (timer) {
    args.clearTimer(timer);
    args.timerRef.current = null;
  }

  const label = args.labelRef.current;
  args.labelRef.current = null;
  return label;
}

export async function flushEditorPersistenceBeforeManualAction(args: {
  flushPendingSaveBatch: () => Promise<void>;
  flushScheduledUndoRedoPersist: () => Promise<void>;
  hasPendingPatchInputs: () => boolean;
  waitForSaveQueue: () => Promise<void>;
}) {
  await args.flushScheduledUndoRedoPersist();
  await args.waitForSaveQueue();

  while (args.hasPendingPatchInputs()) {
    await args.flushPendingSaveBatch();
  }
}

function normalizeProjectPresenceUsers(
  event: ProjectPresenceEvent,
  projectId: string
): ProjectPresenceUser[] {
  if (event.payload?.projectId !== projectId || !Array.isArray(event.payload.users)) {
    return [];
  }

  return event.payload.users.filter(
    (user): user is ProjectPresenceUser =>
      typeof user?.id === "string" &&
      user.id.length > 0 &&
      typeof user.connectedAt === "string" &&
      user.connectedAt.length > 0
  );
}

function getPresenceUserLabel(user: ProjectPresenceUser) {
  return user.email || user.userId || user.id;
}

function getPresenceUserInitial(user: ProjectPresenceUser) {
  const label = getPresenceUserLabel(user).trim();
  if (!label) {
    return "U";
  }

  return label[0]?.toLocaleUpperCase() ?? "U";
}

function formatSocketStatus(status: EditorSocketStatus) {
  if (status === "connected") return "연결됨";
  if (status === "connecting") return "연결 중";
  if (status === "error") return "오류";
  return "연결 끊김";
}

function formatDebugDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatSessionRemaining(session: EditorSessionDebugState) {
  if (session.status === "idle" || session.status === "loading") {
    return session.message;
  }

  if (session.status === "error") {
    return session.message;
  }

  if (session.status !== "ready") {
    return "-";
  }

  const remainingMs = new Date(session.expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) {
    return "unknown";
  }

  if (remainingMs <= 0) {
    return "expired";
  }

  const remainingHours = remainingMs / (1000 * 60 * 60);
  return `${remainingHours.toFixed(1)}h`;
}

export async function putProjectDeck(
  projectId: string,
  deck: Deck,
  options: { baseVersion?: number } = {}
): Promise<Deck> {
  const response = await fetch(`/api/v1/projects/${projectId}/deck`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      baseVersion: options.baseVersion,
      deck,
      snapshotReason: "deck-replaced"
    })
  });

  if (!response.ok) {
    throw await readResponseError(response, "Deck bootstrap failed");
  }

  const payload = putDeckResponseSchema.parse(await response.json());
  emitOoxmlSyncJob(payload.ooxmlSyncJob);
  return payload.deck;
}

export function applyDeckPatchAcknowledgement(
  baseDeck: Deck,
  patch: DeckPatch,
  acknowledgement: AppendDeckPatchAckResponse
): Deck {
  const matchesRequest =
    acknowledgement.deckId === patch.deckId &&
    acknowledgement.changeRecord.deckId === patch.deckId &&
    acknowledgement.changeRecord.beforeVersion === patch.baseVersion &&
    acknowledgement.changeRecord.source === patch.source &&
    JSON.stringify(acknowledgement.changeRecord.operations) ===
      JSON.stringify(patch.operations);

  if (!matchesRequest) {
    throw new Error("Deck patch acknowledgement does not match the request");
  }

  const result = applyDeckPatch(baseDeck, patch, {
    createdAt: acknowledgement.changeRecord.createdAt
  });

  if (!result.ok || result.deck.version !== acknowledgement.version) {
    throw new Error("Deck patch acknowledgement version does not match the local result");
  }

  return result.deck;
}

async function appendProjectDeckPatchAck(
  projectId: string,
  baseDeck: Deck,
  patch: DeckPatch
): Promise<Deck> {
  const request = appendDeckPatchRequestSchema.parse({ patch, responseMode: "ack" });
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/deck/patches`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw await readResponseError(response, "Deck save failed");
  }

  const result = parseDeckPatchPersistenceResponse(
    baseDeck,
    request.patch,
    await response.json()
  );
  emitOoxmlSyncJob(result.ooxmlSyncJob);
  return result.deck;
}

export function parseDeckPatchPersistenceResponse(
  baseDeck: Deck,
  patch: DeckPatch,
  payload: unknown
): { deck: Deck; ooxmlSyncJob?: Job } {
  const acknowledgement = appendDeckPatchAckResponseSchema.safeParse(payload);
  if (acknowledgement.success) {
    return {
      deck: applyDeckPatchAcknowledgement(baseDeck, patch, acknowledgement.data),
      ooxmlSyncJob: acknowledgement.data.ooxmlSyncJob
    };
  }

  const legacyResponse = appendDeckPatchResponseSchema.safeParse(payload);
  if (legacyResponse.success) {
    return {
      deck: legacyResponse.data.deck,
      ooxmlSyncJob: legacyResponse.data.ooxmlSyncJob
    };
  }

  throw acknowledgement.error;
}

function emitOoxmlSyncJob(job: Job | undefined) {
  if (!job || typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<Job>(ooxmlSyncJobEventName, { detail: job }));
}

async function fetchDeck(projectId: string): Promise<Deck> {
  const storedDeck = await fetchProjectDeck(projectId);
  if (storedDeck) return storedDeck;
  throw new DeckRequestError("발표 자료가 아직 없습니다.", 404);
}

export async function createPptxOoxmlGenerationJob(
  projectId: string,
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/pptx-ooxml-generations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId })
    }
  );

  if (!response.ok) {
    throw new Error(
      await readPlainError(response, "PPTX OOXML generation job creation failed")
    );
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function createSemanticCueExtractionJob(
  projectId: string,
  force: boolean,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/deck/semantic-cues`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force })
    }
  );

  if (!response.ok) {
    throw new Error(
      await readPlainError(response, "Semantic Cue extraction job creation failed")
    );
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function waitForSemanticCueExtractionJob(
  jobId: string,
  fetcher: typeof fetch = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) {
      throw new Error(
        await readPlainError(response, "Semantic Cue extraction job fetch failed")
      );
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Semantic Cue extraction job timed out.");
    }
    await delay(pollIntervalMs);
  }
}

export async function waitForPptxOoxmlGenerationJob(
  jobId: string,
  fetcher: typeof fetch = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      throw new Error(
        await readPlainError(response, "PPTX OOXML generation job fetch failed")
      );
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("PPTX OOXML generation job timed out.");
    }

    await delay(pollIntervalMs);
  }
}

export async function createDeckExportJob(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/deck/exports`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "pptx" })
    }
  );

  if (!response.ok) {
    throw new Error(await readPlainError(response, "Deck export job creation failed"));
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function waitForDeckExportJob(
  jobId: string,
  fetcher: typeof fetch = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      throw new Error(await readPlainError(response, "Deck export job fetch failed"));
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Deck export job timed out.");
    }

    await delay(pollIntervalMs);
  }
}

export async function exportDeckToPptx(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<DeckExportJobResult> {
  const queuedJob = await createDeckExportJob(projectId, fetcher);
  const job = await waitForDeckExportJob(queuedJob.jobId, fetcher);
  if (job.status === "failed") {
    throw new Error(job.error?.message ?? "Deck export failed.");
  }
  return deckExportJobResultSchema.parse(job.result);
}

export async function uploadAndImportPptxTemplate(
  projectId: string,
  file: File,
  options: {
    fetcher?: typeof fetch;
    onPhase?: (phase: "uploading" | "importing") => void;
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<PptxOoxmlGenerationJobResult> {
  const validationMessage = getPptxImportValidationMessage(file);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const fetcher = options.fetcher ?? fetch;
  options.onPhase?.("uploading");
  const uploaded = await uploadProjectAsset(projectId, file, "pptx-import", fetcher);
  options.onPhase?.("importing");
  const queuedJob = await createPptxOoxmlGenerationJob(
    projectId,
    uploaded.fileId,
    fetcher
  );
  const job = await waitForPptxOoxmlGenerationJob(queuedJob.jobId, fetcher, {
    pollIntervalMs: options.pollIntervalMs,
    timeoutMs: options.timeoutMs
  });

  if (job.status === "failed") {
    throw new Error(job.error?.message ?? "PPTX OOXML generation failed.");
  }

  return pptxOoxmlGenerationJobResultSchema.parse(job.result);
}

export function requireMatchingPptxImportedDeck(
  importResult: Pick<PptxOoxmlGenerationJobResult, "deckId">,
  importedDeck: Deck | undefined
): Deck {
  if (!importedDeck) {
    throw new Error("변환된 PPTX Deck을 불러오지 못했습니다.");
  }

  if (importedDeck.deckId !== importResult.deckId) {
    throw new Error("변환 결과와 불러온 PPTX Deck이 일치하지 않습니다.");
  }

  return importedDeck;
}

export async function importPptxIntoEditor(
  projectId: string,
  file: File,
  options: {
    fetcher?: typeof fetch;
    onPhase?: (phase: "uploading" | "importing") => void;
    pollIntervalMs?: number;
    timeoutMs?: number;
    refetchDeck: () => Promise<Deck | undefined>;
  }
): Promise<{
  importResult: PptxOoxmlGenerationJobResult;
  importedDeck: Deck;
}> {
  const importResult = await uploadAndImportPptxTemplate(projectId, file, options);
  const importedDeck = requireMatchingPptxImportedDeck(
    importResult,
    await options.refetchDeck()
  );

  return { importResult, importedDeck };
}

async function readPlainError(response: Response, fallbackMessage: string) {
  const text = await response.text();
  return text || fallbackMessage;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchEditorSessionDebug(): Promise<Exclude<EditorSessionDebugState, { status: "idle" | "loading" | "error" }>> {
  const response = await fetch("/api/v1/auth/me", {
    credentials: "include"
  });

  if (!response.ok) {
    throw await readResponseError(response, "Session fetch failed");
  }

  const session = meResponseSchema.parse(await response.json());
  return {
    authenticatedAt: session.authenticatedAt,
    email: session.user.email,
    expiresAt: session.expiresAt,
    status: "ready",
    userId: session.user.userId
  };
}

export function EditorShell(props: { projectId: string }) {
  const { capabilities, project } = useProjectAccess(props.projectId);
  const queryClient = useQueryClient();
  const createInFlightRef = useRef(false);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const deckLoadQuery = useQuery({
    queryKey: ["editor-deck-load", props.projectId],
    queryFn: () => loadProjectDeck(props.projectId),
    retry: false
  });

  async function handleCreateFirstSlide() {
    if (!capabilities.canMutateDeck || createInFlightRef.current) return;

    createInFlightRef.current = true;
    setIsCreating(true);
    setCreateError("");
    try {
      const deck = await createInitialProjectDeck(project);
      queryClient.setQueryData(["deck", props.projectId], deck);
      queryClient.setQueryData(["editor-deck-load", props.projectId], {
        kind: "ready",
        deck
      } satisfies ProjectDeckLoadResult);
    } catch (error) {
      const refreshed = await deckLoadQuery.refetch();
      if (refreshed.data?.kind !== "ready") {
        setCreateError(
          error instanceof Error
            ? error.message
            : "첫 슬라이드를 만들지 못했습니다. 다시 시도해 주세요."
        );
      }
    } finally {
      createInFlightRef.current = false;
      setIsCreating(false);
    }
  }

  if (deckLoadQuery.isPending) {
    return <EditorStateNotice kind="loading" />;
  }

  const loadResult = deckLoadQuery.data;
  if (!loadResult || loadResult.kind === "network-error" || loadResult.kind === "server-error" || loadResult.kind === "access-denied") {
    return (
      <EditorStateNotice
        kind="error"
        message={loadResult?.message ?? "발표 자료를 불러오지 못했습니다."}
        onRetry={() => void deckLoadQuery.refetch()}
      />
    );
  }

  if (loadResult.kind === "missing") {
    return (
      <EditorStateNotice
        canCreate={capabilities.canMutateDeck}
        createError={createError}
        isCreating={isCreating}
        kind="missing"
        onCreate={() => void handleCreateFirstSlide()}
      />
    );
  }

  return (
    <EditorRuntime
      capabilities={capabilities}
      initialDeck={loadResult.deck}
      projectId={props.projectId}
    />
  );
}

function EditorRuntime(props: {
  capabilities: EditorCapabilities;
  initialDeck: Deck;
  projectId: string;
}) {
  const projectId = props.projectId;
  const capabilities = props.capabilities;
  const canMutateDeck = capabilities.canMutateDeck;
  const [projectEditorZoom, setProjectEditorZoom] =
    useState<ProjectEditorZoomState>(() => ({
      projectId,
      zoom: readProjectEditorZoom(projectId)
    }));
  const editorZoomState =
    projectEditorZoom.projectId === projectId
      ? projectEditorZoom.zoom
      : fitEditorZoomState;
  const isDev = import.meta.env.DEV;
  const queryClient = useQueryClient();
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(
    props.initialDeck.slides[0]?.slideId ?? null,
  );
  const resetProjectUiState = useEditorShellUiStore(
    (state) => state.resetProjectUiState
  );
  const isDataViewOpen = useEditorShellUiStore((state) => state.isDataViewOpen);
  const setIsDataViewOpen = useEditorShellUiStore((state) => state.setIsDataViewOpen);
  const isAnimationPanelOpen = useEditorShellUiStore(
    (state) => state.isAnimationPanelOpen
  );
  const setIsAnimationPanelOpen = useEditorShellUiStore(
    (state) => state.setIsAnimationPanelOpen
  );
  const isRightPanelOpen = useEditorShellUiStore((state) => state.isRightPanelOpen);
  const setIsRightPanelOpen = useEditorShellUiStore(
    (state) => state.setIsRightPanelOpen
  );
  const compactSelectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectionInspectorRef = useRef<HTMLElement | null>(null);
  const [rightPanelView, setRightPanelView] = useState<
    "journey" | "ai" | "design"
  >("ai");
  const [aiPanelView, setAiPanelView] = useState<
    "chat" | "tools" | "semantic-cues"
  >("chat");
  const [aiChatState, setAiChatState] = useState(() =>
    createInitialAiChatState(projectId)
  );
  const isSlidesPaneCollapsed = useEditorShellUiStore(
    (state) => state.isSlidesPaneCollapsed
  );
  const setIsSlidesPaneCollapsed = useEditorShellUiStore(
    (state) => state.setIsSlidesPaneCollapsed
  );
  const slidesPaneWidth = useEditorShellUiStore((state) => state.slidesPaneWidth);
  const setSlidesPaneWidth = useEditorShellUiStore(
    (state) => state.setSlidesPaneWidth
  );
  const animationPaneWidth = useEditorShellUiStore(
    (state) => state.animationPaneWidth
  );
  const setAnimationPaneWidth = useEditorShellUiStore(
    (state) => state.setAnimationPaneWidth
  );
  const rightPaneWidth = useEditorShellUiStore((state) => state.rightPaneWidth);
  const setRightPaneWidth = useEditorShellUiStore((state) => state.setRightPaneWidth);
  const [projectPresenceUsers, setProjectPresenceUsers] = useState<ProjectPresenceUser[]>([]);
  const isPresenceDebugOpen = useEditorShellUiStore(
    (state) => state.isPresenceDebugOpen
  );
  const setIsPresenceDebugOpen = useEditorShellUiStore(
    (state) => state.setIsPresenceDebugOpen
  );
  const isAudienceLinkModalOpen = useEditorShellUiStore(
    (state) => state.isAudienceLinkModalOpen
  );
  const setIsAudienceLinkModalOpen = useEditorShellUiStore(
    (state) => state.setIsAudienceLinkModalOpen
  );
  const isExitConfirmOpen = useEditorShellUiStore((state) => state.isExitConfirmOpen);
  const setIsExitConfirmOpen = useEditorShellUiStore(
    (state) => state.setIsExitConfirmOpen
  );
  const [isExitSaving, setIsExitSaving] = useState(false);
  const animationPanelFocusedAnimationId = useEditorShellUiStore(
    (state) => state.animationPanelFocusedAnimationId
  );
  const setAnimationPanelFocusedAnimationId = useEditorShellUiStore(
    (state) => state.setAnimationPanelFocusedAnimationId
  );
  const [lastPresenceAt, setLastPresenceAt] = useState<string | null>(null);
  const [socketErrorMessage, setSocketErrorMessage] = useState("");
  const [socketId, setSocketId] = useState("");
  const [socketStatus, setSocketStatus] = useState<EditorSocketStatus>("disconnected");
  const [sessionDebug, setSessionDebug] = useState<EditorSessionDebugState>({
    message: "세션 정보를 아직 조회하지 않았습니다.",
    status: "idle"
  });
  const slidePanelView = useEditorShellUiStore((state) => state.slidePanelView);
  const setSlidePanelView = useEditorShellUiStore((state) => state.setSlidePanelView);
  const showIds = useEditorShellUiStore((state) => state.showIds);
  const selectedKeywordId = useEditorShellUiStore((state) => state.selectedKeywordId);
  const setSelectedKeywordId = useEditorShellUiStore(
    (state) => state.setSelectedKeywordId
  );
  const selectedKeywordOccurrenceKey = useEditorShellUiStore(
    (state) => state.selectedKeywordOccurrenceKey
  );
  const setSelectedKeywordOccurrenceKey = useEditorShellUiStore(
    (state) => state.setSelectedKeywordOccurrenceKey
  );
  const [isSpeakerNotesEditing, setIsSpeakerNotesEditing] = useState(false);
  const [isSpeakerNotesPanelExpanded, setIsSpeakerNotesPanelExpanded] =
    useState(false);
  const [isSpeakerNotesPanelResizing, setIsSpeakerNotesPanelResizing] =
    useState(false);
  const [speakerNotesPanelHeight, setSpeakerNotesPanelHeight] = useState(
    defaultSpeakerNotesPanelHeight
  );
  const [speakerNotesDraft, setSpeakerNotesDraft] = useState("");
  const [speakerNotesDraftBase, setSpeakerNotesDraftBase] = useState("");
  const [speakerNotesEditSlideId, setSpeakerNotesEditSlideId] = useState<
    string | null
  >(null);
  const [isSpeakerNotesAssistantOpen, setIsSpeakerNotesAssistantOpen] =
    useState(false);
  const [speakerNotesAssistantMode, setSpeakerNotesAssistantMode] =
    useState<SpeakerNotesSuggestionMode>("naturalize");
  const [speakerNotesAssistantStatus, setSpeakerNotesAssistantStatus] =
    useState<SpeakerNotesAssistantStatus>("idle");
  const [speakerNotesAssistantResult, setSpeakerNotesAssistantResult] =
    useState<SpeakerNotesSuggestionResult | null>(null);
  const [speakerNotesAssistantError, setSpeakerNotesAssistantError] =
    useState("");
  const [speakerNotesAssistantSource, setSpeakerNotesAssistantSource] = useState<{
    baseVersion: number;
    notes: string;
    slideId: string;
  } | null>(null);
  const selectedElementIds = useEditorShellUiStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useEditorShellUiStore(
    (state) => state.setSelectedElementIds
  );
  const [validationHighlightElementIds, setValidationHighlightElementIds] =
    useState<string[]>([]);
  const [validationRepairStatus, setValidationRepairStatus] = useState("");
  const activeTopMenu = useEditorShellUiStore((state) => state.activeTopMenu);
  const setActiveTopMenu = useEditorShellUiStore((state) => state.setActiveTopMenu);
  const [lastPatchLabel, setLastPatchLabel] = useState("편집 없음");
  const insertTool = useEditorShellUiStore((state) => state.insertTool);
  const setInsertTool = useEditorShellUiStore((state) => state.setInsertTool);
  const editingElementId = useEditorShellUiStore((state) => state.editingElementId);
  const setEditingElementId = useEditorShellUiStore(
    (state) => state.setEditingElementId
  );
  const customShapeEditElementId = useEditorShellUiStore(
    (state) => state.customShapeEditElementId
  );
  const setCustomShapeEditElementId = useEditorShellUiStore(
    (state) => state.setCustomShapeEditElementId
  );
  const isShapeMenuOpen = useEditorShellUiStore((state) => state.isShapeMenuOpen);
  const setIsShapeMenuOpen = useEditorShellUiStore(
    (state) => state.setIsShapeMenuOpen
  );
  const shapeMenuPosition = useEditorShellUiStore((state) => state.shapeMenuPosition);
  const setShapeMenuPosition = useEditorShellUiStore(
    (state) => state.setShapeMenuPosition
  );
  const elementContextMenu = useEditorShellUiStore((state) => state.elementContextMenu);
  const setElementContextMenu = useEditorShellUiStore(
    (state) => state.setElementContextMenu
  );
  const [isImageUploadPending, setIsImageUploadPending] = useState(false);
  const [pptxImportState, setPptxImportState] = useState<PptxImportState>({
    status: "idle",
    warnings: [],
    qualityReport: null,
    message: ""
  });
  const [semanticCueExtractionState, setSemanticCueExtractionState] =
    useState<SemanticCueExtractionUiState>({ status: "idle", message: "" });
  const [activePresentationAction, setActivePresentationAction] = useState<
    PresentationJourneyDestination | null
  >(null);
  const [presentationJourneyStatus, setPresentationJourneyStatus] = useState("");
  const presentationJourneyConflictRef = useRef(false);
  const presentationJourneySnapshotRef = useRef<string | undefined>(undefined);
  const presentationJourneyDependenciesRef =
    useRef<PresentationJourneyNavigationDependencies | null>(null);
  const presentationJourneyCoordinatorRef =
    useRef<PresentationJourneyNavigationCoordinator | null>(null);
  if (!presentationJourneyCoordinatorRef.current) {
    presentationJourneyCoordinatorRef.current =
      createPresentationJourneyNavigationCoordinator({
        navigate: (destination) =>
          presentationJourneyDependenciesRef.current?.navigate(destination),
        prepare: (destination) =>
          presentationJourneyDependenciesRef.current?.prepare?.(destination),
        save: (destination) =>
          presentationJourneyDependenciesRef.current?.save(destination) ?? {
            status: "blocked",
            reason: "save-error",
            recoveryMessage: "발표 준비 상태를 확인한 뒤 다시 시도해 주세요."
          }
      });
  }
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [isDeleteUndoToastOpen, setIsDeleteUndoToastOpen] = useState(false);
  const topbarRef = useRef<HTMLElement | null>(null);
  const hasExpandedSpeakerNotesPanelRef = useRef(false);
  const shouldMeasureInitialSpeakerNotesHeightRef = useRef(false);
  const speakerNotesContentRef = useRef<HTMLDivElement | null>(null);
  const speakerNotesPanelHeightRef = useRef(defaultSpeakerNotesPanelHeight);
  const shapeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pptxFileInputRef = useRef<HTMLInputElement | null>(null);
  const copiedElementRef = useRef<ElementClipboardState | null>(null);
  const editorStageRef = useRef<Konva.Stage | null>(null);
  const slideRenderStageRefs = useRef(new Map<string, Konva.Stage>());
  const isEditorRuntimeMountedRef = useRef(true);
  const slideRenderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastThumbnailDeckRef = useRef<Deck | null>(null);
  const slideThumbnailObjectUrlsRef = useRef(new Map<string, string>());
  const undoRedoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRedoPersistLabelRef = useRef<string | null>(null);
  const [renderingDeck, setRenderingDeck] = useState<Deck | null>(null);
  const [slideThumbnailUrls, setSlideThumbnailUrls] = useState<Record<string, string>>({});
  const [ooxmlSyncJob, setOoxmlSyncJob] = useState<Job | null>(null);

  useEffect(() => {
    isEditorRuntimeMountedRef.current = true;
    return () => {
      isEditorRuntimeMountedRef.current = false;
      slideRenderStageRefs.current.clear();
    };
  }, []);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });

  const deckQuery = useQuery({
    queryKey: ["deck", projectId],
    queryFn: () => fetchDeck(projectId),
    initialData: props.initialDeck,
    retry: false
  });
  const presentationBriefQuery = useQuery({
    queryKey: presentationBriefQueryKey(projectId),
    queryFn: () => fetchPresentationBrief(projectId),
    retry: false
  });

  useEffect(() => {
    resetProjectUiState();
    setRightPanelView("ai");
    setAiPanelView("chat");
    setAiChatState(createInitialAiChatState(projectId));
    setSemanticCueExtractionState({ status: "idle", message: "" });
    setIsSpeakerNotesAssistantOpen(false);
    setSpeakerNotesAssistantStatus("idle");
    setSpeakerNotesAssistantResult(null);
    setSpeakerNotesAssistantError("");
    setSpeakerNotesAssistantSource(null);
    setIsSpeakerNotesPanelExpanded(false);
    hasExpandedSpeakerNotesPanelRef.current = false;
    shouldMeasureInitialSpeakerNotesHeightRef.current = false;
    setSpeakerNotesPanelHeight(defaultSpeakerNotesPanelHeight);
    speakerNotesPanelHeightRef.current = defaultSpeakerNotesPanelHeight;
  }, [projectId, resetProjectUiState]);

  useEffect(() => {
    setProjectEditorZoom((current) =>
      current.projectId === projectId
        ? current
        : {
            projectId,
            zoom: readProjectEditorZoom(projectId)
          }
    );
  }, [projectId]);

  useEffect(() => {
    if (projectEditorZoom.projectId !== projectId) {
      return;
    }

    persistProjectEditorZoom(projectId, projectEditorZoom.zoom);
  }, [projectEditorZoom, projectId]);

  useEffect(() => {
    if (
      !isSpeakerNotesPanelExpanded ||
      !shouldMeasureInitialSpeakerNotesHeightRef.current ||
      !speakerNotesContentRef.current
    ) {
      return;
    }

    shouldMeasureInitialSpeakerNotesHeightRef.current = false;
    commitSpeakerNotesPanelHeight(
      Math.max(
        initialSpeakerNotesPanelHeight,
        speakerNotesContentRef.current.scrollHeight + 65
      )
    );
  }, [isSpeakerNotesPanelExpanded]);

  useEffect(() => {
    const socket: ClientSocket = io({
      withCredentials: true
    });
    setSocketStatus("connecting");
    setSocketErrorMessage("");

    function joinProjectRoom() {
      socket.emit("project:join", { projectId });
    }

    function handlePresence(event: ProjectPresenceEvent) {
      const users = normalizeProjectPresenceUsers(event, projectId);
      setProjectPresenceUsers(users);
      setLastPresenceAt(new Date().toISOString());
    }

    function handleConnect() {
      setSocketId(socket.id ?? "");
      setSocketStatus("connected");
      setSocketErrorMessage("");
      joinProjectRoom();
    }

    function handleConnectError(error: Error) {
      setSocketStatus("error");
      setSocketErrorMessage(error.message);
      setProjectPresenceUsers([]);
    }

    function handleProjectError(error: { message?: string }) {
      setSocketStatus("error");
      setSocketErrorMessage(error.message ?? "Project socket join failed.");
      setProjectPresenceUsers([]);
    }

    function handleDisconnect() {
      setSocketId("");
      setSocketStatus("disconnected");
      setProjectPresenceUsers([]);
    }

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("project:presence", handlePresence);
    socket.on("project:error", handleProjectError);
    socket.on("disconnect", handleDisconnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("project:presence", handlePresence);
      socket.off("project:error", handleProjectError);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
    };
  }, [projectId]);

  useEffect(() => {
    if (!isPresenceDebugOpen) {
      return;
    }

    let isCancelled = false;
    setSessionDebug({
      message: "세션 정보를 불러오는 중입니다.",
      status: "loading"
    });
    void fetchEditorSessionDebug()
      .then((session) => {
        if (!isCancelled) {
          setSessionDebug(session);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setSessionDebug({
            message: toEditorErrorMessage(error),
            status: "error"
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isPresenceDebugOpen]);

  useEffect(() => {
    function handleOoxmlSyncJob(event: Event) {
      const job = (event as CustomEvent<Job>).detail;
      setOoxmlSyncJob(jobSchema.parse(job));
    }

    window.addEventListener(ooxmlSyncJobEventName, handleOoxmlSyncJob);
    return () =>
      window.removeEventListener(ooxmlSyncJobEventName, handleOoxmlSyncJob);
  }, []);

  useEffect(() => {
    if (!ooxmlSyncJob || ["succeeded", "failed"].includes(ooxmlSyncJob.status)) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      void fetch(`/api/jobs/${encodeURIComponent(ooxmlSyncJob.jobId)}`)
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }

          return jobSchema.parse(await response.json());
        })
        .then((job) => {
          if (!isCancelled && job) {
            setOoxmlSyncJob(job);
          }
        })
        .catch(() => undefined);
    }, 1800);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [ooxmlSyncJob]);

  const loadedDeck = deckQuery.data ?? props.initialDeck;
  const [deck, setDeck] = useState<Deck>(loadedDeck);
  const {
    applyAckedPersistedDeck,
    applyOptimisticWorkingDeck,
    hasHydratedPersistedBaseRef,
    hasUnackedLocalChangesRef,
    isSaveFlushInFlightRef,
    lastSavedAt,
    lastAckedDeckRef,
    markHydratedPersistedDeck,
    pendingPatchInputsRef,
    persistedBaseDeckRef,
    replaceWorkingDeck,
    saveErrorCode,
    saveErrorMessage,
    saveQueueRef,
    saveState,
    setSaveError,
    setLastSavedAt,
    setSaveState,
    workingDeckRef
  } = useEditorPersistenceState(loadedDeck);
  const [isPptxExporting, setIsPptxExporting] = useState(false);
  const [pptxExportStatus, setPptxExportStatus] = useState("");
  const [pptxExportError, setPptxExportError] = useState("");
  const {
    canManageShare,
    handleShareInvite,
    handleShareMemberRemoval,
    handleShareMemberRoleChange,
    handleShareRequestStatus,
    isShareLoading,
    isSharePanelOpen,
    isSharePermissionLoading,
    openSharePanel,
    setIsSharePanelOpen,
    setShareAccessTab,
    setShareInviteEmail,
    setShareInviteRole,
    shareAccessTab,
    shareActionError,
    shareActionLabel,
    shareInviteEmail,
    shareInviteRole,
    shareMembers,
    shareRequests
  } = useProjectShareAccess({
    projectId: deckQuery.data?.projectId ?? projectId,
    toErrorMessage: toEditorErrorMessage,
    workspaceId: demoIds.workspaceId
  });
  const imageUploadTargetRef = useRef<ImageUploadTarget | null>(null);
  const resolvedUploadProjectIdRef = useRef<string | null>(null);
  const isUsingFallbackDeck = false;
  const isDeckLoading = deckQuery.isPending;
  const isDeckError = deckQuery.isError;
  const canOpenAudienceLink =
    Boolean(deckQuery.data?.projectId) &&
    !isDeckLoading &&
    !isDeckError;
  const canStartPresentation =
    canOpenAudienceLink && !activePresentationAction;
  const hasSlides = deck.slides.length > 0;
  const resolvedCurrentSlideId = resolveSelectedSlideId(
    deck.slides,
    currentSlideId,
  );
  const currentSlideIndex = resolvedCurrentSlideId
    ? deck.slides.findIndex((slide) => slide.slideId === resolvedCurrentSlideId)
    : -1;
  const currentSlide =
    currentSlideIndex >= 0 ? deck.slides[currentSlideIndex] ?? null : null;
  const slideRailItems = useMemo(
    () => buildSlideRailItems(deck.slides, resolvedCurrentSlideId),
    [deck.slides, resolvedCurrentSlideId],
  );
  const slideRailThumbnailBackgrounds = useMemo(
    () => Object.fromEntries(
      deck.slides.map((slide) => [
        slide.slideId,
        buildSlideThumbBackground(slide, deck, slideThumbnailUrls[slide.slideId]),
      ]),
    ),
    [deck, slideThumbnailUrls],
  );
  const speakerNotesLengthGuidance = useMemo(
    () =>
      getSpeakerNotesLengthGuidance(
        isSpeakerNotesEditing
          ? speakerNotesDraft
          : (currentSlide?.speakerNotes ?? ""),
        currentSlide?.aiNotes?.timingPlan,
      ),
    [
      currentSlide?.aiNotes?.timingPlan,
      currentSlide?.speakerNotes,
      isSpeakerNotesEditing,
      speakerNotesDraft,
    ],
  );
  const saveStatusLabel = getEditorStatusLabel({
    isDeckError,
    isDeckLoading,
    isUsingFallbackDeck,
    saveState
  });
  const ooxmlSyncStatus = getOoxmlSyncStatus(ooxmlSyncJob);
  function hasUnsavedEditorChanges() {
    return hasPendingEditorChanges({
      hasUnackedLocalChanges: hasUnackedLocalChangesRef.current,
      pendingPatchCount: pendingPatchInputsRef.current.length,
      saveState
    });
  }
  const visibleElements = currentSlide
    ? getRenderableSlideElements(currentSlide, deck.canvas)
    : [];
  const editorValidationItems = useMemo(
    () => getEditorValidationItems(deck),
    [deck]
  );
  const presentationJourneyModel = useMemo(
    () =>
      createPresentationJourneyViewModel({
        briefState: presentationBriefQuery.isPending
          ? "loading"
          : presentationBriefQuery.isError
            ? "error"
            : presentationBriefQuery.data
              ? "ready"
              : "missing",
        capabilities,
        quality: {
          deckVersion: deck.version,
          riskCount: editorValidationItems.filter(
            (item) => item.severity === "risk"
          ).length,
          warningCount: editorValidationItems.filter(
            (item) => item.severity === "warning"
          ).length
        },
        saveState: toPresentationJourneySaveState(saveState)
      }),
    [
      capabilities,
      deck.version,
      editorValidationItems,
      presentationBriefQuery.data,
      presentationBriefQuery.isError,
      presentationBriefQuery.isPending,
      saveState
    ]
  );
  presentationJourneyDependenciesRef.current = {
    navigate: navigateFromPresentationJourney,
    prepare: preparePresentationJourneyDestination,
    save: saveBeforePresentationJourneyNavigation
  };
  const presentedEditorValidationItems = useMemo(
    () => presentEditorValidationItems(deck, editorValidationItems),
    [deck, editorValidationItems]
  );
  const safeTextOverflowRepair = useMemo(
    () => createSafeTextOverflowRepair({ deck, items: editorValidationItems }),
    [deck, editorValidationItems]
  );
  const [editorViewportWidth, setEditorViewportWidth] = useState<number | null>(null);
  const [editorCanvasViewport, setEditorCanvasViewport] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const editorCanvasViewportRef = useRef<HTMLDivElement | null>(null);
  const wasCompactEditorLayoutRef = useRef(false);
  useEffect(() => {
    const syncEditorViewportWidth = () => setEditorViewportWidth(window.innerWidth);
    syncEditorViewportWidth();
    window.addEventListener("resize", syncEditorViewportWidth);
    return () => window.removeEventListener("resize", syncEditorViewportWidth);
  }, []);
  useEffect(() => {
    const canvasViewport = editorCanvasViewportRef.current;
    if (!canvasViewport) {
      return;
    }

    const syncCanvasViewport = () => {
      setEditorCanvasViewport({
        height: canvasViewport.clientHeight,
        width: canvasViewport.clientWidth,
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncCanvasViewport);

    syncCanvasViewport();
    resizeObserver?.observe(canvasViewport);
    window.addEventListener("resize", syncCanvasViewport);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncCanvasViewport);
    };
  }, []);
  useEffect(() => {
    if (editorViewportWidth === null) {
      return;
    }

    const isCompactLayout = editorViewportWidth <= 860;
    if (
      isCompactLayout &&
      !wasCompactEditorLayoutRef.current &&
      isRightPanelOpen
    ) {
      setIsRightPanelOpen(false);
    }
    wasCompactEditorLayoutRef.current = isCompactLayout;
  }, [editorViewportWidth, isRightPanelOpen, setIsRightPanelOpen]);
  const stageScale = resolveEditorStageScale(
    editorZoomState,
    deck.canvas.width,
    editorCanvasViewport?.width ?? editorViewportWidth,
    deck.canvas.height,
    editorCanvasViewport?.height,
  );
  const zoomPercent = Math.round(stageScale * 100);

  function updateEditorZoom(zoom: EditorZoomState) {
    setProjectEditorZoom({ projectId, zoom });
  }

  function handleEditorZoomStep(direction: "in" | "out") {
    updateEditorZoom({
      mode: "manual",
      scale: stepEditorZoom(stageScale, direction)
    });
  }

  useEffect(() => {
    if (editorZoomState.mode !== "fit") {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      if (editorCanvasViewportRef.current) {
        editorCanvasViewportRef.current.scrollLeft = 0;
        editorCanvasViewportRef.current.scrollTop = 0;
      }
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [
    editorCanvasViewport?.height,
    editorCanvasViewport?.width,
    editorZoomState.mode,
    stageScale
  ]);
  const currentSlideAnimations = useMemo(
    () =>
      currentSlide
        ? [...currentSlide.animations].sort(
            (left, right) => left.order - right.order
          )
        : [],
    [currentSlide]
  );
  const currentSlideKeywordActionUsage = useMemo(
    () =>
      currentSlide
        ? deriveKeywordActionUsage(currentSlide)
        : { byKeywordId: {}, byOccurrenceId: {} },
    [currentSlide]
  );
  const currentSlideKeywordUsage = currentSlideKeywordActionUsage.byKeywordId;
  const speakerNotesAssistantSlide = speakerNotesAssistantSource
    ? deck.slides.find(
        (slide) => slide.slideId === speakerNotesAssistantSource.slideId,
      ) ?? null
    : null;
  const speakerNotesAssistantOccurrenceWarning =
    speakerNotesAssistantSlide && speakerNotesAssistantResult
      ? getSpeakerNotesDanglingOccurrenceSaveBlock(
          speakerNotesAssistantSlide,
          speakerNotesAssistantResult.suggestedNotes,
        )?.message
      : undefined;
  const animationPanelKeywordOptions = useMemo(
    () => toAnimationKeywordTriggerOptions(currentSlide?.keywords ?? []),
    [currentSlide?.keywords]
  );
  const selectedKeyword =
    currentSlide?.keywords.find(
      (keyword) => keyword.keywordId === selectedKeywordId
    ) ?? null;
  const selectedKeywordUsage = selectedKeyword
    ? selectedKeywordOccurrenceKey
      ? currentSlideKeywordActionUsage.byOccurrenceId[
          selectedKeywordOccurrenceKey
        ] ?? {
          keywordId: selectedKeyword.keywordId,
          occurrenceId: selectedKeywordOccurrenceKey,
          animationIds: [],
          advancesSlide: false
        }
      : currentSlideKeywordUsage[selectedKeyword.keywordId] ?? null
    : null;
  const selectedKeywordRequiredActive = selectedKeyword
    ? selectedKeywordOccurrenceKey
      ? (selectedKeyword.requiredOccurrenceIds ?? []).includes(
          selectedKeywordOccurrenceKey
        )
      : selectedKeyword.required
    : false;
  const selectedElementId = selectedElementIds.at(-1) ?? null;
  const selectedElements = visibleElements.filter((element) =>
    selectedElementIds.includes(element.elementId)
  );
  const selectedElement =
    selectedElementIds.length === 1
      ? selectedElements.find((element) => element.elementId === selectedElementId) ?? null
      : null;
  const isCompactEditorLayout =
    resolveSelectionInspectorCompactMode(editorViewportWidth) === true;
  const selectionInspectorModel = createSelectionInspectorModel({
    compact: resolveSelectionInspectorCompactMode(editorViewportWidth),
    currentSlideElementIds: visibleElements.map((element) => element.elementId),
    origin: "programmatic",
    selectedElementIds
  });
  const selectedAnimationPanelElement =
    selectedElement ??
    (selectedElementIds.length === 1
      ? currentSlide?.elements.find(
          (element) => element.elementId === selectedElementId
        ) ?? null
      : null);
  const selectedElementAnimations = useMemo(
    () =>
      currentSlide && selectedAnimationPanelElement
        ? getElementAnimations(currentSlide, selectedAnimationPanelElement.elementId)
        : [],
    [currentSlide, selectedAnimationPanelElement]
  );
  const animationKeywordTriggerPolicy = useMemo(
    () =>
      buildAnimationKeywordTriggerPolicy({
        element: selectedAnimationPanelElement,
        keywordId: selectedKeywordId,
        keywordOccurrenceId: selectedKeywordOccurrenceKey,
        slideAnimations: currentSlide?.animations ?? [],
        usageByKeywordId: currentSlideKeywordUsage
      }),
    [
      currentSlide?.animations,
      currentSlideKeywordUsage,
      selectedAnimationPanelElement,
      selectedKeywordId,
      selectedKeywordOccurrenceKey
    ]
  );
  const currentSlideAnimationDiagnostics = useMemo(
    () =>
      currentSlide
        ? validateSlideAnimations(currentSlide, selectedAnimationPanelElement?.elementId)
        : null,
    [currentSlide, selectedAnimationPanelElement?.elementId]
  );
  const {
    canPlay: canPlayCurrentSlideAnimations,
    elementStates: animationPreviewElementStates,
    isPlaying: isPlayingCurrentSlideAnimations,
    play: playCurrentSlideAnimations
  } = useEditorAnimationPreview({
    deck,
    slide: currentSlide
  });

  useEffect(() => {
    setValidationHighlightElementIds([]);
  }, [currentSlide?.slideId]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasPendingEditorChanges({
        hasUnackedLocalChanges: hasUnackedLocalChangesRef.current,
        pendingPatchCount: pendingPatchInputsRef.current.length,
        saveState
      })) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnackedLocalChangesRef, pendingPatchInputsRef, saveState]);

  function handleExitToHome() {
    if (hasUnsavedEditorChanges()) {
      setActiveTopMenu(null);
      setIsExitConfirmOpen(true);
      return;
    }

    setActiveTopMenu(null);
    navigateToHome();
  }

  function handleDiscardAndExit() {
    setIsExitConfirmOpen(false);
    navigateToHome();
  }

  async function handleSaveAndExit() {
    if (isExitSaving) {
      return;
    }

    setIsExitSaving(true);

    try {
      const saved = await handleSaveDeck();

      if (!saved) {
        return;
      }

      setIsExitConfirmOpen(false);
      navigateToHome();
    } finally {
      setIsExitSaving(false);
    }
  }

  const isCustomShapeEditingSelection =
    selectedElement?.type === "customShape" &&
    selectedElement.elementId === customShapeEditElementId;
  const fileMenuItems = [
    {
      action: "import",
      icon: Upload,
      label: "PPTX 가져오기",
      meta: pptxImportMenuMeta(pptxImportState)
    },
    {
      action: "save",
      icon: Cloud,
      label: isSaveInFlight(saveState) ? "저장 중..." : "저장",
      meta: saveErrorMessage
        ? getSaveErrorStatusLabel(saveErrorCode)
        : deckQuery.data
          ? saveStatusLabel
          : "저장 기록 없음"
    }
  ];
  const resolvedExportMenuItems = [{
    action: "pptx" as const,
    disabled: isPptxExporting,
    icon: Download,
    label: isPptxExporting ? "PPTX 내보내는 중..." : "PPTX 내보내기",
    meta: pptxExportError || pptxExportStatus
  }];
  useEffect(() => {
    const persistedDeck = deckQuery.data;

    if (!persistedDeck) {
      return;
    }

    if (
      !shouldHydrateDeckFromQuery({
        currentDeck: workingDeckRef.current,
        nextDeck: persistedDeck,
        hasHydratedPersistedDeck: hasHydratedPersistedBaseRef.current,
        hasLocalOptimisticChanges: hasUnackedLocalChangesRef.current
      })
    ) {
      return;
    }

    const shouldResetEditorState =
      !hasHydratedPersistedBaseRef.current ||
      workingDeckRef.current.deckId !== persistedDeck.deckId ||
      workingDeckRef.current.projectId !== persistedDeck.projectId;

    markHydratedPersistedDeck(persistedDeck, setDeck);

    if (!shouldResetEditorState) {
      return;
    }

    setUndoStack([]);
    setRedoStack([]);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
  }, [deckQuery.data]);

  useEffect(() => {
    const persistedDeck = deckQuery.data;
    if (!persistedDeck) return;

    refreshChangedSlideThumbnails(persistedDeck);
  }, [deckQuery.data]);

  useEffect(() => {
    return () => {
      for (const url of slideThumbnailObjectUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      slideThumbnailObjectUrlsRef.current.clear();
      lastThumbnailDeckRef.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    if (!deckQuery.data?.projectId) {
      return;
    }

    resolvedUploadProjectIdRef.current = deckQuery.data.projectId;
  }, [deckQuery.data]);

  function handleDesignAgentProposalApplied(
    response: ApplyDesignAgentProposalResponse
  ) {
    if (!capabilities.canUseAiMutations) return;
    const previousDeck = workingDeckRef.current;

    queryClient.setQueryData(["deck", projectId], response.deck);
    markHydratedPersistedDeck(response.deck, setDeck);
    setLastSavedAt(response.changeRecord.createdAt);
    setUndoStack((current) =>
      appendAppliedDesignProposalHistory({
        currentDeck: previousDeck,
        currentSlideId: resolvedCurrentSlideId,
        undoStack: current
      })
    );
    setRedoStack([]);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    setLastPatchLabel(`AI design · v${response.deck.version}`);
    setSaveState("auto-saved");
    setSaveError(null, null);
  }

  function applyPersistedDeck(nextDeck: Deck) {
    queryClient.setQueryData(["deck", projectId], nextDeck);
    applyAckedPersistedDeck(nextDeck);
    flushSync(() => {
      setDeck(nextDeck);
    });
  }

  async function renderSlideFiles(
    sourceDeck: Deck,
    slideIds?: readonly string[],
    options: { requireAssets?: boolean } = {},
  ) {
    if (sourceDeck.slides.length === 0) {
      return {
        files: new Map<string, File>(),
        missingAssetCount: 0,
      };
    }

    const nextDeck = structuredClone(normalizeDeckAssetUrls(sourceDeck));
    const targetSlideIds = slideIds ? new Set(slideIds) : null;
    if (targetSlideIds?.size === 0) {
      return {
        files: new Map<string, File>(),
        missingAssetCount: 0,
      };
    }

    const files = new Map<string, File>();
    let missingAssetCount = 0;
    const targetSlides = nextDeck.slides.filter(
      (slide) => !targetSlideIds || targetSlideIds.has(slide.slideId),
    );
    if (options.requireAssets) {
      const missingCounts = await Promise.all(
        targetSlides.map((slide) => waitForSlideAssets(slide, nextDeck)),
      );
      missingAssetCount = missingCounts.reduce(
        (total, count) => total + count,
        0,
      );
      requireLoadedRehearsalSnapshotAssets(missingAssetCount);
    }
    slideRenderStageRefs.current.clear();
    flushSync(() => {
      setRenderingDeck(nextDeck);
    });
    try {
      await waitForSlideRenderStages(
        targetSlides.map((slide) => slide.slideId),
        slideRenderStageRefs.current,
        waitForAnimationFrame,
        90,
        () => !isEditorRuntimeMountedRef.current
      );

      for (let index = 0; index < nextDeck.slides.length; index += 1) {
        const slide = nextDeck.slides[index];
        if (targetSlideIds && !targetSlideIds.has(slide.slideId)) {
          continue;
        }

        if (!options.requireAssets) {
          missingAssetCount += await waitForSlideAssets(slide, nextDeck);
        }

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
          requireAssets: options.requireAssets,
        });
        files.set(slide.slideId, renderFile);
      }
    } finally {
      if (isEditorRuntimeMountedRef.current) {
        flushSync(() => {
          setRenderingDeck(null);
        });
      }
      slideRenderStageRefs.current.clear();
    }

    return {
      files,
      missingAssetCount,
    };
  }

  function enqueueSlideRender<T>(render: () => Promise<T>) {
    const result = slideRenderQueueRef.current.then(render, render);
    slideRenderQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function syncSlideThumbnailCache(
    sourceDeck: Deck,
    slideIds?: readonly string[],
  ) {
    return enqueueSlideRender(async () => {
      const renderResult = await renderSlideFiles(sourceDeck, slideIds);
      const nextUrls = new Map(slideThumbnailObjectUrlsRef.current);
      const retiredUrls: string[] = [];
      const latestDeck = lastThumbnailDeckRef.current ?? sourceDeck;
      const staleSlideIds = new Set(
        getDeckThumbnailRefreshSlideIds(sourceDeck, latestDeck),
      );

      for (const [slideId, file] of renderResult.files) {
        if (
          staleSlideIds.has(slideId) ||
          !latestDeck.slides.some((slide) => slide.slideId === slideId)
        ) {
          continue;
        }
        const previousUrl = nextUrls.get(slideId);
        if (previousUrl) retiredUrls.push(previousUrl);
        nextUrls.set(slideId, URL.createObjectURL(file));
      }

      const currentSlideIds = new Set(latestDeck.slides.map((slide) => slide.slideId));
      for (const [slideId, url] of nextUrls) {
        if (!currentSlideIds.has(slideId)) {
          retiredUrls.push(url);
          nextUrls.delete(slideId);
        }
      }

      slideThumbnailObjectUrlsRef.current = nextUrls;
      flushSync(() => {
        setSlideThumbnailUrls(Object.fromEntries(nextUrls));
      });
      for (const url of retiredUrls) {
        URL.revokeObjectURL(url);
      }
      return renderResult;
    });
  }

  function refreshChangedSlideThumbnails(nextDeck: Deck) {
    const previousDeck = lastThumbnailDeckRef.current;
    const slideIds = getDeckThumbnailRefreshSlideIds(previousDeck, nextDeck);
    const hasRemovedSlides = Boolean(
      previousDeck?.slides.some(
        (slide) =>
          !nextDeck.slides.some(
            (candidate) => candidate.slideId === slide.slideId,
          ),
      ),
    );
    lastThumbnailDeckRef.current = nextDeck;

    if (slideIds.length > 0 || hasRemovedSlides) {
      void syncSlideThumbnailCache(nextDeck, slideIds).catch(() => undefined);
    }
  }

  async function uploadRehearsalSlideSnapshots(activeProjectId: string, sourceDeck: Deck) {
    return enqueueSlideRender(async () => {
      const renderResult = await renderSlideFiles(sourceDeck, undefined, {
        requireAssets: true,
      });
      const snapshots: Array<{ fileId: string; slideId: string }> = [];

      for (const { file, slide } of requireCompleteRehearsalSlideRender(
        sourceDeck,
        renderResult.files,
      )) {
        const uploaded = await uploadProjectAsset(
          activeProjectId,
          createSlideScopedUploadFile(file, slide.order, "thumbnail"),
          "rehearsal-slide-snapshot",
        );
        snapshots.push({ fileId: uploaded.fileId, slideId: slide.slideId });
      }

      return snapshots;
    });
  }

  async function handleSaveDeck() {
    if (!canMutateDeck) return false;
    const activeProjectId = workingDeckRef.current.projectId || deckQuery.data?.projectId;

    if (!activeProjectId) {
      setSaveState("error");
      setSaveError("missing-project", "저장할 프로젝트를 찾지 못했습니다.");
      return false;
    }

    if (!commitSpeakerNotesDraftIfDirty()) {
      return;
    }

    setSaveState("manual-saving");
    setSaveError(null, null);
    setActiveTopMenu(null);

    try {
      await flushPendingSavesBeforeManualAction();

      const persistedDeck = persistedBaseDeckRef.current ?? deckQuery.data;
      if (!persistedDeck) {
        throw withSaveErrorCode(
          new Error("최신 저장 상태를 찾지 못했습니다. 다시 불러온 뒤 저장해 주세요."),
          "missing-persisted-base"
        );
      }

      setLastSavedAt(new Date().toISOString());

      if (
        !shouldApplyManualSaveResult({
          snapshotDeck: persistedDeck,
          currentDeck: workingDeckRef.current
        })
      ) {
        setLastPatchLabel("수동 저장 · 편집 변경 감지");
        setSaveState("auto-pending");
        return false;
      }

      setLastPatchLabel(`수동 저장 · v${persistedDeck.version}`);
      setSaveState("manual-saved");
      setSaveError(null, null);
      return true;
    } catch (error) {
      setLastPatchLabel(`저장 실패 · ${toEditorErrorMessage(error)}`);
      setSaveState("error");
      setSaveError("auto-save-failed", toEditorErrorMessage(error));
      void deckQuery.refetch();
      return false;
    }
  }

  async function handleExportPptx() {
    if (!capabilities.canExportDeck || isPptxExporting) return;

    const activeProjectId = workingDeckRef.current.projectId || deckQuery.data?.projectId;
    if (!activeProjectId) {
      setPptxExportError("내보낼 프로젝트를 찾지 못했습니다.");
      return;
    }

    setIsPptxExporting(true);
    setPptxExportError("");
    setPptxExportStatus("저장 중...");

    try {
      const saved = await handleSaveDeck();
      if (!saved) {
        throw new Error("최신 편집 내용을 저장한 뒤 다시 시도하세요.");
      }

      setPptxExportStatus("PPTX 내보내기 중...");
      const result = await exportDeckToPptx(activeProjectId);
      setPptxExportStatus(
        result.warnings.length
          ? `PPTX 생성 완료, ${result.warnings.length}개 경고`
          : "PPTX 생성 완료"
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPptxExportStatus("");
      setPptxExportError(
        error instanceof Error ? error.message : "PPTX 내보내기에 실패했습니다."
      );
    } finally {
      setIsPptxExporting(false);
    }
  }

  async function saveBeforePresentationJourneyNavigation(
    destination: PresentationJourneyDestination
  ): Promise<PresentationJourneySaveOutcome> {
    const activeProjectId = deckQuery.data?.projectId ?? projectId;

    if (isDeckLoading || !deckQuery.data) {
      setSaveState("auto-pending");
      return {
        status: "blocked",
        reason: "save-error",
        recoveryMessage: "발표 자료를 불러온 뒤 다시 시도해 주세요."
      };
    }

    if (!activeProjectId) {
      setSaveState("error");
      setSaveError("missing-project", "저장할 프로젝트를 찾지 못했습니다.");
      return {
        status: "blocked",
        reason: "save-error",
        recoveryMessage: "저장할 프로젝트를 찾지 못했습니다. 새로고침해 주세요."
      };
    }

    setActivePresentationAction(destination);
    presentationJourneyConflictRef.current = false;
    presentationJourneySnapshotRef.current = undefined;
    setPresentationJourneyStatus("");

    if (!canMutateDeck) {
      return { status: "saved" };
    }

    if (!canMutateDeck || !commitSpeakerNotesDraftIfDirty()) {
      return {
        status: "blocked",
        reason: "content-changed",
        recoveryMessage: "발표 메모 편집을 마친 뒤 다시 시도해 주세요."
      };
    }

    setSaveState("manual-saving");
    setSaveError(null, null);
    setActiveTopMenu(null);

    try {
      await flushPendingSavesBeforeManualAction();

      const persistedDeck = persistedBaseDeckRef.current ?? deckQuery.data;
      if (!persistedDeck) {
        throw withSaveErrorCode(
          new Error("최신 저장 상태를 찾지 못했습니다. 다시 불러온 뒤 저장해 주세요."),
          "missing-persisted-base"
        );
      }

      if (presentationJourneyConflictRef.current) {
        setSaveState("conflict-recovered");
        return {
          status: "blocked",
          reason: "version-conflict",
          recoveryMessage:
            "최신 버전과 저장 충돌을 복구했습니다. 내용을 확인한 뒤 다시 시도해 주세요."
        };
      }

      if (
        !shouldApplyManualSaveResult({
          snapshotDeck: persistedDeck,
          currentDeck: workingDeckRef.current
        })
      ) {
        setSaveState("auto-pending");
        return {
          status: "blocked",
          reason: "content-changed",
          recoveryMessage:
            "이동 준비 중 편집 내용이 변경되었습니다. 저장 후 다시 시도해 주세요."
        };
      }

      applyPersistedDeck(persistedDeck);
      setLastSavedAt(new Date().toISOString());
      setLastPatchLabel(`발표 준비 저장 완료 · v${persistedDeck.version}`);
      setSaveState("manual-saved");
      setSaveError(null, null);
      return { status: "saved" };
    } catch (error) {
      const saveErrorCode =
        (error as { saveErrorCode?: SaveErrorCode })?.saveErrorCode ??
        "rehearsal-save-failed";
      const message =
        saveErrorCode === "conflict-recovery-failed"
          ? "최신 버전과 저장 충돌을 해결하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요."
          : "편집 내용을 저장하지 못했습니다. 다시 시도해 주세요.";

      setLastPatchLabel(`발표 준비 저장 실패 · ${message}`);
      setSaveState("error");
      setSaveError(saveErrorCode, message);
      throw new Error(message);
    }
  }

  async function preparePresentationJourneyDestination(
    destination: PresentationJourneyDestination
  ) {
    if (destination !== "rehearsal") {
      return;
    }

    const activeProjectId = deckQuery.data?.projectId ?? projectId;
    const sourceDeck = canMutateDeck
      ? persistedBaseDeckRef.current ?? deckQuery.data
      : deckQuery.data;
    if (!activeProjectId || !sourceDeck) {
      throw new Error("리허설 자료를 준비하지 못했습니다. 다시 불러와 주세요.");
    }

    const snapshots = await uploadRehearsalSlideSnapshots(
      activeProjectId,
      sourceDeck
    );
    presentationJourneySnapshotRef.current = storePreparedRehearsalSlideSnapshots({
      deckId: sourceDeck.deckId,
      deckVersion: sourceDeck.version,
      projectId: activeProjectId,
      snapshots
    });
  }

  function navigateFromPresentationJourney(
    destination: PresentationJourneyDestination
  ) {
    const activeProjectId = deckQuery.data?.projectId ?? projectId;
    if (destination === "brief") {
      navigateToBrief(activeProjectId);
    } else if (destination === "rehearsal") {
      navigateToRehearsal(
        activeProjectId,
        presentationJourneySnapshotRef.current
      );
    } else {
      navigateToPresentation(activeProjectId);
    }
  }

  async function handlePresentationJourneyNavigation(
    destination: PresentationJourneyDestination
  ) {
    if (
      (destination === "presentation" &&
        !capabilities.canCreatePresentationSession) ||
      (destination === "rehearsal" &&
        !capabilities.canStartPersonalRehearsal) ||
      (destination === "brief" &&
        !capabilities.canEditBrief &&
        !capabilities.canStartPersonalRehearsal)
    ) {
      return;
    }

    const result = await presentationJourneyCoordinatorRef.current?.navigate(
      destination
    );
    if (!result || result.status === "ignored-duplicate") {
      return;
    }

    if (result.status === "blocked") {
      setPresentationJourneyStatus(result.recoveryMessage);
      if (result.reason === "preparation-error") {
        setSaveState("error");
        setSaveError("rehearsal-save-failed", result.recoveryMessage);
      }
    }
    setActivePresentationAction(null);
  }

  function handlePresentationJourneyAction(action: PresentationJourneyAction) {
    if (action.id === "open-validation" || action.id === "focus-validation") {
      setIsRightPanelOpen(true);
      if (canMutateDeck) {
        setRightPanelView("ai");
        setAiPanelView("tools");
      }
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('[data-testid="editor-validation-panel"]')
          ?.focus();
      });
      return;
    }

    const destination =
      action.id === "edit-brief" || action.id === "view-brief"
        ? "brief"
        : action.id === "start-rehearsal"
          ? "rehearsal"
          : "presentation";
    void handlePresentationJourneyNavigation(destination);
  }

  function handleOpenPresentationJourney() {
    setIsRightPanelOpen(true);
    if (canMutateDeck) {
      setRightPanelView("journey");
    }
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-testid="presentation-journey-panel"]')
        ?.focus();
    });
  }

  async function handleStartPresentation() {
    await handlePresentationJourneyNavigation("presentation");
  }

  async function handleStartRehearsal() {
    await handlePresentationJourneyNavigation("rehearsal");
  }

  async function flushPendingSavesBeforeManualAction() {
    await flushEditorPersistenceBeforeManualAction({
      flushPendingSaveBatch,
      flushScheduledUndoRedoPersist,
      hasPendingPatchInputs: () => pendingPatchInputsRef.current.length > 0,
      waitForSaveQueue: () => saveQueueRef.current.catch(() => undefined)
    });
  }

  async function flushPendingSaveBatch() {
    if (pendingPatchInputsRef.current.length === 0) {
      return;
    }

    setSaveState("auto-saving");
    isSaveFlushInFlightRef.current = true;

    const activeProjectId = deckQuery.data?.projectId ?? workingDeckRef.current.projectId;

    if (!activeProjectId) {
      throw withSaveErrorCode(
        new Error("저장할 프로젝트를 찾지 못했습니다."),
        "missing-project"
      );
    }

    const basePersistedDeck = persistedBaseDeckRef.current ?? deckQuery.data;

    if (!basePersistedDeck) {
      throw withSaveErrorCode(
        new Error("최신 저장 상태를 찾지 못했습니다. 다시 불러온 뒤 저장해 주세요."),
        "missing-persisted-base"
      );
    }

    const batchInputs = pendingPatchInputsRef.current.splice(0);
    let recoveredConflict = false;
    try {
      let buildResult = buildPatchBatch(basePersistedDeck, batchInputs);
      let persistedDeck: Deck;

      try {
        persistedDeck = await appendProjectDeckPatchAck(
          activeProjectId,
          basePersistedDeck,
          buildResult.patch
        );
      } catch (error) {
        if (!isDeckRequestErrorWithCode(error, "STALE_BASE_VERSION")) {
          throw error;
        }

        const latestDeck = await fetchProjectDeck(activeProjectId);

        if (!latestDeck) {
          throw new Error("최신 저장 상태를 다시 불러오지 못했습니다. 다시 시도해 주세요.");
        }

        recoveredConflict = true;
        presentationJourneyConflictRef.current = true;
        persistedBaseDeckRef.current = latestDeck;
        buildResult = buildPatchBatch(latestDeck, batchInputs);
        persistedDeck = await appendProjectDeckPatchAck(
          activeProjectId,
          latestDeck,
          buildResult.patch
        );
      }

      persistedBaseDeckRef.current = persistedDeck;
      setLastSavedAt(new Date().toISOString());

      queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
        mergeDeckIntoQueryCache(current, persistedDeck)
      );

      if (
        shouldApplyManualSaveResult({
          snapshotDeck: persistedDeck,
          currentDeck: workingDeckRef.current
        })
      ) {
        applyAckedPersistedDeck(persistedDeck);
        setSaveState(recoveredConflict ? "conflict-recovered" : "auto-saved");
        setSaveError(null, null);
      }
    } catch (error) {
      if (recoveredConflict && error instanceof Error) {
        withSaveErrorCode(error, "conflict-recovery-failed");
      }
      pendingPatchInputsRef.current = [...batchInputs, ...pendingPatchInputsRef.current];
      throw error;
    }
  }

  async function persistUndoRedoDeckSnapshot(label: string) {
    if (!canMutateDeck) return;
    const activeProjectId = deckQuery.data?.projectId ?? workingDeckRef.current.projectId;

    if (!activeProjectId) {
      throw withSaveErrorCode(
        new Error("??ν븷 ?꾨줈?앺듃瑜?李얠? 紐삵뻽?듬땲??"),
        "missing-project"
      );
    }

    setSaveState("auto-saving");
    const snapshotDeck = structuredClone(
      normalizeDeckAssetUrls(workingDeckRef.current)
    );
    const persistedDeck = await putProjectDeck(activeProjectId, snapshotDeck, {
      baseVersion: persistedBaseDeckRef.current?.version ?? snapshotDeck.version
    });

    if (
      pendingPatchInputsRef.current.length > 0 ||
      !shouldApplyManualSaveResult({
        snapshotDeck,
        currentDeck: workingDeckRef.current
      })
    ) {
      queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
        mergeDeckIntoQueryCache(current, persistedDeck)
      );
      persistedBaseDeckRef.current = persistedDeck;
      lastAckedDeckRef.current = persistedDeck;
      hasHydratedPersistedBaseRef.current = true;
      setLastSavedAt(new Date().toISOString());
      setSaveState("auto-pending");
      setSaveError(null, null);
      return;
    }

    applyPersistedDeck(persistedDeck);
    setLastSavedAt(new Date().toISOString());
    setSaveState("auto-saved");
    setSaveError(null, null);
    setLastPatchLabel(`${label} · v${persistedDeck.version}`);
  }

  function queueUndoRedoPersist(label: string) {
    isSaveFlushInFlightRef.current = true;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => persistUndoRedoDeckSnapshot(label))
      .finally(() => {
        isSaveFlushInFlightRef.current = false;
        undoRedoPersistTimerRef.current = null;
      });

    return saveQueueRef.current;
  }

  async function flushScheduledUndoRedoPersist() {
    const label = consumeScheduledUndoRedoPersistLabel({
      clearTimer: clearTimeout,
      labelRef: undoRedoPersistLabelRef,
      timerRef: undoRedoPersistTimerRef
    });

    if (!label) {
      return;
    }

    try {
      await queueUndoRedoPersist(label);
    } catch (error) {
      undoRedoPersistLabelRef.current = label;
      throw error;
    }
  }

  function scheduleUndoRedoPersist(label: string) {
    if (!canMutateDeck) return;
    consumeScheduledUndoRedoPersistLabel({
      clearTimer: clearTimeout,
      labelRef: undoRedoPersistLabelRef,
      timerRef: undoRedoPersistTimerRef
    });

    pendingPatchInputsRef.current = [];
    setSaveState("auto-pending");
    setSaveError(null, null);
    undoRedoPersistLabelRef.current = label;
    undoRedoPersistTimerRef.current = setTimeout(() => {
      undoRedoPersistTimerRef.current = null;
      undoRedoPersistLabelRef.current = null;
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => persistUndoRedoDeckSnapshot(label))
        .catch((error: unknown) => {
          setLastPatchLabel(`저장 실패 · ${toEditorErrorMessage(error)}`);
          setSaveState("error");
          setSaveError(
            (error as { saveErrorCode?: SaveErrorCode })?.saveErrorCode ?? "auto-save-failed",
            toEditorErrorMessage(error)
          );
          void deckQuery.refetch();
        })
        .finally(() => {
          isSaveFlushInFlightRef.current = false;
          undoRedoPersistTimerRef.current = null;
        });
    }, 2000);
  }

  function commitPatch(
    patchInput: DeckPatch | PatchProducer,
    baseDeck: Deck = workingDeckRef.current
  ) {
    if (!canMutateDeck) return false;
    const patch = resolvePatchInput(baseDeck, patchInput);
    const result = applyDeckPatch(baseDeck, patch);

    if (!result.ok) {
      setLastPatchLabel(`실패 · ${result.error.code}`);
      setSaveState("error");
      setSaveError("auto-save-failed", "편집 내용을 적용하지 못했습니다. 다시 시도해 주세요.");
      return false;
    }

    setIsDeleteUndoToastOpen((currentOpen) =>
      resolveDeleteUndoToastOpenAfterPatch({
        commitSucceeded: true,
        currentOpen,
      }),
    );
    applyOptimisticWorkingDeck(result.deck);
    setSaveState("auto-pending");
    setSaveError(null, null);
    setUndoStack((current) => [
      ...current.slice(-49),
      {
        deck: baseDeck,
        slideId: resolveSelectedSlideId(baseDeck.slides, resolvedCurrentSlideId),
      }
    ]);
    setRedoStack([]);
    setDeck(result.deck);
    setLastPatchLabel(
      `${result.changeRecord.operations[0]?.type ?? "patch"} · v${result.metadata.nextVersion}`
    );

    if (!deckQuery.data?.projectId) {
      return true;
    }

    queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
      mergeDeckIntoQueryCache(current, result.deck)
    );

    pendingPatchInputsRef.current.push(patchInput);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        while (pendingPatchInputsRef.current.length > 0) {
          await flushPendingSaveBatch();
        }
      })
      .catch((error: unknown) => {
        setLastPatchLabel(`저장 실패 · ${toEditorErrorMessage(error)}`);
        setSaveState("error");
        setSaveError(
          (error as { saveErrorCode?: SaveErrorCode })?.saveErrorCode ?? "auto-save-failed",
          toEditorErrorMessage(error)
        );
        void deckQuery.refetch();
      })
      .finally(() => {
        isSaveFlushInFlightRef.current = false;
        if (pendingPatchInputsRef.current.length > 0) {
          setSaveState("auto-pending");
        }
      });
    return true;
  }

  function handleSemanticCueReviewChange(semanticCues: SemanticCue[]) {
    if (!currentSlide) {
      return;
    }
    const slideId = currentSlide.slideId;
    commitPatch((currentDeck) =>
      createSemanticCueReviewPatch(currentDeck, slideId, semanticCues)
    );
  }

  async function handleSemanticCueExtraction(force: boolean) {
    if (!capabilities.canUseAiMutations || semanticCueExtractionState.status === "running") {
      return;
    }

    setSemanticCueExtractionState({
      status: "running",
      message: "슬라이드와 발표 대본의 의미를 분석하는 중입니다."
    });

    try {
      await flushEditorPersistenceBeforeManualAction({
        flushPendingSaveBatch,
        flushScheduledUndoRedoPersist,
        hasPendingPatchInputs: () => pendingPatchInputsRef.current.length > 0,
        waitForSaveQueue: () => saveQueueRef.current
      });

      const activeProjectId = deckQuery.data?.projectId ?? projectId;
      const queuedJob = await createSemanticCueExtractionJob(
        activeProjectId,
        force
      );
      const completedJob = await waitForSemanticCueExtractionJob(queuedJob.jobId);
      if (completedJob.status === "failed") {
        throw new Error(
          completedJob.error?.message ?? "Semantic Cue extraction failed."
        );
      }

      const selectedSlideId = currentSlide?.slideId;
      const refetchResult = await deckQuery.refetch();
      const extractedDeck = refetchResult.data;
      if (extractedDeck) {
        queryClient.setQueryData(["deck", projectId], extractedDeck);
        markHydratedPersistedDeck(extractedDeck, setDeck);
        if (
          selectedSlideId &&
          extractedDeck.slides.some((slide) => slide.slideId === selectedSlideId)
        ) {
          setCurrentSlideId(selectedSlideId);
        }
        setUndoStack([]);
        setRedoStack([]);
        setLastPatchLabel(`발표 메시지 AI 분석 · v${extractedDeck.version}`);
        setSaveState("auto-saved");
        setSaveError(null, null);
      }

      setSemanticCueExtractionState({
        status: "succeeded",
        message: "AI 분석이 완료되었습니다. 제안된 메시지를 검토해 주세요."
      });
    } catch (error) {
      setSemanticCueExtractionState({
        status: "error",
        message: toEditorErrorMessage(error)
      });
    }
  }

  function handleRightPanelTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const views = ["journey", "ai", "design"] as const;
    const currentIndex = views.indexOf(rightPanelView);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextView = views[(currentIndex + direction + views.length) % views.length];
    setRightPanelView(nextView);
    requestAnimationFrame(() => {
      document.getElementById(`editor-${nextView}-tab`)?.focus();
    });
  }

  function handleAiPanelTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const views = ["chat", "tools"] as const;
    const currentIndex = aiPanelView === "tools" ? 1 : 0;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextView = views[(currentIndex + direction + views.length) % views.length];
    setAiPanelView(nextView);
    requestAnimationFrame(() => {
      document.getElementById(`editor-ai-${nextView}-tab`)?.focus();
    });
  }

  function focusSelectionInspector() {
    requestAnimationFrame(() => selectionInspectorRef.current?.focus());
  }

  function focusCompactSelectionTrigger() {
    requestAnimationFrame(() => compactSelectionTriggerRef.current?.focus());
  }

  function handleOpenCompactSelectionInspector() {
    setRightPanelView("design");
    setIsRightPanelOpen(true);
    focusSelectionInspector();
  }

  function handleCloseRightPanel() {
    setIsRightPanelOpen(false);
    if (isCompactEditorLayout && selectionInspectorModel.selectedCount > 0) {
      focusCompactSelectionTrigger();
    }
  }

  function handleSelectionInspectorEscape() {
    if (isCompactEditorLayout) {
      handleCloseRightPanel();
      return;
    }

    requestAnimationFrame(() => document.getElementById("editor-design-tab")?.focus());
  }

  function handleElementSelection(elementId: string, options?: { append?: boolean }) {
    setElementContextMenu(null);
    setCustomShapeEditElementId((current) =>
      current === elementId && !options?.append ? current : null
    );

    const nextSelectedElementIds = options?.append
      ? selectedElementIds.includes(elementId)
        ? selectedElementIds.filter((currentElementId) => currentElementId !== elementId)
        : [...selectedElementIds, elementId]
      : [elementId];

    if (options?.append) {
      setEditingElementId(null);
    }

    setSelectedElementIds(nextSelectedElementIds);
    const canvasSelectionModel = createSelectionInspectorModel({
      compact: resolveSelectionInspectorCompactMode(editorViewportWidth),
      currentSlideElementIds: visibleElements.map((element) => element.elementId),
      origin: "canvas",
      selectedElementIds: nextSelectedElementIds
    });
    if (canvasSelectionModel.shouldAutoOpenDesignInspector) {
      setRightPanelView("design");
      setIsRightPanelOpen(true);
    }
  }

  function handleUndo() {
    if (!canMutateDeck || undoStack.length === 0 || !confirmDiscardSpeakerNotesDraft()) {
      return false;
    }

    const transition = resolveHistoryNavigation({
      currentDeck: workingDeckRef.current,
      currentSlideId: resolvedCurrentSlideId,
      stack: undoStack
    });

    if (!transition) {
      return false;
    }

    const previous = transition.targetEntry;
    const targetSlide = previous.deck.slides.find(
      (slide) => slide.slideId === transition.targetSlideId,
    );
    resetSpeakerNotesEditState(
      targetSlide?.speakerNotes ?? ""
    );
    replaceWorkingDeck(previous.deck);
    setUndoStack(transition.nextStack);
    setRedoStack((redoCurrent) => [...redoCurrent, transition.currentEntry]);
    setDeck(previous.deck);
    refreshChangedSlideThumbnails(previous.deck);
    setCurrentSlideId(transition.targetSlideId);
    setSelectedElementIds([]);
    clearSelectedKeyword();
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    queryClient.setQueryData(["deck", projectId], (currentDeck?: Deck) =>
      mergeDeckIntoQueryCache(currentDeck, previous.deck)
    );
    setLastPatchLabel(`undo · v${previous.deck.version}`);
    setIsDeleteUndoToastOpen(false);
    scheduleUndoRedoPersist("undo");
    return true;
  }

  function handleRedo() {
    if (!canMutateDeck || redoStack.length === 0 || !confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    const transition = resolveHistoryNavigation({
      currentDeck: workingDeckRef.current,
      currentSlideId: resolvedCurrentSlideId,
      stack: redoStack
    });

    if (!transition) {
      return;
    }

    const next = transition.targetEntry;
    const targetSlide = next.deck.slides.find(
      (slide) => slide.slideId === transition.targetSlideId,
    );
    resetSpeakerNotesEditState(
      targetSlide?.speakerNotes ?? ""
    );
    setRedoStack(transition.nextStack);
    setUndoStack((undoCurrent) => [
      ...undoCurrent.slice(-49),
      transition.currentEntry
    ]);
    replaceWorkingDeck(next.deck);
    setDeck(next.deck);
    refreshChangedSlideThumbnails(next.deck);
    setCurrentSlideId(transition.targetSlideId);
    setSelectedElementIds([]);
    clearSelectedKeyword();
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    queryClient.setQueryData(["deck", projectId], (currentDeck?: Deck) =>
      mergeDeckIntoQueryCache(currentDeck, next.deck)
    );
    setLastPatchLabel(`redo · v${next.deck.version}`);
    scheduleUndoRedoPersist("redo");
  }

  function handleElementPropsChange(
    slideId: string,
    elementId: string,
    props: Record<string, unknown>
  ) {
    commitPatch((currentDeck) =>
      createUpdateElementPropsPatch(currentDeck, slideId, elementId, props)
    );
  }

  function handleDistributeSelection(axis: "x" | "y") {
    if (!currentSlide) {
      return;
    }

    const currentDeck = workingDeckRef.current;
    const slide = currentDeck.slides.find(
      (candidate) => candidate.slideId === currentSlide.slideId
    );
    if (!slide) {
      return;
    }

    const selectedIdSet = new Set(selectionInspectorModel.selectedElementIds);
    const elements = slide.elements.filter((element) =>
      selectedIdSet.has(element.elementId)
    );
    const patch = createDistributeSelectionPatch(currentDeck, slide, elements, axis);
    if (patch) {
      commitPatch(() => patch);
    }
  }

  function handleValidationTargetFocus(target: EditorValidationTargetView) {
    if (target.status !== "resolved" || !target.slideId) {
      return;
    }

    const activeDeck = workingDeckRef.current;
    const nextSlide = activeDeck.slides.find(
      (candidate) => candidate.slideId === target.slideId
    );
    if (!nextSlide) {
      return;
    }

    if (target.slideId !== resolvedCurrentSlideId) {
      if (!confirmDiscardSpeakerNotesDraft()) {
        setValidationHighlightElementIds([]);
        return;
      }
      resetSpeakerNotesEditState(nextSlide.speakerNotes);
      setIsSpeakerNotesAssistantOpen(false);
      setCurrentSlideId(target.slideId);
    }

    setSelectedElementIds(target.elementIds);
    setValidationHighlightElementIds(target.elementIds);
    clearSelectedKeyword();
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    setRightPanelView("ai");
    setAiPanelView("tools");
    setIsRightPanelOpen(true);
  }

  function handleSafeTextOverflowRepair(onlyElementIds?: readonly string[]) {
    if (!capabilities.canUseAiMutations) {
      return;
    }

    const activeDeck = workingDeckRef.current;
    const result = createSafeTextOverflowRepair({
      deck: activeDeck,
      items: getEditorValidationItems(activeDeck),
      onlyElementIds
    });
    if (!result.patch || result.repairedElementIds.length === 0) {
      setValidationRepairStatus("안전 수정 가능한 텍스트 넘침이 없습니다.");
      return;
    }

    const repairedCount = result.repairedElementIds.length;
    setSelectedElementIds(result.repairedElementIds);
    setValidationHighlightElementIds(result.repairedElementIds);
    commitPatch(() => result.patch!);
    setValidationRepairStatus(
      `텍스트 넘침 ${repairedCount}개를 안전 수정했습니다. 실행 취소로 되돌릴 수 있습니다.`
    );
  }

  function handleSlideStyleChange(
    slideId: string,
    style: {
      backgroundColor?: string | null;
      textColor?: string | null;
      accentColor?: string | null;
    }
  ) {
    commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [
        {
          type: "update_slide_style",
          slideId,
          style
        }
      ]
    }));
  }

  function handleThemeChange(theme: Record<string, unknown>) {
    commitPatch((currentDeck) => createThemeCascadePatch(currentDeck, theme));
  }

  function handleReplaceKeywords(slideId: string, update: (keywords: Keyword[]) => Keyword[]) {
    commitPatch((currentDeck) => {
      const slide = currentDeck.slides.find((candidate) => candidate.slideId === slideId);

      if (!slide) {
        throw new Error(`slide not found: ${slideId}`);
      }

      return createReplaceKeywordsPatch(currentDeck, slideId, update(slide.keywords));
    });
  }

  function clearSelectedKeyword() {
    setSelectedKeywordId(null);
    setSelectedKeywordOccurrenceKey(null);
  }

  function handleSelectKeyword(keywordId: string, occurrenceKey: string | null = null) {
    const shouldClear =
      selectedKeywordId === keywordId && selectedKeywordOccurrenceKey === occurrenceKey;

    setSelectedKeywordId(shouldClear ? null : keywordId);
    setSelectedKeywordOccurrenceKey(shouldClear ? null : occurrenceKey);
  }

  function resetSpeakerNotesEditState(notes: string) {
    setIsSpeakerNotesEditing(false);
    setSpeakerNotesDraft(notes);
    setSpeakerNotesDraftBase(notes);
    setSpeakerNotesEditSlideId(null);
  }

  function confirmDiscardSpeakerNotesDraft() {
    if (
      !shouldPromptSpeakerNotesDraftDiscard({
        draft: speakerNotesDraft,
        isEditing: isSpeakerNotesEditing,
        savedDraftBase: speakerNotesDraftBase
      })
    ) {
      return true;
    }

    return (
      typeof window === "undefined" ||
      window.confirm(
        "저장하지 않은 발표 메모 수정 내용이 있습니다. 이동하면 초안이 사라집니다. 계속할까요?"
      )
    );
  }

  function handleSelectSlide(slideId: string) {
    if (slideId === resolvedCurrentSlideId) {
      return;
    }

    if (!confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    const nextSlide = deck.slides.find((slide) => slide.slideId === slideId);
    if (!nextSlide) return;

    resetSpeakerNotesEditState(nextSlide.speakerNotes);
    setIsSpeakerNotesAssistantOpen(false);
    setCurrentSlideId(slideId);
  }

  function handleStartSpeakerNotesEdit() {
    if (!canMutateDeck) return;
    const currentNotes = currentSlide?.speakerNotes ?? "";
    clearSelectedKeyword();
    setIsSpeakerNotesPanelExpanded(true);
    setSpeakerNotesDraft(currentNotes);
    setSpeakerNotesDraftBase(currentNotes);
    setSpeakerNotesEditSlideId(currentSlide?.slideId ?? null);
    setIsSpeakerNotesEditing(true);
  }

  function handleOpenSpeakerNotesAssistant() {
    if (!capabilities.canUseAiMutations || !currentSlide) return;
    const isSameSource =
      speakerNotesAssistantSource?.slideId === currentSlide.slideId &&
      speakerNotesAssistantSource.baseVersion === deck.version &&
      speakerNotesAssistantSource.notes === currentSlide.speakerNotes;
    if (!isSameSource) {
      setSpeakerNotesAssistantSource({
        slideId: currentSlide.slideId,
        baseVersion: deck.version,
        notes: currentSlide.speakerNotes,
      });
      setSpeakerNotesAssistantMode(
        currentSlide.speakerNotes.trim() ? "naturalize" : "draft",
      );
      setSpeakerNotesAssistantStatus("idle");
      setSpeakerNotesAssistantResult(null);
      setSpeakerNotesAssistantError("");
    }
    setIsSpeakerNotesAssistantOpen(true);
  }

  async function handleGenerateSpeakerNotesSuggestion() {
    if (!capabilities.canUseAiMutations) return;
    const requestedSlideId = speakerNotesAssistantSource?.slideId;
    if (!requestedSlideId || speakerNotesAssistantStatus === "running") return;

    setSpeakerNotesAssistantStatus("running");
    setSpeakerNotesAssistantResult(null);
    setSpeakerNotesAssistantError("");
    try {
      await flushEditorPersistenceBeforeManualAction({
        flushPendingSaveBatch,
        flushScheduledUndoRedoPersist,
        hasPendingPatchInputs: () => pendingPatchInputsRef.current.length > 0,
        waitForSaveQueue: () => saveQueueRef.current,
      });

      const requestDeck = workingDeckRef.current;
      const requestSlide = requestDeck.slides.find(
        (slide) => slide.slideId === requestedSlideId,
      );
      if (!requestSlide) {
        throw new Error("현재 슬라이드를 찾을 수 없습니다.");
      }
      const requestMode = requestSlide.speakerNotes.trim()
        ? speakerNotesAssistantMode === "draft"
          ? "naturalize"
          : speakerNotesAssistantMode
        : "draft";
      const source = {
        slideId: requestSlide.slideId,
        baseVersion: requestDeck.version,
        notes: requestSlide.speakerNotes,
      };
      setSpeakerNotesAssistantSource(source);
      setSpeakerNotesAssistantMode(requestMode);

      const activeProjectId = deckQuery.data?.projectId ?? projectId;
      const job = await createSpeakerNotesSuggestionJob(activeProjectId, {
        deckId: requestDeck.deckId,
        slideId: requestSlide.slideId,
        baseVersion: requestDeck.version,
        mode: requestMode,
      });
      const result = await waitForSpeakerNotesSuggestionJob(job.jobId);
      if (
        result.slideId !== source.slideId ||
        result.baseVersion !== source.baseVersion
      ) {
        throw new Error("슬라이드가 변경되어 이 AI 제안을 사용할 수 없습니다.");
      }
      setSpeakerNotesAssistantResult(result);
      setSpeakerNotesAssistantStatus("succeeded");
    } catch (error) {
      setSpeakerNotesAssistantStatus("failed");
      setSpeakerNotesAssistantError(toEditorErrorMessage(error));
    }
  }

  function handleApplySpeakerNotesSuggestion() {
    if (!capabilities.canUseAiMutations) return;
    const result = speakerNotesAssistantResult;
    const source = speakerNotesAssistantSource;
    if (!result || !source) return;
    const currentDeck = workingDeckRef.current;
    const targetSlide = currentDeck.slides.find(
      (slide) => slide.slideId === source.slideId,
    );
    if (
      !targetSlide ||
      currentDeck.version !== result.baseVersion ||
      targetSlide.speakerNotes !== source.notes
    ) {
      setSpeakerNotesAssistantStatus("failed");
      setSpeakerNotesAssistantResult(null);
      if (targetSlide) {
        setSpeakerNotesAssistantSource({
          slideId: targetSlide.slideId,
          baseVersion: currentDeck.version,
          notes: targetSlide.speakerNotes,
        });
        setSpeakerNotesAssistantMode(
          targetSlide.speakerNotes.trim() ? "naturalize" : "draft",
        );
      }
      setSpeakerNotesAssistantError(
        "메모가 변경되어 이 제안을 적용할 수 없습니다. 새 제안을 만들어 주세요.",
      );
      return;
    }

    clearSelectedKeyword();
    setSpeakerNotesDraft(result.suggestedNotes);
    setSpeakerNotesDraftBase(source.notes);
    setSpeakerNotesEditSlideId(source.slideId);
    setIsSpeakerNotesEditing(true);
    setIsSpeakerNotesAssistantOpen(false);
  }

  function handleCancelSpeakerNotesEdit() {
    resetSpeakerNotesEditState(currentSlide?.speakerNotes ?? "");
  }

  function commitSpeakerNotesDraftIfDirty() {
    if (
      !shouldPromptSpeakerNotesDraftDiscard({
        draft: speakerNotesDraft,
        isEditing: isSpeakerNotesEditing,
        savedDraftBase: speakerNotesDraftBase
      })
    ) {
      return true;
    }

    const slideId = speakerNotesEditSlideId;
    const targetSlide = workingDeckRef.current.slides.find(
      (slide) => slide.slideId === slideId
    );

    if (!slideId || !targetSlide) {
      resetSpeakerNotesEditState(currentSlide?.speakerNotes ?? "");
      return false;
    }

    if (
      shouldPromptSpeakerNotesOverwrite({
        currentNotes: targetSlide.speakerNotes,
        draft: speakerNotesDraft,
        savedDraftBase: speakerNotesDraftBase
      }) &&
      typeof window !== "undefined" &&
      !window.confirm(
        "편집 중 발표 메모가 다른 작업으로 변경되었습니다. 현재 초안으로 덮어쓸까요?"
      )
    ) {
      return false;
    }

    const nextSpeakerNotes = speakerNotesDraft;

    if (nextSpeakerNotes !== targetSlide.speakerNotes) {
      const danglingOccurrenceBlock =
        getSpeakerNotesDanglingOccurrenceSaveBlock(
          targetSlide,
          nextSpeakerNotes
        );

      if (danglingOccurrenceBlock) {
        if (typeof window !== "undefined") {
          window.alert(danglingOccurrenceBlock.message);
        }
        return false;
      }

      commitPatch((currentDeck) => ({
        deckId: currentDeck.deckId,
        baseVersion: currentDeck.version,
        source: "user",
        operations: [
          {
            type: "update_speaker_notes",
            slideId,
            speakerNotes: nextSpeakerNotes
          }
        ]
      }));
    }

    resetSpeakerNotesEditState(nextSpeakerNotes);
    return true;
  }

  function handleSaveSpeakerNotesEdit() {
    if (!currentSlide) {
      resetSpeakerNotesEditState("");
      return;
    }

    const hasDirtyDraft = shouldPromptSpeakerNotesDraftDiscard({
      draft: speakerNotesDraft,
      isEditing: isSpeakerNotesEditing,
      savedDraftBase: speakerNotesDraftBase
    });

    if (!commitSpeakerNotesDraftIfDirty()) {
      return;
    }

    if (!hasDirtyDraft) {
      resetSpeakerNotesEditState(currentSlide.speakerNotes);
    }
  }

  function handleDeleteSelectedKeyword(slideId: string, keywordId: string) {
    const usage = currentSlideKeywordUsage[keywordId];
    const hasLinkedActions =
      Boolean(usage?.advancesSlide) || (usage?.animationIds.length ?? 0) > 0;

    if (
      hasLinkedActions &&
      typeof window !== "undefined" &&
      !window.confirm(
        "연결된 애니메이션 또는 다음 슬라이드 트리거가 함께 제거될 수 있습니다. 삭제할까요?"
      )
    ) {
      return;
    }

    handleReplaceKeywords(slideId, (keywords) =>
      keywords.filter((keyword) => keyword.keywordId !== keywordId)
    );
    clearSelectedKeyword();
  }

  function handleSpeakerNotesKeywordSelection(rawValue: string, start: number) {
    if (!canMutateDeck || !currentSlide) {
      return;
    }

    const matchedKeyword = findKeywordByTerm(currentSlide, rawValue);
    if (matchedKeyword) {
      handleSelectKeyword(
        matchedKeyword.keywordId,
        createKeywordOccurrenceId(
          currentSlide.slideId,
          matchedKeyword.keywordId,
          start,
          start + rawValue.length
        )
      );
      return;
    }

    const nextKeyword = createKeyword(workingDeckRef.current, rawValue, {
      required: false
    });
    setSelectedKeywordId(nextKeyword.keywordId);
    setSelectedKeywordOccurrenceKey(
      createKeywordOccurrenceId(
        currentSlide.slideId,
        nextKeyword.keywordId,
        start,
        start + rawValue.length
      )
    );
    handleReplaceKeywords(currentSlide.slideId, (keywords) => [...keywords, nextKeyword]);
  }

  function handleToggleKeywordRequired(
    slideId: string,
    keywordId: string,
    occurrenceKey: string | null = null
  ) {
    const keyword = currentSlide?.keywords.find(
      (candidate) => candidate.keywordId === keywordId
    );

    if (!occurrenceKey && !keyword?.required) {
      if (typeof window !== "undefined") {
        window.alert(
          "반복되는 단어일 수 있습니다. 발표 메모에서 필수 발화로 표시할 단어 위치를 선택하세요."
        );
      }
      return;
    }

    handleReplaceKeywords(slideId, (keywords) =>
      keywords.map((keyword) => {
        if (keyword.keywordId !== keywordId) {
          return keyword;
        }

        if (!occurrenceKey) {
          return {
            ...keyword,
            required: false,
            requiredOccurrenceIds: []
          };
        }

        const requiredOccurrenceIds = keyword.requiredOccurrenceIds ?? [];
        const nextRequiredOccurrenceIds = requiredOccurrenceIds.includes(
          occurrenceKey
        )
          ? requiredOccurrenceIds.filter((candidate) => candidate !== occurrenceKey)
          : [...requiredOccurrenceIds, occurrenceKey];

        return {
          ...keyword,
          required: nextRequiredOccurrenceIds.length > 0,
          requiredOccurrenceIds: nextRequiredOccurrenceIds
        };
      })
    );
  }

  function handleToggleAdvanceSlideKeyword(
    slideId: string,
    keywordId: string,
    enabled: boolean
  ) {
    if (enabled && !selectedKeywordOccurrenceKey) {
      if (typeof window !== "undefined") {
        window.alert(
          "반복되는 단어일 수 있습니다. 발표 메모에서 실제로 트리거할 단어 위치를 선택하세요."
        );
      }
      return;
    }

    const patch = createUpsertAdvanceSlideKeywordActionPatch(
      workingDeckRef.current,
      slideId,
      keywordId,
      enabled,
      selectedKeywordOccurrenceKey
    );

    if (!patch) {
      return;
    }

    commitPatch(patch);
  }

  function handleAddAnimation(
    slideId: string,
    elementId: string,
    keywordId?: string | null,
    keywordOccurrenceId?: string | null,
    draft?: Partial<Pick<DeckAnimation, "delayMs" | "durationMs" | "type">>
  ) {
    let createdAnimationId: string | null = null;

    commitPatch((currentDeck) => {
      const slide = currentDeck.slides.find((candidate) => candidate.slideId === slideId);

      if (!slide) {
        throw new Error(`slide not found: ${slideId}`);
      }

      const animation = {
        ...createDefaultAnimation(currentDeck, slide, elementId),
        ...draft
      };
      createdAnimationId = animation.animationId;

      if (!keywordId) {
        return createAddAnimationPatch(currentDeck, slideId, animation);
      }

      return createAddAnimationWithKeywordTriggerPatch(
        currentDeck,
        slideId,
        animation,
        keywordId,
        keywordOccurrenceId
      );
    });

    if (createdAnimationId) {
      setAnimationPanelFocusedAnimationId(createdAnimationId);
    }
  }

  function handleUpdateAnimation(
    slideId: string,
    animationId: string,
    animation: Partial<DeckAnimation>
  ) {
    commitPatch((currentDeck) =>
      createUpdateAnimationPatch(currentDeck, slideId, animationId, animation)
    );
  }

  function handleDeleteAnimation(slideId: string, animationId: string) {
    commitPatch((currentDeck) =>
      createDeleteAnimationPatch(currentDeck, slideId, animationId)
    );
  }

  function openAnimationInspector() {
    setIsAnimationPanelOpen(true);
  }

  function handleSelectSlideAnimationFromPanel(animation: DeckAnimation) {
    setAnimationPanelFocusedAnimationId(animation.animationId);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    setSelectedElementIds([animation.elementId]);
  }

  function openImageFilePicker(target: ImageUploadTarget) {
    if (!canMutateDeck || isImageUploadPending) {
      return;
    }

    setElementContextMenu(null);
    imageUploadTargetRef.current = target;
    imageFileInputRef.current?.click();
  }

  function openPptxFilePicker() {
    if (!canMutateDeck || pptxImportState.status === "uploading" || pptxImportState.status === "importing") {
      return;
    }

    setActiveTopMenu(null);
    pptxFileInputRef.current?.click();
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
      return;
    }

    setIsImageUploadPending(true);

    try {
      const activeDeck = workingDeckRef.current;
      const targetSlideIndex = activeDeck.slides.findIndex(
        (slide) => slide.slideId === target.slideId
      );

      if (targetSlideIndex < 0) {
        throw new Error("이미지를 넣을 슬라이드를 찾지 못했습니다.");
      }

      const targetSlide = activeDeck.slides[targetSlideIndex];
      const uploadProjectId = await resolveUploadProject(workingDeckRef.current.projectId);
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
          (currentDeck) =>
            createUpdateElementPropsPatch(currentDeck, target.slideId, target.elementId, {
              alt: file.name,
              src: normalizedUploadedUrl
            }),
          activeDeck
        );
        handleSelectSlide(target.slideId);
        setSelectedElementIds([target.elementId]);
      } else {
        const elementId = createElementId(activeDeck);
        const naturalSize = await readImageNaturalSize(file).catch(() => ({
          height: defaultImageInsertFrame.height,
          width: defaultImageInsertFrame.width
        }));
        const frame = getDefaultImageInsertFrame(activeDeck.canvas, naturalSize);

        commitPatch(
          (currentDeck) =>
            createAddElementPatch(currentDeck, target.slideId, {
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
              focusX: 0.5,
              focusY: 0.5,
              src: normalizedUploadedUrl
            }
            }),
          activeDeck
        );
        handleSelectSlide(target.slideId);
        setSelectedElementIds([elementId]);
        setEditingElementId(null);
        setInsertTool("select");
      }

    } catch (error) {
      console.error(error);
    } finally {
      setIsImageUploadPending(false);
    }
  }

  async function handlePptxFileSelection(file: File) {
    const validationMessage = getPptxImportValidationMessage(file);

    if (validationMessage) {
      setPptxImportState({
        status: "error",
        warnings: [],
        qualityReport: null,
        message: validationMessage
      });
      return;
    }

    setPptxImportState({
      status: "uploading",
      warnings: [],
      qualityReport: null,
      message: "PPTX 업로드 중..."
    });

    try {
      pendingPatchInputsRef.current = [];
      await saveQueueRef.current.catch(() => undefined);

      const activeProjectId = await resolveUploadProject(
        workingDeckRef.current.projectId || projectId
      );
      const { importResult, importedDeck } = await importPptxIntoEditor(
        activeProjectId,
        file,
        {
          onPhase: (phase) =>
            setPptxImportState({
              status: phase,
              warnings: [],
              qualityReport: null,
              message:
                phase === "uploading" ? "PPTX 업로드 중..." : "PPTX 변환 중..."
            }),
          refetchDeck: async () => (await deckQuery.refetch()).data
        }
      );

      queryClient.setQueryData(["deck", projectId], importedDeck);
      markHydratedPersistedDeck(importedDeck, setDeck);
      setCurrentSlideId(importedDeck.slides[0]?.slideId ?? null);
      resetSpeakerNotesEditState(importedDeck.slides[0]?.speakerNotes ?? "");
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElementIds([]);
      clearSelectedKeyword();
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setElementContextMenu(null);
      setLastPatchLabel(`PPTX 가져오기 · v${importedDeck.version}`);
      setSaveState("manual-saved");
      setSaveError(null, null);

      setPptxImportState({
        status: "succeeded",
        warnings: importResult.warnings,
        qualityReport: importResult.qualityReport,
        message: "PPTX 가져오기 완료"
      });
    } catch (error) {
      setPptxImportState({
        status: "error",
        warnings: [],
        qualityReport: null,
        message: toEditorErrorMessage(error)
      });
    }
  }

  function handleImageFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canMutateDeck) {
      event.target.value = "";
      return;
    }
    const [file] = Array.from(event.target.files ?? []);
    const target = imageUploadTargetRef.current;

    event.target.value = "";
    imageUploadTargetRef.current = null;

    if (!file || !target) {
      return;
    }

    void handleImageFileSelection(file, target);
  }

  function handlePptxFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canMutateDeck) {
      event.target.value = "";
      return;
    }
    const [file] = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (!file) {
      return;
    }

    void handlePptxFileSelection(file);
  }

  function handleAddTextElement() {
    if (!canMutateDeck || !currentSlide) {
      return;
    }

    const elementId = createElementId(deck);
    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, {
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
    if (!canMutateDeck || !currentSlide) {
      return;
    }

    const elementId = createElementId(deck);
    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, {
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
    if (!canMutateDeck || !currentSlide) {
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

    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, nextElement)
    );
    setSelectedElementIds([elementId]);
    setInsertTool("select");
    setIsShapeMenuOpen(false);
  }

  function handleAddSlide() {
    if (!canMutateDeck || !confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    let nextSlideId: string | null = null;
    resetSpeakerNotesEditState("");
    const committed = commitPatch((currentDeck) => {
      const slideId = createSlideId(currentDeck);
      const nextOrder = currentDeck.slides.length + 1;
      nextSlideId = slideId;
      return createAddSlidePatch(currentDeck, {
        slideId,
        order: nextOrder,
        title: `Slide ${nextOrder}`,
        thumbnailUrl: "",
        style: {
          layout: "title-content",
          backgroundColor: currentDeck.theme.backgroundColor,
          textColor: currentDeck.theme.textColor,
          accentColor: currentDeck.theme.accentColor
        },
        speakerNotes: "",
        keywords: [],
        semanticCues: [],
        elements: [
          {
            elementId: createElementId(currentDeck),
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
              fontFamily: currentDeck.theme.typography.headingFontFamily,
              fontSize: currentDeck.theme.typography.titleSize,
              fontWeight: "bold",
              color: currentDeck.theme.textColor,
              align: "left",
              verticalAlign: "top",
              lineHeight: 1.1
            }
          }
        ],
        animations: [],
        actions: []
      });
    });
    if (!committed) return;
    setCurrentSlideId(nextSlideId);
    setSelectedElementIds([]);
  }

  function handleDuplicateSlide(slideId: string) {
    if (!canMutateDeck || !commitSpeakerNotesDraftIfDirty()) return;

    let duplicateSlideId: string | null = null;
    const committed = commitPatch((currentDeck) => {
      const patch = createDuplicateSlidePatch(currentDeck, slideId);
      duplicateSlideId = getAddedSlideId(patch);
      return patch;
    });
    if (!committed || !duplicateSlideId) return;

    const duplicateSlide = workingDeckRef.current.slides.find(
      (slide) => slide.slideId === duplicateSlideId,
    );
    setCurrentSlideId(duplicateSlideId);
    resetSpeakerNotesEditState(duplicateSlide?.speakerNotes ?? "");
    setSelectedElementIds([]);
  }

  function handleDeleteSlide(slideId: string) {
    const activeDeck = workingDeckRef.current;
    if (!canMutateDeck || activeDeck.slides.length <= 1) return;

    const nextSelectedSlideId = resolveSelectedSlideIdAfterDelete({
      deletedSlideId: slideId,
      selectedSlideId: resolvedCurrentSlideId,
      slides: activeDeck.slides,
    });
    const speakerNotesDraftDisposition =
      resolveSpeakerNotesDraftDispositionForSlideDelete({
        deletedSlideId: slideId,
        selectedSlideId: resolvedCurrentSlideId,
      });

    const committed = commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [{ type: "delete_slide", slideId }],
    }));
    if (!committed) return;

    if (speakerNotesDraftDisposition === "discard-after-delete") {
      const nextSlide = workingDeckRef.current.slides.find(
        (slide) => slide.slideId === nextSelectedSlideId,
      );
      setCurrentSlideId(nextSelectedSlideId);
      resetSpeakerNotesEditState(nextSlide?.speakerNotes ?? "");
    }
    setSelectedElementIds([]);
    setIsDeleteUndoToastOpen(true);
  }

  function handleReorderSlides(orderedSlideIds: readonly string[]) {
    if (!canMutateDeck) return;
    commitPatch((currentDeck) =>
      createSlideRailReorderPatch(currentDeck, orderedSlideIds),
    );
  }

  function handleMoveSlide(slideId: string, direction: "down" | "up") {
    if (!canMutateDeck) return;
    const slideIds = workingDeckRef.current.slides.map((slide) => slide.slideId);
    const sourceIndex = slideIds.indexOf(slideId);
    const targetIndex = sourceIndex + (direction === "up" ? -1 : 1);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= slideIds.length) return;

    const reordered = [...slideIds];
    const [movedSlideId] = reordered.splice(sourceIndex, 1);
    if (!movedSlideId) return;
    reordered.splice(targetIndex, 0, movedSlideId);
    handleReorderSlides(reordered);
  }

  function handleDeleteSelectedElement() {
    if (!currentSlide || selectedElementIds.length === 0) {
      return;
    }

    setElementContextMenu(null);
    commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: selectedElementIds.map((elementId) => ({
        type: "delete_element" as const,
        slideId: currentSlide.slideId,
        elementId
      }))
    }));
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

    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, {
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
    if (!canMutateDeck || !currentSlide) {
      return;
    }

    const elementId = createElementId(deck);

    if (draft.type === "text") {
      commitPatch((currentDeck) =>
        createAddElementPatch(currentDeck, currentSlide.slideId, {
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
      commitPatch((currentDeck) =>
        createAddElementPatch(currentDeck, currentSlide.slideId, {
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
    if (!canMutateDeck || !currentSlide || nodes.length < 2) {
      setInsertTool("select");
      return;
    }

    const elementId = createElementId(deck);
    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);

    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, {
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
    if (!canMutateDeck) return;
    const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === elementId
    );

    if (!slide || !element || element.type !== "customShape" || nodes.length < 2) {
      return;
    }

    const geometry = normalizeCustomShapeAbsoluteGeometry(nodes, closed);

    commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [
        {
          type: "update_element_frame",
          slideId,
          elementId,
            frame: normalizeElementFrameDraft(currentDeck.canvas, element, geometry.frame)
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
    }));
  }

  function handleElementFrameChange(
    slideId: string,
    elementId: string,
    frame: ElementFrameChange
  ) {
    if (!canMutateDeck) return;
    const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
    const element = slide?.elements.find(
      (candidate) => candidate.elementId === elementId
    );

    if (!slide || !element) {
      return;
    }

    try {
      commitPatch((currentDeck) =>
        element.type === "group"
          ? createGroupedElementFramePatch(currentDeck, slideId, elementId, frame)
          : createElementFramePatch(currentDeck, slideId, elementId, frame)
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

    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, {
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

    commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [
        {
          type: "delete_element",
          slideId,
          elementId
        }
      ]
    }));
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
    beginHorizontalPaneResize({
      direction: "expand-right",
      event,
      maxWidth: maxSlidesPaneWidth,
      minWidth: minSlidesPaneWidth,
      onResizeStart: () => setIsSlidesPaneCollapsed(false),
      onWidthChange: setSlidesPaneWidth,
      startWidth: isSlidesPaneCollapsed ? minSlidesPaneWidth : slidesPaneWidth
    });
  }

  function handleRightPaneResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    beginHorizontalPaneResize({
      direction: "expand-left",
      event,
      maxWidth: maxRightPaneWidth,
      minWidth: minRightPaneWidth,
      onWidthChange: setRightPaneWidth,
      startWidth: rightPaneWidth
    });
  }

  function getSpeakerNotesPanelMaxHeight() {
    return typeof window === "undefined"
      ? 480
      : Math.max(
          minSpeakerNotesPanelHeight,
          Math.min(480, Math.round(window.innerHeight * 0.52))
        );
  }

  function commitSpeakerNotesPanelHeight(height: number) {
    const nextHeight = Math.round(
      Math.min(
        getSpeakerNotesPanelMaxHeight(),
        Math.max(minSpeakerNotesPanelHeight, height)
      )
    );
    speakerNotesPanelHeightRef.current = nextHeight;
    setSpeakerNotesPanelHeight(nextHeight);
  }

  function collapseSpeakerNotesPanel() {
    if (isSpeakerNotesEditing) return;
    setIsSpeakerNotesPanelExpanded(false);
  }

  function handleToggleSpeakerNotesPanel() {
    if (isSpeakerNotesPanelExpanded) {
      collapseSpeakerNotesPanel();
      return;
    }

    if (!hasExpandedSpeakerNotesPanelRef.current) {
      hasExpandedSpeakerNotesPanelRef.current = true;
      shouldMeasureInitialSpeakerNotesHeightRef.current = true;
      commitSpeakerNotesPanelHeight(initialSpeakerNotesPanelHeight);
    }

    setIsSpeakerNotesPanelExpanded(true);
  }

  function handleSpeakerNotesResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (isSpeakerNotesEditing) return;

    event.preventDefault();
    const startY = event.clientY;
    const startHeight = speakerNotesPanelHeightRef.current;
    let latestRawHeight = startHeight;
    setIsSpeakerNotesPanelResizing(true);
    document.body.classList.add("is-resizing-speaker-notes");

    function handlePointerMove(pointerEvent: PointerEvent) {
      latestRawHeight = startHeight + startY - pointerEvent.clientY;
      const previewHeight = Math.round(
        Math.min(
          getSpeakerNotesPanelMaxHeight(),
          Math.max(54, latestRawHeight)
        )
      );
      speakerNotesPanelHeightRef.current = previewHeight;
      setSpeakerNotesPanelHeight(previewHeight);
    }

    function finishResize() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      document.body.classList.remove("is-resizing-speaker-notes");
      setIsSpeakerNotesPanelResizing(false);

      if (latestRawHeight <= speakerNotesPanelHideThreshold) {
        speakerNotesPanelHeightRef.current = Math.max(
          minSpeakerNotesPanelHeight,
          startHeight
        );
        setSpeakerNotesPanelHeight(speakerNotesPanelHeightRef.current);
        collapseSpeakerNotesPanel();
        return;
      }

      commitSpeakerNotesPanelHeight(latestRawHeight);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  }

  function handleSpeakerNotesResizeKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    if (isSpeakerNotesEditing) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      commitSpeakerNotesPanelHeight(
        speakerNotesPanelHeightRef.current + speakerNotesPanelKeyboardStep
      );
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextHeight =
        speakerNotesPanelHeightRef.current - speakerNotesPanelKeyboardStep;
      if (nextHeight < minSpeakerNotesPanelHeight) {
        collapseSpeakerNotesPanel();
      } else {
        commitSpeakerNotesPanelHeight(nextHeight);
      }
    }
  }

  function handleAnimationPaneResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    beginHorizontalPaneResize({
      direction: "expand-right",
      event,
      maxWidth: maxAnimationPaneWidth,
      minWidth: minAnimationPaneWidth,
      onWidthChange: setAnimationPaneWidth,
      startWidth: animationPaneWidth
    });
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
      clearSelectedKeyword();
    }
  }, [currentSlide, selectedKeywordId]);

  useEffect(() => {
    const currentNotes = currentSlide?.speakerNotes ?? "";

    if (!isSpeakerNotesEditing) {
      setSpeakerNotesDraft(currentNotes);
      setSpeakerNotesDraftBase(currentNotes);
      setSpeakerNotesEditSlideId(null);
      return;
    }

    if (
      !currentSlide ||
      !isSpeakerNotesDraftBoundToSlide({
        editSlideId: speakerNotesEditSlideId,
        selectedSlideId: resolvedCurrentSlideId,
      })
    ) {
      resetSpeakerNotesEditState(currentNotes);
      return;
    }

    if (currentNotes === speakerNotesDraftBase) {
      return;
    }

    if (speakerNotesDraft === speakerNotesDraftBase) {
      setSpeakerNotesDraft(currentNotes);
      setSpeakerNotesDraftBase(currentNotes);
    }
  }, [
    currentSlide?.slideId,
    currentSlide?.speakerNotes,
    isSpeakerNotesEditing,
    speakerNotesDraft,
    speakerNotesDraftBase,
    speakerNotesEditSlideId
  ]);

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
    if (resolvedCurrentSlideId !== currentSlideId) {
      setCurrentSlideId(resolvedCurrentSlideId);
    }
  }, [currentSlideId, resolvedCurrentSlideId]);

  useEffect(() => {
    if (typeof window === "undefined" || !canMutateDeck) {
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
  }, [canMutateDeck, currentSlide, selectedElement]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const command = resolveEditorKeyboardCommand({
        altKey: event.altKey,
        canMutateDeck,
        canPaste: Boolean(copiedElementRef.current),
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        hasSelection: selectedElementIds.length > 0,
        hasSingleSelection: selectedElementIds.length === 1,
        isCustomShapeEditing: Boolean(customShapeEditElementId),
        isInlineTextEditing: Boolean(editingElementId),
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: event.target
      });

      if (command) {
        event.preventDefault();

        switch (command.type) {
          case "copy-selection":
            handleCopySelectedElement();
            return;
          case "delete-selection":
            handleDeleteSelectedElement();
            return;
          case "duplicate-selection":
            handleDuplicateSelectedElement();
            return;
          case "navigate-slide": {
            const targetIndex =
              currentSlideIndex + (command.direction === "next" ? 1 : -1);
            const targetSlide = deck.slides[targetIndex];
            if (targetSlide) {
              handleSelectSlide(targetSlide.slideId);
            }
            return;
          }
          case "nudge-selection": {
            if (!currentSlide) {
              return;
            }

            const patch = createSelectionNudgePatch({
              deck: workingDeckRef.current,
              deltaX: command.deltaX,
              deltaY: command.deltaY,
              selectedElementIds,
              slideId: currentSlide.slideId
            });
            if (patch) {
              commitPatch(patch);
            }
            return;
          }
          case "paste-selection":
            handlePasteCopiedElement();
            return;
          case "redo":
            handleRedo();
            return;
          case "save":
            if (command.canExecute) {
              void handleSaveDeck();
            }
            return;
          case "undo":
            handleUndo();
            return;
        }
      }

      if (
        event.defaultPrevented ||
        isEditorKeyboardCommandSuppressedTarget(event.target)
      ) {
        return;
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
    canMutateDeck,
    currentSlide,
    currentSlideIndex,
    customShapeEditElementId,
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
    canMutateDeck && typeof document !== "undefined" && isShapeMenuOpen && shapeMenuPosition
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
    canMutateDeck && typeof document !== "undefined" && elementContextMenu
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

  function renderSelectionProperties(
    element: DeckElement | null,
    slide: Slide | null,
    keyPrefix: string
  ) {
    return (
      <SelectionQuickBar
        animations={element ? selectedElementAnimations : []}
        animationDiagnostics={
          currentSlideAnimationDiagnostics ?? {
            danglingAnimations: [],
            duplicateOrders: [],
            selectedElementEmpty: false
          }
        }
        canCreateAnimation={Boolean(currentSlide && element)}
        canvas={deck.canvas}
        key={`${keyPrefix}-${element?.elementId ?? slide?.slideId ?? "none"}`}
        customShapeEditActive={isCustomShapeEditingSelection}
        element={element}
        selectedKeywordLabel={selectedKeyword?.text ?? null}
        slide={slide}
        showIds={showIds}
        theme={deck.theme}
        onOpenAnimationEditor={openAnimationInspector}
        onDeleteAnimation={(animationId) => {
          if (currentSlide) {
            handleDeleteAnimation(currentSlide.slideId, animationId);
          }
        }}
        onToggleCustomShapeClosed={() => {
          if (!element || !currentSlide || element.type !== "customShape") return;
          handleCommitCustomShapeGeometry(
            currentSlide.slideId,
            element.elementId,
            getCustomShapeAbsoluteNodes(element),
            !(element.props as CustomShapeElementProps).closed
          );
        }}
        onToggleCustomShapeEdit={() => {
          if (!element || element.type !== "customShape") return;
          setEditingElementId(null);
          setCustomShapeEditElementId((current) =>
            current === element.elementId ? null : element.elementId
          );
        }}
        onChangeFrame={(frame) => {
          if (element && currentSlide) {
            handleElementFrameChange(currentSlide.slideId, element.elementId, frame);
          }
        }}
        onChangeProps={(props) => {
          if (element && currentSlide) {
            handleElementPropsChange(currentSlide.slideId, element.elementId, props);
          }
        }}
        onChangeSlideStyle={(style) => {
          if (currentSlide) {
            handleSlideStyleChange(currentSlide.slideId, style);
          }
        }}
        onChangeTheme={handleThemeChange}
      />
    );
  }

  function renderCurrentSelectionInspector() {
    const elementControls =
      canMutateDeck && selectionInspectorModel.mode === "element"
        ? renderSelectionProperties(selectedElement, currentSlide, "design-element-properties")
        : undefined;
    const slideControls =
      canMutateDeck && selectionInspectorModel.mode === "slide"
        ? renderSelectionProperties(null, currentSlide, "design-slide-properties")
        : undefined;
    const multiControls =
      canMutateDeck && selectionInspectorModel.mode === "multi"
        ? (
            <MultiSelectionQuickBar
              canDistribute={selectionInspectorModel.selectedCount >= 3}
              selectedCount={selectionInspectorModel.selectedCount}
              onDistributeX={() => handleDistributeSelection("x")}
              onDistributeY={() => handleDistributeSelection("y")}
            />
          )
        : undefined;

    return (
      <SelectionInspector
        canEdit={canMutateDeck}
        elementControls={elementControls}
        elementLabel={selectedElement?.type}
        focusRef={selectionInspectorRef}
        model={selectionInspectorModel}
        multiControls={multiControls}
        slideControls={slideControls}
        slideLabel={currentSlide?.title}
        onEscape={handleSelectionInspectorEscape}
      />
    );
  }

  function renderSpeakerNotesPanel() {
    const notesPreview = (currentSlide?.speakerNotes ?? "").trim();

    return (
      <section
        aria-labelledby="speaker-notes-title"
        className={`script-panel stage-speaker-notes-panel ${
          isSpeakerNotesPanelExpanded ? "expanded" : "collapsed"
        } ${
          isSpeakerNotesEditing ? "editing" : ""
        } ${isSpeakerNotesPanelResizing ? "is-resizing" : ""}`}
        style={
          {
            "--speaker-notes-panel-height": `${speakerNotesPanelHeight}px`
          } as CSSProperties
        }
      >
        {isSpeakerNotesPanelExpanded ? (
          <button
            aria-disabled={isSpeakerNotesEditing}
            aria-label="발표 메모 높이 조절"
            aria-orientation="horizontal"
            aria-valuemax={getSpeakerNotesPanelMaxHeight()}
            aria-valuemin={minSpeakerNotesPanelHeight}
            aria-valuenow={speakerNotesPanelHeight}
            className="speaker-notes-resize-handle"
            role="separator"
            tabIndex={isSpeakerNotesEditing ? -1 : 0}
            type="button"
            onKeyDown={handleSpeakerNotesResizeKeyDown}
            onPointerDown={handleSpeakerNotesResizeStart}
          >
            <GripHorizontal aria-hidden="true" size={18} stroke={1.7} />
          </button>
        ) : null}
        <div className="script-panel-header">
          <button
            aria-controls="speaker-notes-content"
            aria-expanded={isSpeakerNotesPanelExpanded}
            aria-label={
              isSpeakerNotesPanelExpanded
                ? "발표 메모 접기"
                : "발표 메모 펼치기"
            }
            className="script-panel-heading speaker-notes-toggle"
            disabled={isSpeakerNotesEditing}
            type="button"
            onClick={handleToggleSpeakerNotesPanel}
          >
            <span aria-hidden="true" className="script-panel-icon">
              <FileText size={18} />
            </span>
            <div className="speaker-notes-toggle-copy">
              <div className="script-panel-title-row">
                <strong id="speaker-notes-title">발표 메모</strong>
                {isSpeakerNotesEditing ? (
                  <span className="script-panel-status">편집 중</span>
                ) : null}
              </div>
              {!isSpeakerNotesPanelExpanded ? (
                <span className="speaker-notes-preview">
                  {notesPreview || "발표자 노트를 추가하려면 클릭하세요."}
                </span>
              ) : null}
            </div>
            <ChevronDown
              aria-hidden="true"
              className="speaker-notes-toggle-chevron"
              size={16}
            />
          </button>
          {canMutateDeck && isSpeakerNotesPanelExpanded && isSpeakerNotesEditing ? (
            <div className="script-panel-actions">
              <button
                className="script-panel-action"
                type="button"
                onClick={handleCancelSpeakerNotesEdit}
              >
                취소
              </button>
              <button
                className="script-panel-action primary"
                type="button"
                onClick={handleSaveSpeakerNotesEdit}
              >
                저장
              </button>
            </div>
          ) : canMutateDeck && isSpeakerNotesPanelExpanded ? (
            <div className="script-panel-actions">
              <button
                className="script-panel-action assistant"
                type="button"
                onClick={handleOpenSpeakerNotesAssistant}
              >
                <Sparkles aria-hidden="true" size={14} />
                {(currentSlide?.speakerNotes ?? "").trim()
                  ? "AI로 다듬기"
                  : "AI 초안 만들기"}
              </button>
              <button
                className="script-panel-action"
                type="button"
                onClick={handleStartSpeakerNotesEdit}
              >
                <PenLine aria-hidden="true" size={14} />
                메모 편집
              </button>
            </div>
          ) : null}
        </div>
        <div
          id="speaker-notes-content"
          hidden={!isSpeakerNotesPanelExpanded}
          ref={speakerNotesContentRef}
        >
          {canMutateDeck && isSpeakerNotesEditing ? (
            <div className="script-panel-body">
              <textarea
                aria-label="발표 메모 수정"
                autoFocus
                className="script-notes-editor"
                placeholder={
                  "슬라이드에서 말할 내용을 입력하세요.\n문단을 나누면 발표할 때도 그대로 표시됩니다."
                }
                value={speakerNotesDraft}
                onChange={(event) => setSpeakerNotesDraft(event.target.value)}
              />
              <div
                aria-live="polite"
                className="script-panel-meta script-panel-character-count"
              >
                <span>{speakerNotesDraft.length.toLocaleString()}자</span>
              </div>
              <SpeakerNotesLengthMeter guidance={speakerNotesLengthGuidance} />
            </div>
          ) : (
            <div className="script-panel-body">
              <div className="script-notes-surface">
                <KeywordHighlightedNotes
                  keywords={currentSlide?.keywords ?? []}
                  notes={currentSlide?.speakerNotes ?? ""}
                  selectedKeywordId={selectedKeywordId}
                  selectedKeywordOccurrenceKey={selectedKeywordOccurrenceKey}
                  showIds={showIds}
                  slideId={currentSlide?.slideId ?? ""}
                  onSelectKeyword={handleSelectKeyword}
                  onSelectKeywordText={handleSpeakerNotesKeywordSelection}
                />
              </div>
              <div className="script-panel-meta script-panel-character-count">
                <span>{(currentSlide?.speakerNotes ?? "").length.toLocaleString()}자</span>
              </div>
              <section
                aria-labelledby="speaker-notes-keywords-title"
                className="script-keyword-section"
              >
                <div className="script-keyword-heading">
                  <strong id="speaker-notes-keywords-title">발표 체크포인트</strong>
                </div>
                <KeywordList
                  keywords={currentSlide?.keywords ?? []}
                  selectedKeywordId={selectedKeywordId}
                  showIds={showIds}
                  usageByKeywordId={currentSlideKeywordUsage}
                  onSelectKeyword={handleSelectKeyword}
                />
              </section>
              <SpeakerNotesLengthMeter guidance={speakerNotesLengthGuidance} />
              {canMutateDeck && selectedKeyword ? (
                <KeywordDetail
                  keyword={selectedKeyword}
                  requiredActive={selectedKeywordRequiredActive}
                  showIds={showIds}
                  usage={selectedKeywordUsage}
                  onClearSelection={clearSelectedKeyword}
                  onDeleteKeyword={() => {
                    if (!currentSlide) return;
                    handleDeleteSelectedKeyword(
                      currentSlide.slideId,
                      selectedKeyword.keywordId
                    );
                  }}
                  onToggleAdvanceSlide={() => {
                    if (!currentSlide) return;
                    handleToggleAdvanceSlideKeyword(
                      currentSlide.slideId,
                      selectedKeyword.keywordId,
                      !(selectedKeywordUsage?.advancesSlide ?? false)
                    );
                  }}
                  onToggleRequired={() => {
                    if (!currentSlide) return;
                    handleToggleKeywordRequired(
                      currentSlide.slideId,
                      selectedKeyword.keywordId,
                      selectedKeywordOccurrenceKey
                    );
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <main
        aria-busy={isDeckLoading}
        className={`editor-app-shell orbit-shell ${isDeckLoading ? "is-deck-loading" : ""}`}
      >
        <header className="app-topbar" ref={topbarRef}>
        <div className="topbar-left">
          <div className="menu-stack">
            <div className="editor-document-title">
              <button
                aria-label="ORBIT 홈으로 이동"
                onClick={handleExitToHome}
                type="button"
              >
                <img alt="ORBIT" src={orbitLogo} />
              </button>
              <span>
                <strong>{deck.title}</strong>
              </span>
            </div>
            <div className="menu-row">
              <button
                aria-label="ORBIT 홈으로 이동"
                className="top-icon-button"
                title="홈으로 이동"
                type="button"
                onClick={handleExitToHome}
              >
                <Home size={15} />
              </button>
              {canMutateDeck ? (
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
              ) : null}
            </div>

            {canMutateDeck && activeTopMenu === "file" ? (
              <div className="file-menu-popover" role="menu">
                <div className="file-menu-header">
                  <div>
                    <strong>{deck.title}</strong>
                    <span>
                      프레젠테이션 · {deck.canvas.width} × {deck.canvas.height}px
                    </span>
                  </div>
                </div>

                <div className="file-menu-list">
                  {fileMenuItems.map(({ action, icon: Icon, label, meta }) => (
                    <button
                      className="file-menu-item"
                      key={action}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        if (action === "import") {
                          openPptxFilePicker();
                          return;
                        }

                        if (action === "save") {
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
                  {resolvedExportMenuItems.map(({ action, disabled, icon: Icon, label, meta }) => (
                    <button
                      className="file-menu-item"
                      disabled={disabled}
                      key={label}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        if (action === "pptx") {
                          void handleExportPptx();
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
                </div>
              </div>
            ) : null}

          </div>
        </div>

        <div className="top-actions">
          {isDev && projectPresenceUsers.length > 0 ? (
            <button
              className="presence-avatar-trigger"
              type="button"
              aria-label="소켓 접속 상태 보기"
              onClick={() => setIsPresenceDebugOpen(true)}
            >
              {projectPresenceUsers.slice(0, 4).map((user) => (
                <span
                  className="avatar"
                  key={`${user.id}-${user.connectedAt}`}
                  title={getPresenceUserLabel(user)}
                >
                  {getPresenceUserInitial(user)}
                </span>
              ))}
              {projectPresenceUsers.length > 4 ? (
                <span className="avatar presence-avatar-more">
                  +{projectPresenceUsers.length - 4}
                </span>
              ) : null}
            </button>
          ) : null}
          {canMutateDeck ? (
            <EditorSaveControl
              disabled={isDeckLoading || isUsingFallbackDeck}
              emptyStateLabel={deckQuery.data ? "불러온 파일" : "저장 기록 없음"}
              errorMessage={saveErrorMessage}
              isSaving={isSaveInFlight(saveState)}
              lastSavedAtLabel={formatLastSavedAtLabel(lastSavedAt)}
              onSave={() => void handleSaveDeck()}
              recoveryHint={saveErrorMessage ? getSaveRecoveryHint(saveErrorCode) : null}
              statusLabel={saveStatusLabel}
            />
          ) : null}
          {ooxmlSyncStatus ? (
            <span
              className={`ooxml-sync-pill ${ooxmlSyncStatus.kind}`}
              title={ooxmlSyncStatus.detail}
            >
              {ooxmlSyncStatus.label}
            </span>
          ) : null}
          <button
            aria-label="발표 준비 경로 열기"
            className="editor-context-top-button"
            onClick={handleOpenPresentationJourney}
            type="button"
          >
            <FileText size={15} />
            <span>발표 준비</span>
          </button>
          <button
            aria-label="버전 기록 열기"
            className="editor-context-top-button"
            onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/history`; }}
            type="button"
          >
            <History size={15} />
            <span>버전</span>
          </button>
          {capabilities.canCreatePresentationSession ? <PresentationMenu
            activeStartAction={
              activePresentationAction === "presentation" ||
              activePresentationAction === "rehearsal"
                ? activePresentationAction
                : null
            }
            canOpenAudienceLink={canOpenAudienceLink}
            canStartPresentation={canStartPresentation}
            isOpen={activeTopMenu === "presentation"}
            onOpenAudienceLink={() => {
              setIsAudienceLinkModalOpen(true);
              setActiveTopMenu(null);
            }}
            onStartPresentation={() => void handleStartPresentation()}
            onStartRehearsal={() => void handleStartRehearsal()}
            onToggle={() =>
              setActiveTopMenu((current) =>
                current === "presentation" ? null : "presentation"
              )
            }
          /> : capabilities.canStartPersonalRehearsal ? (
            <button
              className="editor-rehearsal-button"
              type="button"
              onClick={() => void handleStartRehearsal()}
            >
              개인 리허설
            </button>
          ) : null}
          {capabilities.canManageShare ? <button
            className="share-top-button"
            type="button"
            aria-expanded={isSharePanelOpen}
            aria-haspopup="dialog"
            disabled={!canManageShare || isSharePermissionLoading}
            title="프로젝트 공유"
            onClick={() => {
              if (!canManageShare) {
                return;
              }
              openSharePanel();
              setActiveTopMenu(null);
            }}
          >
            <Share2 size={15} />
            공유
          </button> : null}
          <button
            aria-label="에디터 새로고침"
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
      {!canMutateDeck ? <ProjectReadOnlyBanner /> : null}
      {!canMutateDeck && saveErrorMessage ? (
        <p className="editor-viewer-action-error" role="alert">
          {saveErrorMessage}
        </p>
      ) : null}
      {canMutateDeck && isDeleteUndoToastOpen ? (
        <EditorUndoToast
          message="슬라이드가 삭제되었습니다"
          onUndo={() => {
            handleUndo();
          }}
        />
      ) : null}
      {capabilities.canManageShare && isSharePanelOpen
        ? createPortal(
            <ShareAccessModal
              activeTab={shareAccessTab}
              actionError={shareActionError}
              actionLabel={shareActionLabel}
              inviteEmail={shareInviteEmail}
              inviteRole={shareInviteRole}
              isLoading={isShareLoading}
              members={shareMembers}
              requests={shareRequests}
              onClose={() => setIsSharePanelOpen(false)}
              onInvite={handleShareInvite}
              onInviteEmailChange={setShareInviteEmail}
              onInviteRoleChange={setShareInviteRole}
              onMemberRemove={handleShareMemberRemoval}
              onMemberRoleChange={handleShareMemberRoleChange}
              onRequestStatusChange={handleShareRequestStatus}
              onTabChange={setShareAccessTab}
            />,
            document.body
          )
        : null}
      <AudienceLinkModal
        isOpen={isAudienceLinkModalOpen}
        projectId={projectId}
        onClose={() => setIsAudienceLinkModalOpen(false)}
      />
      {isExitConfirmOpen
        ? createPortal(
            <EditorExitConfirmModal
              isSaving={isExitSaving}
              onCancel={() => setIsExitConfirmOpen(false)}
              onDiscard={handleDiscardAndExit}
              onSaveAndExit={() => {
                void handleSaveAndExit();
              }}
            />,
            document.body
          )
        : null}
      {isDev && isPresenceDebugOpen
        ? createPortal(
            <div
              className="presence-debug-backdrop"
              role="presentation"
              onMouseDown={() => setIsPresenceDebugOpen(false)}
            >
              <section
                aria-label="소켓 접속 상태"
                aria-modal="true"
                className="presence-debug-modal"
                role="dialog"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header>
                  <div>
                    <strong>소켓 접속 상태</strong>
                    <span>프로젝트 presence 테스트 데이터입니다.</span>
                  </div>
                  <button
                    type="button"
                    aria-label="소켓 상태 닫기"
                    onClick={() => setIsPresenceDebugOpen(false)}
                  >
                    닫기
                  </button>
                </header>
                <div className="presence-debug-grid">
                  <span>상태</span>
                  <strong>{formatSocketStatus(socketStatus)}</strong>
                  <span>Socket ID</span>
                  <strong>{socketId || "-"}</strong>
                  <span>프로젝트</span>
                  <strong>{projectId}</strong>
                  <span>접속자</span>
                  <strong>{projectPresenceUsers.length}명</strong>
                  <span>마지막 presence</span>
                  <strong>{lastPresenceAt ? formatDebugDate(lastPresenceAt) : "-"}</strong>
                  <span>세션 남은 시간</span>
                  <strong>{formatSessionRemaining(sessionDebug)}</strong>
                </div>
                {socketErrorMessage ? (
                  <p className="presence-debug-error">{socketErrorMessage}</p>
                ) : null}
                <div className="presence-debug-users">
                  {projectPresenceUsers.length > 0 ? (
                    projectPresenceUsers.map((user) => (
                      <div key={`${user.id}-${user.connectedAt}`}>
                        <span className="avatar">{getPresenceUserInitial(user)}</span>
                        <div>
                          <strong>{getPresenceUserLabel(user)}</strong>
                          <small>{formatDebugDate(user.connectedAt)}</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>현재 표시할 접속자가 없습니다.</p>
                  )}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
      {isDeckLoading ? (
        <div className="editor-loading-guard" role="status">
          <span className="editor-loading-spinner" aria-hidden="true" />
          <strong>발표 자료를 불러오는 중입니다</strong>
        </div>
      ) : null}

      <section
        className={`editor-panel ${!canMutateDeck ? "read-only" : ""} ${isAnimationPanelOpen ? "animation-panel-open" : ""} ${
          isRightPanelOpen ? "" : "right-panel-closed"
        } ${isSlidesPaneCollapsed ? "slides-panel-collapsed" : ""}`}
        aria-label="Presentation editor"
        style={
          {
            "--animation-pane-width": `${animationPaneWidth}px`,
            "--slides-pane-width": `${
              isSlidesPaneCollapsed ? collapsedSlidesPaneWidth : slidesPaneWidth
            }px`,
            "--right-pane-width": `${rightPaneWidth}px`,
            "--right-pane-collapsed-width": `${collapsedRightPaneWidth}px`,
            "--speaker-notes-panel-height": `${speakerNotesPanelHeight}px`
          } as CSSProperties
        }
      >
        <aside
          className={`slides-pane ${isSlidesPaneCollapsed ? "collapsed" : ""}`}
          data-testid="editor-slide-rail-pane"
        >
          <div className="slides-pane-header">
            {!isSlidesPaneCollapsed ? (
              <div className="slides-pane-title">
                <strong>슬라이드</strong>
                <span aria-label={`총 ${deck.slides.length}개`}>{deck.slides.length}</span>
              </div>
            ) : null}
            <button
              aria-label={
                isSlidesPaneCollapsed ? "슬라이드 패널 펼치기" : "슬라이드 패널 접기"
              }
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

          {hasSlides ? (
            <SlideRail
              canMutate={canMutateDeck}
              canvasAspectRatio={`${deck.canvas.width} / ${deck.canvas.height}`}
              collapsed={isSlidesPaneCollapsed}
              items={slideRailItems}
              showIds={showIds}
              thumbnailBackgrounds={slideRailThumbnailBackgrounds}
              viewMode={slidePanelView}
              onDelete={handleDeleteSlide}
              onDuplicate={handleDuplicateSlide}
              onMove={handleMoveSlide}
              onReorder={handleReorderSlides}
              onSelect={handleSelectSlide}
            />
          ) : (
            <div className={`slides-list ${slidePanelView}-view`}>
              <EmptyPanel
                title="슬라이드 없음"
                description="덱에 표시할 슬라이드가 없습니다. 새 슬라이드 또는 가져오기 기능이 연결되면 이 영역에 목록이 표시됩니다."
              />
            </div>
          )}

          {!isSlidesPaneCollapsed ? (
            <div className="side-footer">
              <div className="slide-view-switch" role="group" aria-label="슬라이드 보기 방식">
                <button
                  aria-pressed={slidePanelView === "thumbnail"}
                  className={slidePanelView === "thumbnail" ? "active" : ""}
                  type="button"
                  onClick={() => setSlidePanelView("thumbnail")}
                >
                  썸네일
                </button>
                <button
                  aria-pressed={slidePanelView === "list"}
                  className={slidePanelView === "list" ? "active" : ""}
                  type="button"
                  onClick={() => setSlidePanelView("list")}
                >
                  목록
                </button>
              </div>
              {canMutateDeck ? <button className="add-slide-button" type="button" onClick={handleAddSlide}>
                <Plus aria-hidden="true" size={17} />
                슬라이드 추가
              </button> : null}
            </div>
          ) : null}

          <button
            aria-label="슬라이드 패널 크기 조정"
            className="slides-pane-resizer"
            type="button"
            onPointerDown={handleSlidesPaneResizeStart}
          />
        </aside>

        {canMutateDeck && isAnimationPanelOpen ? (
          <AnimationSidePanel
            animations={selectedElementAnimations}
            canPlaySlideAnimations={canPlayCurrentSlideAnimations}
            canCreateAnimation={Boolean(currentSlide && selectedAnimationPanelElement)}
            element={selectedAnimationPanelElement}
            isPlayingSlideAnimations={isPlayingCurrentSlideAnimations}
            keywordOptions={animationPanelKeywordOptions}
            keywordTriggerRestrictionMessage={
              animationKeywordTriggerPolicy.restrictionMessage
            }
            keywordTriggerWarningMessage={
              animationKeywordTriggerPolicy.warningMessage
            }
            preferredAnimationId={animationPanelFocusedAnimationId}
            selectedKeywordId={selectedKeywordId}
            selectedKeywordLabel={selectedKeyword?.text ?? null}
            selectedKeywordOccurrenceId={selectedKeywordOccurrenceKey}
            slideAnimations={currentSlideAnimations}
            slideElements={currentSlide?.elements ?? []}
            onAddAnimation={(draft, keywordId, keywordOccurrenceId) => {
              if (!currentSlide || !selectedAnimationPanelElement) {
                return;
              }

              handleAddAnimation(
                currentSlide.slideId,
                selectedAnimationPanelElement.elementId,
                keywordId,
                keywordOccurrenceId,
                draft
              );
            }}
            showIds={showIds}
            onClose={() => setIsAnimationPanelOpen(false)}
            onPlaySlideAnimations={playCurrentSlideAnimations}
            onResizeStart={handleAnimationPaneResizeStart}
            onDeleteAnimation={(animationId) => {
              if (!currentSlide) {
                return;
              }

              handleDeleteAnimation(currentSlide.slideId, animationId);
            }}
            onSelectKeyword={handleSelectKeyword}
            onSelectSlideAnimation={handleSelectSlideAnimationFromPanel}
            onUpdateAnimation={(animationId, animation) => {
              if (!currentSlide) {
                return;
              }

              handleUpdateAnimation(currentSlide.slideId, animationId, animation);
            }}
          />
        ) : null}

        <section className="stage-pane">
          <div className="stage-top-controls">
            <div
              className={`editor-toolbar ${
                canMutateDeck ? "" : "viewer-zoom-only"
              }`}
            >
              {canMutateDeck ? <>
                {isCompactEditorLayout && selectionInspectorModel.selectedCount > 0 ? (
                <button
                  aria-controls="editor-selection-inspector-pane"
                  aria-describedby="compact-selection-count"
                  aria-expanded={isRightPanelOpen && rightPanelView === "design"}
                  aria-label="선택 항목 속성 열기"
                  className="compact-selection-trigger"
                  ref={compactSelectionTriggerRef}
                  type="button"
                  onClick={handleOpenCompactSelectionInspector}
                >
                  <span>속성</span>
                  <span id="compact-selection-count">
                    {selectionInspectorModel.selectedCount}개 선택됨
                  </span>
                </button>
              ) : null}
                <div className="tool-group">
                <button
                  aria-label="실행 취소"
                  className="icon-button history-nav-button"
                  disabled={undoStack.length === 0}
                  type="button"
                  title="Undo"
                  onClick={handleUndo}
                >
                  <IconArrowBackUp className="history-nav-icon" size={17} />
                </button>
                <button
                  aria-label="다시 실행"
                  className="icon-button history-nav-button"
                  disabled={redoStack.length === 0}
                  type="button"
                  title="Redo"
                  onClick={handleRedo}
                >
                  <IconArrowForwardUp className="history-nav-icon" size={17} />
                </button>
                <button
                  aria-label="선택 도구"
                  className={`icon-button ${insertTool === "select" ? "selected-tool" : ""}`}
                  type="button"
                  title="Select"
                  onClick={() => setInsertTool("select")}
                >
                  <MousePointer2 size={14} />
                </button>
                <div className="toolbar-divider" />
                <button
                  aria-label="텍스트"
                  className="tool-button"
                  type="button"
                  onClick={handleAddTextElement}
                >
                  <Type size={14} />
                  <span className="tool-button-label">텍스트</span>
                </button>
                <div className="shape-menu-anchor">
                  <button
                    aria-expanded={isShapeMenuOpen}
                    aria-haspopup="menu"
                    aria-label="도형"
                    className={`tool-button ${
                      isShapeMenuOpen || insertTool === "customShape" ? "active" : ""
                    }`}
                    ref={shapeMenuButtonRef}
                    type="button"
                    onClick={() => setIsShapeMenuOpen((current) => !current)}
                  >
                    <Shapes size={14} />
                    <span className="tool-button-label">도형</span>
                    <ChevronDown size={14} />
                  </button>
                </div>
                <button
                  aria-label="차트"
                  className="tool-button"
                  type="button"
                  onClick={handleAddChartElement}
                >
                  <BarChart3 size={14} />
                  <span className="tool-button-label">차트</span>
                </button>
                <button
                  aria-label="이미지"
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
                  <span className="tool-button-label">이미지</span>
                </button>
                <button
                  aria-label="애니메이션"
                  className={`tool-button ${
                    isAnimationPanelOpen || selectedElementAnimations.length > 0
                      ? "active"
                      : ""
                  }`}
                  disabled={!currentSlide}
                  type="button"
                  onClick={() => {
                    if (!currentSlide) {
                      return;
                    }
                    openAnimationInspector();
                  }}
                >
                  <Sparkles size={14} />
                  <span className="tool-button-label">애니메이션</span>
                </button>
                </div>
              </> : null}
              <EditorZoomControl
                canZoomIn={stageScale < maximumManualEditorZoom}
                canZoomOut={stageScale > minimumManualEditorZoom}
                isFit={editorZoomState.mode === "fit"}
                zoomPercent={zoomPercent}
                onFit={() => updateEditorZoom({ mode: "fit" })}
                onReset={() =>
                  updateEditorZoom({ mode: "manual", scale: 1 })
                }
                onZoomIn={() => handleEditorZoomStep("in")}
                onZoomOut={() => handleEditorZoomStep("out")}
              />
            </div>
          </div>

          <div
            aria-label="슬라이드 캔버스 작업 영역"
            className="canvas-scroll"
            data-zoom-mode={editorZoomState.mode}
            data-zoom-percent={zoomPercent}
            data-testid="editor-canvas-pane"
            ref={editorCanvasViewportRef}
            role="region"
            tabIndex={0}
          >
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
                    disableInteractions={!canMutateDeck || isPlayingCurrentSlideAnimations}
                    editingElementId={canMutateDeck ? editingElementId : null}
                    elementStates={animationPreviewElementStates}
                    insertTool={insertTool}
                    selectedElementIds={selectedElementIds}
                    showIds={showIds}
                    slide={currentSlide}
                    stageScale={stageScale}
                    stageRef={editorStageRef}
                    validationHighlightElementIds={validationHighlightElementIds}
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

            <SpeakerNotesAssistantDialog
              errorMessage={speakerNotesAssistantError}
              mode={speakerNotesAssistantMode}
              occurrenceWarning={speakerNotesAssistantOccurrenceWarning}
              onApply={handleApplySpeakerNotesSuggestion}
              onClose={() => setIsSpeakerNotesAssistantOpen(false)}
              onGenerate={() => void handleGenerateSpeakerNotesSuggestion()}
              onModeChange={setSpeakerNotesAssistantMode}
              open={isSpeakerNotesAssistantOpen}
              originalNotes={speakerNotesAssistantSource?.notes ?? ""}
              result={speakerNotesAssistantResult}
              status={speakerNotesAssistantStatus}
            />
          </div>

          {renderSpeakerNotesPanel()}
        </section>

        {canMutateDeck ? <aside
          className={`ai-pane ${isRightPanelOpen ? "" : "collapsed"}`}
          data-testid="editor-inspector-pane"
          id="editor-selection-inspector-pane"
        >
          {isRightPanelOpen ? (
            <>
              <button
                aria-label="오른쪽 패널 크기 조정"
                className="right-pane-resizer"
                type="button"
                onPointerDown={handleRightPaneResizeStart}
              />
              <div className="ai-header">
                <h2>편집 패널</h2>
                <div>
                  <button
                    aria-label="오른쪽 패널 접기"
                    className="collapse-right-pane-button"
                    type="button"
                    title="오른쪽 패널 접기"
                    onClick={handleCloseRightPanel}
                  >
                    <PanelRightClose size={16} />
                  </button>
                </div>
              </div>
              <div
                aria-label="오른쪽 패널 보기"
                className="right-panel-tabs"
                role="tablist"
              >
                <button
                  aria-controls="editor-journey-panel"
                  aria-selected={rightPanelView === "journey"}
                  className={rightPanelView === "journey" ? "active" : ""}
                  id="editor-journey-tab"
                  role="tab"
                  tabIndex={rightPanelView === "journey" ? 0 : -1}
                  type="button"
                  onClick={() => setRightPanelView("journey")}
                  onKeyDown={handleRightPanelTabKeyDown}
                >
                  발표 준비
                </button>
                <button
                  aria-controls="editor-ai-panel"
                  aria-selected={rightPanelView === "ai"}
                  className={rightPanelView === "ai" ? "active" : ""}
                  id="editor-ai-tab"
                  role="tab"
                  tabIndex={rightPanelView === "ai" ? 0 : -1}
                  type="button"
                  onClick={() => setRightPanelView("ai")}
                  onKeyDown={handleRightPanelTabKeyDown}
                >
                  AI 코치
                </button>
                <button
                  aria-controls="editor-design-panel"
                  aria-selected={rightPanelView === "design"}
                  className={rightPanelView === "design" ? "active" : ""}
                  id="editor-design-tab"
                  role="tab"
                  tabIndex={rightPanelView === "design" ? 0 : -1}
                  type="button"
                  onClick={() => setRightPanelView("design")}
                  onKeyDown={handleRightPanelTabKeyDown}
                >
                  디자인
                </button>
              </div>
              <div className="assistant-panel-slot">
                <div
                  aria-labelledby="editor-journey-tab"
                  className="assistant-panel-view editor-journey-panel"
                  hidden={rightPanelView !== "journey"}
                  id="editor-journey-panel"
                  role="tabpanel"
                >
                  <PresentationJourneyPanel
                    busy={activePresentationAction !== null}
                    model={presentationJourneyModel}
                    onAction={handlePresentationJourneyAction}
                    statusMessage={presentationJourneyStatus}
                  />
                </div>
                <div
                  aria-labelledby="editor-ai-tab"
                  className="assistant-panel-view editor-ai-coach-panel"
                  hidden={rightPanelView !== "ai"}
                  id="editor-ai-panel"
                  role="tabpanel"
                >
                  <div
                    aria-label="AI 코치 보기"
                    className="assistant-subtabs"
                    role="tablist"
                  >
                    <button
                      aria-controls="editor-ai-chat-panel"
                      aria-selected={aiPanelView === "chat"}
                      className={aiPanelView === "chat" ? "active" : ""}
                      id="editor-ai-chat-tab"
                      role="tab"
                      tabIndex={aiPanelView === "chat" ? 0 : -1}
                      type="button"
                      onClick={() => setAiPanelView("chat")}
                      onKeyDown={handleAiPanelTabKeyDown}
                    >
                      채팅
                    </button>
                    <button
                      aria-controls="editor-ai-tools-panel"
                      aria-selected={aiPanelView === "tools"}
                      className={aiPanelView === "tools" ? "active" : ""}
                      id="editor-ai-tools-tab"
                      role="tab"
                      tabIndex={aiPanelView === "tools" ? 0 : -1}
                      type="button"
                      onClick={() => setAiPanelView("tools")}
                      onKeyDown={handleAiPanelTabKeyDown}
                    >
                      검사
                    </button>
                  </div>
                  <div
                    aria-labelledby="editor-ai-chat-tab"
                    className="assistant-panel-subview"
                    hidden={aiPanelView !== "chat"}
                    id="editor-ai-chat-panel"
                    role="tabpanel"
                  >
                    <AiChatPanel
                      projectId={projectId}
                      deck={deck}
                      currentSlide={currentSlide}
                      selectedElementIds={selectedElementIds}
                      chatState={aiChatState}
                      onChatStateChange={setAiChatState}
                      onProposalApplied={handleDesignAgentProposalApplied}
                    />
                  </div>
                  <div
                    aria-labelledby="editor-ai-tools-tab"
                    className="assistant-panel-subview editor-ai-tools-subview"
                    hidden={aiPanelView !== "tools"}
                    id="editor-ai-tools-panel"
                    role="tabpanel"
                  >
                    <PptxImportQualityPanel state={pptxImportState} />
                    <ValidationPanel
                      canRepair={capabilities.canUseAiMutations}
                      items={presentedEditorValidationItems}
                      onHighlightElementIds={setValidationHighlightElementIds}
                      onFocusTarget={handleValidationTargetFocus}
                      onRepairTextOverflow={handleSafeTextOverflowRepair}
                      repairableElementIds={safeTextOverflowRepair.repairedElementIds}
                      repairStatus={validationRepairStatus}
                    />
                    <SourceLedgerPanel slide={currentSlide ?? null} />
                    <SemanticCueReviewPanel
                      extractionState={semanticCueExtractionState}
                      slide={currentSlide}
                      onChange={handleSemanticCueReviewChange}
                      onExtract={(force) => void handleSemanticCueExtraction(force)}
                    />
                  </div>
                </div>
                <div
                  aria-labelledby="editor-design-tab"
                  className="assistant-panel-view editor-design-panel"
                  hidden={rightPanelView !== "design"}
                  id="editor-design-panel"
                  role="tabpanel"
                >
                  {renderCurrentSelectionInspector()}
                </div>
              </div>
            </>
          ) : (
            <div className="collapsed-right-rail">
              <button
                aria-label="발표 준비 경로 열기"
                className="compact-presentation-journey-button"
                type="button"
                onClick={handleOpenPresentationJourney}
              >
                <FileText aria-hidden="true" size={18} />
              </button>
              <button
                aria-label="오른쪽 패널 펼치기"
                className="collapse-right-pane-button"
                type="button"
                title="오른쪽 패널 펼치기"
                onClick={() => setIsRightPanelOpen(true)}
              >
                <PanelRightOpen size={16} />
              </button>
              <span>도구</span>
            </div>
          )}
        </aside> : (
          <aside
            className={`ai-pane viewer-selection-pane ${isRightPanelOpen ? "" : "collapsed"}`}
            data-testid="editor-inspector-pane"
            id="editor-selection-inspector-pane"
          >
            {isRightPanelOpen ? (
              <>
                <div className="ai-header">
                  <h2>선택 정보</h2>
                  <div>
                    <button
                      aria-label="오른쪽 패널 접기"
                      className="collapse-right-pane-button"
                      type="button"
                      title="오른쪽 패널 접기"
                      onClick={handleCloseRightPanel}
                    >
                      <PanelRightClose size={16} />
                    </button>
                  </div>
                </div>
                <div className="viewer-selection-pane-content">
                  <PresentationJourneyPanel
                    busy={activePresentationAction !== null}
                    model={presentationJourneyModel}
                    onAction={handlePresentationJourneyAction}
                    statusMessage={presentationJourneyStatus}
                  />
                  <ValidationPanel
                    canRepair={false}
                    items={presentedEditorValidationItems}
                    onHighlightElementIds={setValidationHighlightElementIds}
                    onFocusTarget={handleValidationTargetFocus}
                    repairableElementIds={[]}
                    repairStatus=""
                  />
                  {renderCurrentSelectionInspector()}
                </div>
              </>
            ) : (
              <div className="collapsed-right-rail">
                <button
                  aria-label="발표 준비 경로 열기"
                  className="compact-presentation-journey-button"
                  type="button"
                  onClick={handleOpenPresentationJourney}
                >
                  <FileText aria-hidden="true" size={18} />
                </button>
                <button
                  aria-label="오른쪽 패널 펼치기"
                  className="collapse-right-pane-button"
                  type="button"
                  title="오른쪽 패널 펼치기"
                  onClick={() => setIsRightPanelOpen(true)}
                >
                  <PanelRightOpen size={16} />
                </button>
                <span>선택</span>
              </div>
            )}
          </aside>
        )}
      </section>

      <div data-testid="editor-elements-debug" hidden>
        {JSON.stringify(
          visibleElements.map((element) => ({
            elementId: element.elementId,
            type: element.type,
            role: element.role,
            ...(element.type === "text"
              ? {
                  fontSize: element.props.fontSize,
                  lineHeight: element.props.lineHeight
                }
              : {}),
            x: Math.round(element.x),
            y: Math.round(element.y),
            width: Math.round(element.width),
            height: Math.round(element.height),
            rotation: Math.round(element.rotation)
          }))
        )}
      </div>
      <div data-testid="editor-quality-debug" hidden>
        {JSON.stringify({
          currentSlideId: resolvedCurrentSlideId,
          selectedElementIds,
          validationHighlightElementIds
        })}
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
      <div data-testid="editor-animations-debug" hidden>
        {JSON.stringify(currentSlide?.animations ?? [])}
      </div>

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
        <input
          ref={pptxFileInputRef}
          accept={pptxImportAccept}
          hidden
          type="file"
          onChange={handlePptxFileInputChange}
        />
      </main>
      {shapeMenuOverlay}
      {elementContextMenuOverlay}
    </>
  );
}

function buildSlideThumbBackground(slide: Slide, deck: Deck, cachedUrl?: string) {
  const background = slide.style.backgroundColor ?? deck.theme.backgroundColor;

  if (cachedUrl) {
    return `url("${cachedUrl}") center / contain no-repeat, ${background}`;
  }

  if (slide.thumbnailUrl) {
    return `url("${resolveEditorAssetUrl(slide.thumbnailUrl)}") center / contain no-repeat, ${background}`;
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
    return "불러오기 실패";
  }

  if (props.isUsingFallbackDeck) {
    return "저장되지 않은 자료";
  }

  if (props.saveState === "error") {
    return "저장 실패";
  }

  if (props.saveState === "manual-saving") {
    return "저장 중";
  }

  if (props.saveState === "manual-saved") {
    return "모두 저장됨";
  }

  if (props.saveState === "auto-saving") {
    return "저장 중";
  }

  if (props.saveState === "auto-pending") {
    return "저장 대기 중";
  }

  if (props.saveState === "conflict-recovered") {
    return "충돌 복구 후 저장됨";
  }

  return "모두 저장됨";
}

function getOoxmlSyncStatus(job: Job | null) {
  if (!job || job.type !== "pptx-ooxml-sync") {
    return null;
  }

  const warnings = readOoxmlSyncWarnings(job);
  if (job.status === "failed") {
    return {
      detail: job.error?.message ?? "PPTX OOXML sync failed.",
      kind: "failed",
      label: "OOXML sync failed"
    };
  }

  if (job.status === "succeeded") {
    return {
      detail: warnings.join("\n") || "PPTX OOXML sync completed.",
      kind: warnings.length > 0 ? "warning" : "succeeded",
      label: warnings.length > 0 ? "OOXML sync warnings" : "OOXML synced"
    };
  }

  return {
    detail: job.message || "PPTX OOXML sync is queued.",
    kind: "pending",
    label: "OOXML sync pending"
  };
}

function readOoxmlSyncWarnings(job: Job): string[] {
  const warnings = job.result?.warnings;
  return Array.isArray(warnings)
    ? warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
}

function pptxImportMenuMeta(state: PptxImportState) {
  if (state.status === "uploading") return "업로드 중...";
  if (state.status === "importing") return "변환 중...";
  if (state.status === "succeeded" && state.qualityReport) {
    return `품질 ${state.qualityReport.compositeScore}`;
  }
  if (state.status === "error") return "실패";
  return "업로드";
}

function isSaveInFlight(saveState: SaveState) {
  return saveState === "auto-saving" || saveState === "manual-saving";
}

function toPresentationJourneySaveState(
  saveState: SaveState
): PresentationJourneySaveState {
  if (saveState === "error") return "error";
  if (saveState === "conflict-recovered") return "conflict";
  if (saveState === "auto-pending") return "pending";
  if (isSaveInFlight(saveState)) return "saving";
  return "saved";
}

function getSaveErrorStatusLabel(saveErrorCode: SaveErrorCode | null) {
  switch (saveErrorCode) {
    case "manual-render-failed":
      return "렌더 저장 실패";
    case "conflict-recovery-failed":
      return "충돌 복구 실패";
    case "rehearsal-blocked":
      return "리허설 준비 중단";
    case "rehearsal-save-failed":
      return "리허설 저장 실패";
    case "missing-project":
    case "missing-persisted-base":
    case "auto-save-failed":
      return "저장 실패";
    default:
      return "저장 실패";
  }
}

function getSaveRecoveryHint(saveErrorCode: SaveErrorCode | null) {
  switch (saveErrorCode) {
    case "manual-render-failed":
      return "다시 저장 필요";
    case "conflict-recovery-failed":
      return "새로고침 후 재시도";
    case "rehearsal-blocked":
      return "발표 자료를 먼저 불러와 주세요";
    case "rehearsal-save-failed":
      return "상단 리허설 버튼으로 다시 시도";
    case "missing-project":
    case "missing-persisted-base":
      return "새로고침 후 재시도";
    case "auto-save-failed":
      return "다시 저장 필요";
    default:
      return null;
  }
}

function PptxImportQualityPanel(props: { state: PptxImportState }) {
  const { state } = props;
  if (state.status === "idle") {
    return null;
  }

  return (
    <section
      className="suggestion-card pptx-import-quality"
      data-testid="pptx-import-quality"
    >
      <strong>PPTX 가져오기</strong>
      <div className="stack-list">
        <div className="stack-item compact">
          <span>{state.message}</span>
          {state.qualityReport ? (
            <strong>{state.qualityReport.compositeScore}/100</strong>
          ) : null}
        </div>
        {state.qualityReport ? (
          <div className="stack-item compact">
            <span>편집 가능</span>
            <strong>{Math.round(state.qualityReport.editabilityCoverage * 100)}%</strong>
          </div>
        ) : null}
        {state.warnings.slice(0, 3).map((warning) => (
          <div className="stack-item compact" key={warning}>
            <span>{warning}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatLastSavedAtLabel(lastSavedAt: string | null): string | null {
  if (!lastSavedAt) {
    return null;
  }

  const date = new Date(lastSavedAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
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

function getPptxImportValidationMessage(file: Pick<File, "name" | "size" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isPptx = file.type === pptxMimeType || extension === "pptx";

  if (!isPptx) {
    return "PPTX 파일만 가져올 수 있습니다.";
  }

  if (file.size > maxAssetUploadSizeBytes) {
    return `PPTX 파일 크기는 최대 ${formatBytes(maxAssetUploadSizeBytes)}까지 가능합니다.`;
  }

  if (file.size <= 0) {
    return "빈 PPTX 파일은 가져올 수 없습니다.";
  }

  return "";
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
