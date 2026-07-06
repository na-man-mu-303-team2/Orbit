import {
  createAddAnimationPatch,
  createAddElementPatch,
  createAddAnimationWithKeywordTriggerPatch,
  createAddSlidePatch,
  createKeyword,
  createDefaultAnimation,
  createDemoDeck,
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
  appendDeckPatchResponseSchema,
  createKeywordOccurrenceId,
  deckApiErrorSchema,
  demoIds,
  getDeckResponseSchema,
  maxAssetUploadSizeBytes,
  meResponseSchema,
  putDeckResponseSchema
} from "@orbit/shared";
import { jobSchema, type Job } from "../../../../../../packages/shared/src/jobs/job.schema";
import {
  pptxImportJobResultSchema,
  type PptxImportJobResult,
  type QualityReport
} from "../../../../../../packages/shared/src/deck/template-blueprint.schema";
import { createProject, fetchProjects, uploadProjectAsset } from "../../projects/ProjectAssetWorkspace";
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
  defaultAnimationPaneWidth,
  maxAnimationPaneWidth,
  minAnimationPaneWidth,
  toAnimationKeywordTriggerOptions,
  useEditorAnimationPreview
} from "./components/animation";
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
import { EditorSaveControl } from "./components/EditorSaveControl";
import { EditorExitConfirmModal } from "./components/EditorExitConfirmModal";
import { PresentationMenu } from "./components/PresentationMenu";
import {
  ShareAccessModal
} from "./components/ShareAccessModal";
import { HistoryChevronIcon } from "./components/HistoryChevronIcon";
import { SelectionQuickBar } from "./components/SelectionQuickBar";
import {
  useEditorPersistenceState,
  type PatchProducer,
  type SaveErrorCode,
  type SaveState
} from "./hooks/useEditorPersistenceState";
import { useProjectShareAccess } from "./hooks/useProjectShareAccess";
import { beginHorizontalPaneResize } from "./utils/beginHorizontalPaneResize";
import { createThemeCascadePatch } from "./utils/themeCascadePatch";
export {
  EditorStateNotice
} from "./components/EditorStateNotice";
export {
  mergeDeckIntoQueryCache,
  buildSlideThumbnailPatch,
  getImportedSlideThumbnailRefreshSlideIds,
  getPatchThumbnailRefreshSlideIds,
  shouldRefreshImportedSlideThumbnails,
  shouldApplyManualSaveResult,
  shouldHydrateDeckFromQuery
} from "./utils/deckState";
export { createDistributeSelectionPatch } from "./utils/selectionDistribution";
export { getEditorValidationItems } from "../ai/quality/editorValidation";
import type {
  ApplyAiSuggestionResponse,
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
  ShapeElementProps,
  Slide,
  DeckApiErrorCode
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
  ImagePlus,
  LayoutTemplate,
  Minus,
  MoveRight,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  RefreshCw,
  Shapes,
  Share2,
  Sparkles,
  Type,
  Upload,
  Wand2,
  Home,
} from "lucide-react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { io } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { AudienceLinkModal } from "../audience-link/AudienceLinkModal";
import { ValidationPanel } from "../ai/quality/ValidationPanel";
import { getEditorValidationItems } from "../ai/quality/editorValidation";
import { SuggestionPanel } from "../suggestions/components/SuggestionPanel";
import {
  buildSlideThumbnailPatch,
  getImportedSlideThumbnailRefreshSlideIds,
  getPatchThumbnailRefreshSlideIds,
  mergeDeckIntoQueryCache,
  shouldApplyManualSaveResult,
  shouldRefreshImportedSlideThumbnails,
  shouldHydrateDeckFromQuery
} from "./utils/deckState";
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

const fallbackDeck = createDemoDeck();
const collapsedSlidesPaneWidth = 0;
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
const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const pptxImportAccept =
  ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ooxmlSyncJobEventName = "orbit:ooxml-sync-job";

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
type HistoryEntry = {
  deck: Deck;
  slideIndex: number;
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

function buildPatchBatch(
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
    throw await readResponseError(response, "Deck fetch failed");
  }

  const payload = getDeckResponseSchema.parse(await response.json());
  return payload.deck;
}

function navigateToRehearsal(projectId: string) {
  window.history.pushState({}, "", `/rehearsal/${encodeURIComponent(projectId)}`);
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
    throw await readResponseError(response, "Deck bootstrap failed");
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
      patch
    })
  });

  if (!response.ok) {
    throw await readResponseError(response, "Deck save failed");
  }

  const payload = appendDeckPatchResponseSchema.parse(await response.json()) as {
    deck: Deck;
    ooxmlSyncJob?: Job;
  };
  emitOoxmlSyncJob(payload.ooxmlSyncJob);
  return payload.deck;
}

function emitOoxmlSyncJob(job: Job | undefined) {
  if (!job || typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<Job>(ooxmlSyncJobEventName, { detail: job }));
}

async function fetchDeck(projectId: string): Promise<Deck> {
  const storedDeck = await fetchProjectDeck(projectId);

  if (storedDeck) {
    return storedDeck;
  }

  return putProjectDeck(projectId, createSeedDeck(projectId));
}

export async function createPptxImportJob(
  projectId: string,
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/pptx-imports`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId })
    }
  );

  if (!response.ok) {
    throw new Error(await readPlainError(response, "PPTX import job creation failed"));
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function waitForPptxImportJob(
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
      throw new Error(await readPlainError(response, "PPTX import job fetch failed"));
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("PPTX import job timed out.");
    }

    await delay(pollIntervalMs);
  }
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
): Promise<PptxImportJobResult> {
  const validationMessage = getPptxImportValidationMessage(file);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const fetcher = options.fetcher ?? fetch;
  options.onPhase?.("uploading");
  const uploaded = await uploadProjectAsset(projectId, file, "pptx-import", fetcher);
  options.onPhase?.("importing");
  const queuedJob = await createPptxImportJob(projectId, uploaded.fileId, fetcher);
  const job = await waitForPptxImportJob(queuedJob.jobId, fetcher, {
    pollIntervalMs: options.pollIntervalMs,
    timeoutMs: options.timeoutMs
  });

  if (job.status === "failed") {
    throw new Error(job.error?.message ?? "PPTX import failed.");
  }

  return pptxImportJobResultSchema.parse(job.result);
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

export function EditorShell(props: { projectId?: string }) {
  const projectId = props.projectId ?? demoIds.projectId;
  const queryClient = useQueryClient();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isDataViewOpen, setIsDataViewOpen] = useState(false);
  const [isAnimationPanelOpen, setIsAnimationPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isSlidesPaneCollapsed, setIsSlidesPaneCollapsed] = useState(false);
  const [slidesPaneWidth, setSlidesPaneWidth] = useState(defaultSlidesPaneWidth);
  const [animationPaneWidth, setAnimationPaneWidth] = useState(
    defaultAnimationPaneWidth
  );
  const [rightPaneWidth, setRightPaneWidth] = useState(defaultRightPaneWidth);
  const [projectPresenceUsers, setProjectPresenceUsers] = useState<ProjectPresenceUser[]>([]);
  const [isPresenceDebugOpen, setIsPresenceDebugOpen] = useState(false);
  const [isAudienceLinkModalOpen, setIsAudienceLinkModalOpen] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [isExitSaving, setIsExitSaving] = useState(false);
  const [animationPanelFocusedAnimationId, setAnimationPanelFocusedAnimationId] =
    useState<string | null>(null);
  const [lastPresenceAt, setLastPresenceAt] = useState<string | null>(null);
  const [socketErrorMessage, setSocketErrorMessage] = useState("");
  const [socketId, setSocketId] = useState("");
  const [socketStatus, setSocketStatus] = useState<EditorSocketStatus>("disconnected");
  const [sessionDebug, setSessionDebug] = useState<EditorSessionDebugState>({
    message: "세션 정보를 아직 조회하지 않았습니다.",
    status: "idle"
  });
  const [slidePanelView, setSlidePanelView] =
    useState<SlidePanelView>("thumbnail");
  const [showIds, setShowIds] = useState(false);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedKeywordOccurrenceKey, setSelectedKeywordOccurrenceKey] =
    useState<string | null>(null);
  const [isSpeakerNotesEditing, setIsSpeakerNotesEditing] = useState(false);
  const [speakerNotesDraft, setSpeakerNotesDraft] = useState("");
  const [speakerNotesDraftBase, setSpeakerNotesDraftBase] = useState("");
  const [speakerNotesEditSlideId, setSpeakerNotesEditSlideId] = useState<
    string | null
  >(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [validationHighlightElementIds, setValidationHighlightElementIds] =
    useState<string[]>([]);
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
  const [isImageUploadPending, setIsImageUploadPending] = useState(false);
  const [pptxImportState, setPptxImportState] = useState<PptxImportState>({
    status: "idle",
    warnings: [],
    qualityReport: null,
    message: ""
  });
  const [isRehearsalPreparing, setIsRehearsalPreparing] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const topbarRef = useRef<HTMLElement | null>(null);
  const shapeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pptxFileInputRef = useRef<HTMLInputElement | null>(null);
  const copiedElementRef = useRef<ElementClipboardState | null>(null);
  const editorStageRef = useRef<Konva.Stage | null>(null);
  const slideRenderStageRefs = useRef(new Map<string, Konva.Stage>());
  const undoRedoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renderingDeck, setRenderingDeck] = useState<Deck | null>(null);
  const [ooxmlSyncJob, setOoxmlSyncJob] = useState<Job | null>(null);

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

  const loadedDeck = deckQuery.data ?? fallbackDeck;
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
  const importedThumbnailRefreshKeyRef = useRef<string | null>(null);
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
    () => getEditorValidationItems(deck, currentSlide ?? undefined),
    [deck, currentSlide]
  );
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
  const currentSlideKeywordActionUsage = useMemo(
    () =>
      currentSlide
        ? deriveKeywordActionUsage(currentSlide)
        : { byKeywordId: {}, byOccurrenceId: {} },
    [currentSlide]
  );
  const currentSlideKeywordUsage = currentSlideKeywordActionUsage.byKeywordId;
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
  const isDev = import.meta.env.DEV;
  const fileMenuItems = [
    { action: "new", icon: FolderPlus, label: "새 프레젠테이션", meta: "빈 덱" },
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

    if (
      !persistedDeck ||
      !shouldRefreshImportedSlideThumbnails(persistedDeck) ||
      hasUnackedLocalChangesRef.current ||
      pendingPatchInputsRef.current.length > 0 ||
      isSaveFlushInFlightRef.current
    ) {
      return;
    }

    const refreshKey = `${persistedDeck.deckId}:${persistedDeck.version}`;
    if (importedThumbnailRefreshKeyRef.current === refreshKey) {
      return;
    }

    const slideIds = getImportedSlideThumbnailRefreshSlideIds(persistedDeck);

    if (slideIds.length === 0) {
      return;
    }

    importedThumbnailRefreshKeyRef.current = refreshKey;
    let isCancelled = false;

    setSaveState("auto-saving");
    setSaveError(null, null);

    void (async () => {
      try {
        await saveQueueRef.current.catch(() => undefined);

        if (
          isCancelled ||
          hasUnackedLocalChangesRef.current ||
          pendingPatchInputsRef.current.length > 0
        ) {
          setSaveState("auto-pending");
          return;
        }

        const renderResult = await syncSlideRenderAssets(
          persistedDeck.projectId,
          persistedDeck,
          slideIds
        );
        const thumbnailPatch = buildSlideThumbnailPatch(
          persistedDeck,
          renderResult.deck
        );

        if (!thumbnailPatch || isCancelled) {
          setSaveState("auto-saved");
          return;
        }

        if (
          !shouldApplyManualSaveResult({
            snapshotDeck: persistedDeck,
            currentDeck: workingDeckRef.current
          })
        ) {
          setSaveState("auto-pending");
          return;
        }

        const finalDeck = await appendProjectDeckPatch(
          persistedDeck.projectId,
          thumbnailPatch
        );

        if (isCancelled) {
          return;
        }

        queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
          mergeDeckIntoQueryCache(current, finalDeck)
        );

        if (
          shouldApplyManualSaveResult({
            snapshotDeck: persistedDeck,
            currentDeck: workingDeckRef.current
          })
        ) {
          applyPersistedDeck(finalDeck);
          setLastSavedAt(new Date().toISOString());
          setLastPatchLabel(`썸네일 갱신 · v${finalDeck.version}`);
          setSaveState("auto-saved");
          setSaveError(null, null);
          return;
        }

        persistedBaseDeckRef.current = finalDeck;
        lastAckedDeckRef.current = finalDeck;
        hasHydratedPersistedBaseRef.current = true;
        setSaveState("auto-pending");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setLastPatchLabel(`썸네일 갱신 실패 · ${toEditorErrorMessage(error)}`);
        setSaveState("error");
        setSaveError("manual-render-failed", toEditorErrorMessage(error));
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [deckQuery.data, projectId, queryClient]);

  useEffect(() => {
    if (!deckQuery.data?.projectId) {
      return;
    }

    resolvedUploadProjectIdRef.current = deckQuery.data.projectId;
  }, [deckQuery.data]);

  function handleAiSuggestionApplied(response: ApplyAiSuggestionResponse) {
    queryClient.setQueryData(["deck", projectId], response.deck);
    markHydratedPersistedDeck(response.deck, setDeck);
    setLastSavedAt(response.changeRecord.createdAt);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setElementContextMenu(null);
    setLastPatchLabel(
      `${response.changeRecord.operations[0]?.type ?? "ai suggestion"} · v${response.deck.version}`
    );
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

  async function syncSlideRenderAssets(
    activeProjectId: string,
    sourceDeck: Deck,
    slideIds?: readonly string[]
  ) {
    if (sourceDeck.slides.length === 0) {
      return {
        deck: sourceDeck,
        missingAssetCount: 0,
      };
    }

    const nextDeck = structuredClone(normalizeDeckAssetUrls(sourceDeck));
    const targetSlideIds = slideIds ? new Set(slideIds) : null;
    if (targetSlideIds?.size === 0) {
      return {
        deck: nextDeck,
        missingAssetCount: 0,
      };
    }

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
        if (targetSlideIds && !targetSlideIds.has(slide.slideId)) {
          continue;
        }

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
      await saveQueueRef.current.catch(() => undefined);
      while (pendingPatchInputsRef.current.length > 0) {
        await flushPendingSaveBatch();
      }

      const persistedDeck = persistedBaseDeckRef.current ?? deckQuery.data;
      if (!persistedDeck) {
        throw withSaveErrorCode(
          new Error("최신 저장 상태를 찾지 못했습니다. 다시 불러온 뒤 저장해 주세요."),
          "missing-persisted-base"
        );
      }

      setLastSavedAt(new Date().toISOString());

      try {
        const renderResult = await syncSlideRenderAssets(
          activeProjectId,
          persistedDeck
        );

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

        const thumbnailPatch = buildSlideThumbnailPatch(
          persistedDeck,
          renderResult.deck
        );
        const finalDeck = thumbnailPatch
          ? await appendProjectDeckPatch(activeProjectId, thumbnailPatch)
          : persistedDeck;
        setLastSavedAt(new Date().toISOString());

        queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
          mergeDeckIntoQueryCache(current, finalDeck)
        );

        if (
          shouldApplyManualSaveResult({
            snapshotDeck: persistedDeck,
            currentDeck: workingDeckRef.current
          })
        ) {
          applyPersistedDeck(finalDeck);
        } else {
          persistedBaseDeckRef.current = finalDeck;
          lastAckedDeckRef.current = finalDeck;
          hasHydratedPersistedBaseRef.current = true;
          setSaveState("auto-pending");
          return false;
        }

        setLastPatchLabel(`수동 저장 · v${finalDeck.version}`);
        setSaveState("manual-saved");
        setSaveError(null, null);
        return true;
      } catch (renderError) {
        setLastPatchLabel(`수동 저장 · 렌더 실패 · v${persistedDeck.version}`);
        setSaveState("error");
        setSaveError("manual-render-failed", toEditorErrorMessage(renderError));
        return false;
      }
    } catch (error) {
      setLastPatchLabel(`저장 실패 · ${toEditorErrorMessage(error)}`);
      setSaveState("error");
      setSaveError("auto-save-failed", toEditorErrorMessage(error));
      void deckQuery.refetch();
      return false;
    }
  }

  async function handleStartRehearsal() {
    const activeProjectId = deckQuery.data?.projectId ?? projectId;

    if (isDeckLoading || !deckQuery.data) {
      setSaveState("auto-pending");
      setSaveError("rehearsal-blocked", "발표 자료를 불러온 뒤 리허설을 시작할 수 있습니다.");
      return;
    }

    if (isRehearsalPreparing) {
      return;
    }

    if (!activeProjectId) {
      setSaveState("error");
      setSaveError("missing-project", "저장할 프로젝트를 찾지 못했습니다.");
      return;
    }

    if (!commitSpeakerNotesDraftIfDirty()) {
      return;
    }

    setIsRehearsalPreparing(true);
    setSaveState("manual-saving");
    setSaveError(null, null);
    setActiveTopMenu(null);

    try {
      await saveQueueRef.current.catch(() => undefined);
      while (pendingPatchInputsRef.current.length > 0) {
        await flushPendingSaveBatch();
      }

      const persistedDeck = persistedBaseDeckRef.current ?? deckQuery.data;
      if (!persistedDeck) {
        throw withSaveErrorCode(
          new Error("최신 저장 상태를 찾지 못했습니다. 다시 불러온 뒤 저장해 주세요."),
          "missing-persisted-base"
        );
      }

      const renderResult = await syncSlideRenderAssets(activeProjectId, persistedDeck);
      setLastSavedAt(new Date().toISOString());

      if (
        !shouldApplyManualSaveResult({
          snapshotDeck: persistedDeck,
          currentDeck: workingDeckRef.current
        })
      ) {
        throw new Error("리허설 준비 중 편집 내용이 변경되었습니다. 다시 시작해 주세요.");
      }

      const thumbnailPatch = buildSlideThumbnailPatch(persistedDeck, renderResult.deck);
      const finalDeck = thumbnailPatch
        ? await appendProjectDeckPatch(activeProjectId, thumbnailPatch)
        : persistedDeck;

      applyPersistedDeck(finalDeck);
      setLastSavedAt(new Date().toISOString());
      setLastPatchLabel(`리허설 준비 완료 · v${finalDeck.version}`);
      setSaveState("manual-saved");
      setSaveError(null, null);
      navigateToRehearsal(activeProjectId);
    } catch (error) {
      const message = toEditorErrorMessage(error);

      setLastPatchLabel(`리허설 준비 실패 · ${message}`);
      setSaveState("error");
      setSaveError("rehearsal-save-failed", message);
    } finally {
      setIsRehearsalPreparing(false);
    }
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
        persistedDeck = await appendProjectDeckPatch(activeProjectId, buildResult.patch);
      } catch (error) {
        if (!isDeckRequestErrorWithCode(error, "STALE_BASE_VERSION")) {
          throw error;
        }

        const latestDeck = await fetchProjectDeck(activeProjectId);

        if (!latestDeck) {
          throw new Error("최신 저장 상태를 다시 불러오지 못했습니다. 다시 시도해 주세요.");
        }

        recoveredConflict = true;
        persistedBaseDeckRef.current = latestDeck;
        buildResult = buildPatchBatch(latestDeck, batchInputs);
        persistedDeck = await appendProjectDeckPatch(activeProjectId, buildResult.patch);
      }

      let finalPersistedDeck = persistedDeck;
      const thumbnailSlideIds = getPatchThumbnailRefreshSlideIds(
        persistedDeck,
        buildResult.patch
      );
      let thumbnailRefreshFailed = false;

      if (
        thumbnailSlideIds.length > 0 &&
        shouldApplyManualSaveResult({
          snapshotDeck: persistedDeck,
          currentDeck: workingDeckRef.current
        })
      ) {
        try {
          const renderResult = await syncSlideRenderAssets(
            activeProjectId,
            persistedDeck,
            thumbnailSlideIds
          );
          const thumbnailPatch = buildSlideThumbnailPatch(
            persistedDeck,
            renderResult.deck
          );

          if (
            thumbnailPatch &&
            shouldApplyManualSaveResult({
              snapshotDeck: persistedDeck,
              currentDeck: workingDeckRef.current
            })
          ) {
            finalPersistedDeck = await appendProjectDeckPatch(
              activeProjectId,
              thumbnailPatch
            );
          }
        } catch (thumbnailError) {
          thumbnailRefreshFailed = true;
          setLastPatchLabel(`썸네일 저장 실패 · ${toEditorErrorMessage(thumbnailError)}`);
          setSaveState("error");
          setSaveError("manual-render-failed", toEditorErrorMessage(thumbnailError));
        }
      }

      persistedBaseDeckRef.current = finalPersistedDeck;
      setLastSavedAt(new Date().toISOString());

      queryClient.setQueryData(["deck", projectId], (current?: Deck) =>
        mergeDeckIntoQueryCache(current, finalPersistedDeck)
      );

      if (
        shouldApplyManualSaveResult({
          snapshotDeck: persistedDeck,
          currentDeck: workingDeckRef.current
        })
      ) {
        applyAckedPersistedDeck(finalPersistedDeck);
        if (!thumbnailRefreshFailed) {
          setSaveState(recoveredConflict ? "conflict-recovered" : "auto-saved");
          setSaveError(null, null);
        }
      }
    } catch (error) {
      if (recoveredConflict && error instanceof Error) {
        withSaveErrorCode(error, "conflict-recovery-failed");
      }
      pendingPatchInputsRef.current = [...batchInputs, ...pendingPatchInputsRef.current];
      throw error;
    }
  }

  function scheduleUndoRedoPersist(label: string) {
    if (undoRedoPersistTimerRef.current) {
      clearTimeout(undoRedoPersistTimerRef.current);
    }

    pendingPatchInputsRef.current = [];
    setSaveState("auto-pending");
    setSaveError(null, null);
    undoRedoPersistTimerRef.current = setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const activeProjectId = deckQuery.data?.projectId ?? workingDeckRef.current.projectId;

          if (!activeProjectId) {
            throw withSaveErrorCode(
              new Error("저장할 프로젝트를 찾지 못했습니다."),
              "missing-project"
            );
          }

          setSaveState("auto-saving");
          const snapshotDeck = structuredClone(
            normalizeDeckAssetUrls(workingDeckRef.current)
          );
          const persistedDeck = await putProjectDeck(activeProjectId, snapshotDeck);
          applyPersistedDeck(persistedDeck);
          setLastSavedAt(new Date().toISOString());
          setSaveState("auto-saved");
          setSaveError(null, null);
          setLastPatchLabel(`${label} · v${persistedDeck.version}`);
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
          undoRedoPersistTimerRef.current = null;
        });
    }, 2000);
  }

  function commitPatch(
    patchInput: DeckPatch | PatchProducer,
    baseDeck: Deck = workingDeckRef.current
  ) {
    const patch = resolvePatchInput(baseDeck, patchInput);
    const result = applyDeckPatch(baseDeck, patch);

    if (!result.ok) {
      setLastPatchLabel(`실패 · ${result.error.code}`);
      return;
    }

    applyOptimisticWorkingDeck(result.deck);
    setSaveState("auto-pending");
    setSaveError(null, null);
    setUndoStack((current) => [
      ...current.slice(-49),
      { deck: baseDeck, slideIndex: currentSlideIndex }
    ]);
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
    if (undoStack.length === 0 || !confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    setUndoStack((current) => {
      const previous = current.at(-1);
      if (!previous) {
        return current;
      }
      const currentEntry = {
        deck: workingDeckRef.current,
        slideIndex: currentSlideIndex
      };
      const previousSlideIndex = Math.max(
        0,
        Math.min(previous.slideIndex, previous.deck.slides.length - 1)
      );
      resetSpeakerNotesEditState(
        previous.deck.slides[previousSlideIndex]?.speakerNotes ?? ""
      );
      replaceWorkingDeck(previous.deck);
      setRedoStack((redoCurrent) => [...redoCurrent, currentEntry]);
      setDeck(previous.deck);
      setCurrentSlideIndex(previousSlideIndex);
      setSelectedElementIds([]);
      clearSelectedKeyword();
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setElementContextMenu(null);
      queryClient.setQueryData(["deck", projectId], (currentDeck?: Deck) =>
        mergeDeckIntoQueryCache(currentDeck, previous.deck)
      );
      setLastPatchLabel(`undo · v${previous.deck.version}`);
      scheduleUndoRedoPersist("undo");
      return current.slice(0, -1);
    });
  }

  function handleRedo() {
    if (redoStack.length === 0 || !confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    setRedoStack((current) => {
      const next = current.at(-1);
      if (!next) {
        return current;
      }
      const nextSlideIndex = Math.max(
        0,
        Math.min(next.slideIndex, next.deck.slides.length - 1)
      );
      resetSpeakerNotesEditState(
        next.deck.slides[nextSlideIndex]?.speakerNotes ?? ""
      );
      setUndoStack((undoCurrent) => [
        ...undoCurrent.slice(-49),
        {
          deck: workingDeckRef.current,
          slideIndex: currentSlideIndex
        }
      ]);
      replaceWorkingDeck(next.deck);
      setDeck(next.deck);
      setCurrentSlideIndex(nextSlideIndex);
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
      return current.slice(0, -1);
    });
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

  function handleSelectSlideIndex(index: number) {
    if (index === currentSlideIndex) {
      return;
    }

    if (!confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    resetSpeakerNotesEditState(deck.slides[index]?.speakerNotes ?? "");
    setCurrentSlideIndex(index);
  }

  function handleStartSpeakerNotesEdit() {
    const currentNotes = currentSlide?.speakerNotes ?? "";
    clearSelectedKeyword();
    setSpeakerNotesDraft(currentNotes);
    setSpeakerNotesDraftBase(currentNotes);
    setSpeakerNotesEditSlideId(currentSlide?.slideId ?? null);
    setIsSpeakerNotesEditing(true);
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
    if (!currentSlide) {
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
    if (isImageUploadPending) {
      return;
    }

    setElementContextMenu(null);
    imageUploadTargetRef.current = target;
    imageFileInputRef.current?.click();
  }

  function openPptxFilePicker() {
    if (pptxImportState.status === "uploading" || pptxImportState.status === "importing") {
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
        handleSelectSlideIndex(targetSlideIndex);
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
        handleSelectSlideIndex(targetSlideIndex);
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
      const importResult = await uploadAndImportPptxTemplate(activeProjectId, file, {
        onPhase: (phase) =>
          setPptxImportState({
            status: phase,
            warnings: [],
            qualityReport: null,
            message: phase === "uploading" ? "PPTX 업로드 중..." : "PPTX 변환 중..."
          })
      });
      const refetchResult = await deckQuery.refetch();
      const importedDeck = refetchResult.data;

      if (importedDeck) {
        queryClient.setQueryData(["deck", projectId], importedDeck);
        markHydratedPersistedDeck(importedDeck, setDeck);
        setCurrentSlideIndex(0);
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
      }

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
    const [file] = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (!file) {
      return;
    }

    void handlePptxFileSelection(file);
  }

  function handleAddTextElement() {
    if (!currentSlide) {
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
    if (!currentSlide) {
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

    commitPatch((currentDeck) =>
      createAddElementPatch(currentDeck, currentSlide.slideId, nextElement)
    );
    setSelectedElementIds([elementId]);
    setInsertTool("select");
    setIsShapeMenuOpen(false);
  }

  function handleAddSlide() {
    if (!confirmDiscardSpeakerNotesDraft()) {
      return;
    }

    const slideId = createSlideId(deck);
    const nextOrder = deck.slides.length + 1;
    resetSpeakerNotesEditState("");
    commitPatch((currentDeck) =>
      createAddSlidePatch(currentDeck, {
        slideId,
        order: currentDeck.slides.length + 1,
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
    if (!currentSlide) {
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
    if (!currentSlide || nodes.length < 2) {
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

    if (!currentSlide || currentSlide.slideId !== speakerNotesEditSlideId) {
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
          <div className="menu-stack">
            <div className="menu-row">
              <button
                aria-label="홈으로 이동"
                className="top-icon-button"
                title="홈으로 이동"
                type="button"
                onClick={handleExitToHome}
              >
                <Home size={15} />
              </button>
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
        </div>

        <div className="top-actions">
          {projectPresenceUsers.length > 0 ? (
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
          <EditorSaveControl
            disabled={isDeckLoading || isUsingFallbackDeck}
            emptyStateLabel={deckQuery.data ? "불러온 파일" : "저장 기록 없음"}
            isSaving={isSaveInFlight(saveState)}
            lastSavedAtLabel={formatLastSavedAtLabel(lastSavedAt)}
            onSave={() => void handleSaveDeck()}
            recoveryHint={saveErrorMessage ? getSaveRecoveryHint(saveErrorCode) : null}
            statusLabel={saveStatusLabel}
          />
          {ooxmlSyncStatus ? (
            <span
              className={`ooxml-sync-pill ${ooxmlSyncStatus.kind}`}
              title={ooxmlSyncStatus.detail}
            >
              {ooxmlSyncStatus.label}
            </span>
          ) : null}
          <PresentationMenu
            canStartRehearsal={canStartRehearsal}
            isOpen={activeTopMenu === "presentation"}
            isRehearsalPreparing={isRehearsalPreparing}
            onOpenAudienceLink={() => {
              setIsAudienceLinkModalOpen(true);
              setActiveTopMenu(null);
            }}
            onStartRehearsal={() => void handleStartRehearsal()}
            onToggle={() =>
              setActiveTopMenu((current) =>
                current === "presentation" ? null : "presentation"
              )
            }
          />
          <button
            className="share-top-button"
            type="button"
            aria-expanded={isSharePanelOpen}
            aria-haspopup="dialog"
            disabled={!canManageShare || isSharePermissionLoading}
            title={
              canManageShare
                ? "프로젝트 공유"
                : "프로젝트 owner만 공유 설정을 변경할 수 있습니다."
            }
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
      {isSharePanelOpen
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
              onDiscard={handleDiscardAndExit}
              onSaveAndExit={() => {
                void handleSaveAndExit();
              }}
            />,
            document.body
          )
        : null}
      {isPresenceDebugOpen
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
        className={`editor-panel ${isAnimationPanelOpen ? "animation-panel-open" : ""} ${
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
                  onClick={() => handleSelectSlideIndex(index)}
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
                    onClick={() => handleSelectSlideIndex(index)}
                  >
                    <span className="slide-number">{index + 1}</span>
                    {showIds ? <IdBadge id={slide.slideId} /> : null}
                    <span
                      className="slide-thumb orbit-thumb"
                      style={{
                        background: buildSlideThumbBackground(slide, deck)
                      }}
                    />
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

        {isAnimationPanelOpen ? (
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
            <div className="editor-toolbar">
              <div className="tool-group">
                <button
                  className="icon-button history-nav-button"
                  disabled={undoStack.length === 0}
                  type="button"
                  title="Undo"
                  onClick={handleUndo}
                >
                  <HistoryChevronIcon className="history-nav-icon" direction="left" />
                </button>
                <button
                  className="icon-button history-nav-button"
                  disabled={redoStack.length === 0}
                  type="button"
                  title="Redo"
                  onClick={handleRedo}
                >
                  <HistoryChevronIcon className="history-nav-icon" direction="right" />
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
                <button
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
                  애니메이션
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
              </div>
            </div>

            <SelectionQuickBar
              animations={selectedElementAnimations}
              animationDiagnostics={
                currentSlideAnimationDiagnostics ?? {
                  danglingAnimations: [],
                  duplicateOrders: [],
                  selectedElementEmpty: false
                }
              }
              canCreateAnimation={Boolean(currentSlide && selectedElement)}
              canvas={deck.canvas}
              key={`quickbar-${selectedElement?.elementId ?? currentSlide?.slideId ?? "none"}`}
              customShapeEditActive={isCustomShapeEditingSelection}
              element={selectedElement}
              selectedKeywordLabel={selectedKeyword?.text ?? null}
              slide={selectedElementIds.length > 1 ? null : currentSlide}
              showIds={showIds}
              theme={deck.theme}
              onOpenAnimationEditor={openAnimationInspector}
              onDeleteAnimation={(animationId) => {
                if (!currentSlide) {
                  return;
                }

                handleDeleteAnimation(currentSlide.slideId, animationId);
              }}
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
              onChangeTheme={handleThemeChange}
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
                    disableInteractions={isPlayingCurrentSlideAnimations}
                    editingElementId={editingElementId}
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

            <section className="script-panel">
              <div className="script-panel-header">
                <div>
                  <strong>발표 메모</strong>
                  <span>
                    {currentSlide && showIds ? (
                      <IdBadge id={currentSlide.slideId} />
                    ) : (
                      currentSlide?.title || `슬라이드 ${currentSlideIndex + 1}`
                    )}
                  </span>
                </div>
                {isSpeakerNotesEditing ? (
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
                ) : (
                  <button
                    className="script-panel-action"
                    type="button"
                    onClick={handleStartSpeakerNotesEdit}
                  >
                    수정
                  </button>
                )}
              </div>
              {isSpeakerNotesEditing ? (
                <textarea
                  className="script-notes-editor"
                  aria-label="발표 메모 수정"
                  value={speakerNotesDraft}
                  onChange={(event) => setSpeakerNotesDraft(event.target.value)}
                />
              ) : (
                <>
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
                  <KeywordList
                    keywords={currentSlide?.keywords ?? []}
                    selectedKeywordId={selectedKeywordId}
                    showIds={showIds}
                    usageByKeywordId={currentSlideKeywordUsage}
                    onSelectKeyword={handleSelectKeyword}
                  />
                  {selectedKeyword ? (
                    <KeywordDetail
                      keyword={selectedKeyword}
                      requiredActive={selectedKeywordRequiredActive}
                      showIds={showIds}
                      usage={selectedKeywordUsage}
                      onClearSelection={clearSelectedKeyword}
                      onDeleteKeyword={() => {
                        if (!currentSlide) {
                          return;
                        }

                        handleDeleteSelectedKeyword(
                          currentSlide.slideId,
                          selectedKeyword.keywordId
                        );
                      }}
                      onToggleAdvanceSlide={() => {
                        if (!currentSlide) {
                          return;
                        }

                        handleToggleAdvanceSlideKeyword(
                          currentSlide.slideId,
                          selectedKeyword.keywordId,
                          !(
                            selectedKeywordUsage?.advancesSlide ?? false
                          )
                        );
                      }}
                      onToggleRequired={() => {
                        if (!currentSlide) {
                          return;
                        }

                        handleToggleKeywordRequired(
                          currentSlide.slideId,
                          selectedKeyword.keywordId,
                          selectedKeywordOccurrenceKey
                        );
                      }}
                    />
                  ) : null}
                </>
              )}
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
                <PptxImportQualityPanel state={pptxImportState} />
                <ValidationPanel
                  items={editorValidationItems}
                  onHighlightElementIds={setValidationHighlightElementIds}
                />
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
      <div data-testid="editor-animations-debug" hidden>
        {JSON.stringify(currentSlide?.animations ?? [])}
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

function buildSlideThumbBackground(slide: Slide, deck: Deck) {
  const background = slide.style.backgroundColor ?? deck.theme.backgroundColor;

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
    return "오프라인 데모";
  }

  if (props.isUsingFallbackDeck) {
    return "로컬 데모";
  }

  if (props.saveState === "error") {
    return "저장 실패";
  }

  if (props.saveState === "manual-saving") {
    return "수동 저장 중";
  }

  if (props.saveState === "manual-saved") {
    return "수동 저장됨";
  }

  if (props.saveState === "auto-saving") {
    return "자동 저장 중";
  }

  if (props.saveState === "auto-pending") {
    return "저장 대기 중";
  }

  if (props.saveState === "conflict-recovered") {
    return "충돌 복구 후 저장됨";
  }

  return "저장됨";
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
      return "리허설 다시 시작";
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
