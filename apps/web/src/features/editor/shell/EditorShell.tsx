import {
  createDemoDeck,
  createDuplicateSlidePatch,
  createElementOrderPatch,
  getElementAnimations,
  deriveKeywordActionUsage,
  validateSlideAnimations
} from "../../../../../../packages/editor-core/src/index";
import { demoIds } from "@orbit/shared";
import type { Job } from "../../../../../../packages/shared/src/jobs/job.schema";
import { getRenderableSlideElements } from "../canvas/EditorCanvas";
import {
  applyCanvasSelection,
  type CanvasSelectionModifiers,
  getSelectableCanvasElements
} from "../canvas/utils/canvasSelection";
import type { EditorEscapeLayer } from "./editorKeyboardCommands";
import {
  AnimationSidePanel,
  buildAnimationKeywordTriggerPolicy,
  maxAnimationPaneWidth,
  minAnimationPaneWidth,
  toAnimationKeywordTriggerOptions,
  useEditorAnimationPreview
} from "./components/animation";
import { EditorDebugPanels } from "./components/EditorDebugPanels";
import { EditorTopbar } from "./components/EditorTopbar";
import { createInitialAiChatState } from "./components/AiChatPanel";
import { EditorSelectionProperties } from "./components/EditorSelectionProperties";
import type { SaveErrorCode, SaveState } from "./hooks/useEditorPersistenceState";
import { useProjectShareAccess } from "./hooks/useProjectShareAccess";
import { useEditorShellUiStore } from "./editorShellUiStore";
import { beginHorizontalPaneResize } from "./utils/beginHorizontalPaneResize";
export { EditorStateNotice } from "./components/EditorStateNotice";
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
export { getEditorValidationItems } from "../ai/quality/editorValidation";
export {
  appendAppliedDesignProposalHistory,
  resolveHistoryNavigation,
  type HistoryEntry
} from "./utils/editorHistory";
export {
  danglingKeywordOccurrenceSaveMessage,
  getSpeakerNotesDanglingOccurrenceSaveBlock,
  shouldPromptSpeakerNotesDraftDiscard,
  shouldPromptSpeakerNotesOverwrite
} from "./utils/speakerNotesDraft";
export {
  getGroupedChildPreviewFrame,
  getImageElementLayout,
  getResponsiveEditorStageScale
} from "./utils/editorLayout";
export { useLoadedImage } from "./hooks/useLoadedImage";
import type {
  ApplyDesignAgentProposalResponse,
  Deck,
  DeckAnimation,
  SemanticCue
} from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import type Konva from "konva";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProjectReadOnlyBanner, useProjectAccess } from "../../projects/ProjectAccessContext";
import {
  fetchPresentationBrief,
  presentationBriefQueryKey
} from "../../coaching/presentationBriefApi";
import { PresentationJourneyPanel } from "../outcome/components/PresentationJourneyPanel";
import {
  createPresentationJourneyViewModel,
  type PresentationJourneyAction,
  type PresentationJourneySaveState
} from "../outcome/presentationJourney";
import { getEditorValidationItems } from "../ai/quality/editorValidation";
import { createSafeTextOverflowRepair } from "../ai/quality/safeTextOverflowRepair";
import {
  presentEditorValidationItems,
  type EditorValidationTargetView
} from "../ai/quality/validationPresentation";
import { type SemanticCueExtractionUiState } from "../semantic-cues/SemanticCueReviewPanel";
import { createSemanticCueReviewPatch } from "../semantic-cues/semanticCueReviewModel";
import { SpeakerNotesAssistantDialog } from "./components/SpeakerNotesAssistantDialog";
import { SpeakerNotesPanel } from "./components/SpeakerNotesPanel";
import { SlideNavigatorPane } from "./components/SlideNavigatorPane";
import { EditorContextMenus } from "./components/EditorContextMenus";
import { EditorModals } from "./components/EditorModals";
import { EditorCanvasStage } from "./components/EditorCanvasStage";
import { EditorToolbar } from "./components/EditorToolbar";
import { EditorZoomControl } from "./components/EditorZoomControl";
import { SelectionInspector } from "./components/SelectionInspector";
import {
  EditorRightPanel,
  type AiPanelView,
  type RightPanelView
} from "./components/EditorRightPanel";
import {
  fetchDeck,
  flushEditorPersistenceBeforeManualAction,
  resolvePatchInput
} from "./api/deckPersistenceApi";
import { resolveOoxmlEditCapability, resolveOoxmlPatchCapability } from "./editorOoxmlCapabilities";
import {
  createSemanticCueExtractionJob,
  waitForSemanticCueExtractionJob
} from "./api/editorJobApi";
import { fetchHealth } from "./api/editorSessionApi";
import { useProjectPresence } from "./hooks/useProjectPresence";
import { useEditorViewport } from "./hooks/useEditorViewport";
import { useSlideRenderPipeline } from "./hooks/useSlideRenderPipeline";
import { useEditorKeyboardShortcuts } from "./hooks/useEditorKeyboardShortcuts";
import { useOoxmlSyncJob } from "./hooks/useOoxmlSyncJob";
import { useSpeakerNotesEditor } from "./hooks/useSpeakerNotesEditor";
import {
  canAcceptCanvasImageDrop,
  getImageReplaceCapability,
  useEditorFileTransfer
} from "./hooks/useEditorFileTransfer";
import { useEditorDocumentController } from "./hooks/useEditorDocumentController";
import {
  resolveEditorAddElementCapabilities,
  resolveGroupCreationCapability,
  useEditorCanvasCommands
} from "./hooks/useEditorCanvasCommands";
import {
  minSpeakerNotesPanelHeight,
  useSpeakerNotesPanelLayout
} from "./hooks/useSpeakerNotesPanelLayout";
import { useEditorSlideCommands } from "./hooks/useEditorSlideCommands";
import { useEditorPresentationActions } from "./hooks/useEditorPresentationActions";
import { useShapeMenuPlacement } from "./hooks/useShapeMenuPlacement";
import { maximumManualEditorZoom, minimumManualEditorZoom } from "./editorZoom";
import { resolveSelectedSlideIdAfterDelete } from "./slideRailModel";
import { createSelectionNudgePatch } from "./utils/selectionNudge";
import {
  createSelectionInspectorModel,
  resolveSelectionInspectorCompactMode
} from "./selectionInspectorModel";
export {
  applyDeckPatchAcknowledgement,
  buildPatchBatch,
  consumeScheduledUndoRedoPersistLabel,
  flushEditorPersistenceBeforeManualAction,
  parseDeckPatchPersistenceResponse,
  putProjectDeck
} from "./api/deckPersistenceApi";
export {
  createDeckExportJob,
  createPptxOoxmlGenerationJob,
  createSemanticCueExtractionJob,
  exportDeckToPptx,
  importPptxIntoEditor,
  requireMatchingPptxImportedDeck,
  uploadAndImportPptxTemplate,
  waitForDeckExportJob,
  waitForPptxOoxmlGenerationJob,
  waitForSemanticCueExtractionJob
} from "./api/editorJobApi";
import {
  editorImageAccept,
  pptxImportAccept,
  toEditorErrorMessage
} from "./utils/editorFileValidation";
import type { PptxImportState } from "./components/PptxImportQualityPanel";
import "../editor-shell.css";

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
const minSlidesPaneWidth = 132;

const maxSlidesPaneWidth = 280;
const collapsedRightPaneWidth = 52;
const minRightPaneWidth = 260;
const maxRightPaneWidth = 560;

function navigateToHome() {
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createSlideRailReorderPatch(deck: Deck, orderedSlideIds: readonly string[]) {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user" as const,
    operations: [
      {
        type: "reorder_slides" as const,
        slideOrders: orderedSlideIds.map((slideId, index) => ({
          slideId,
          order: index + 1
        }))
      }
    ]
  };
}

function getAddedSlideId(patch: ReturnType<typeof createDuplicateSlidePatch>) {
  const operation = patch.operations.find((candidate) => candidate.type === "add_slide");
  return operation?.type === "add_slide" ? operation.slide.slideId : null;
}

function toPresentationJourneySaveState(saveState: SaveState): PresentationJourneySaveState {
  if (saveState === "error") return "error";
  if (saveState === "conflict-recovered") return "conflict";
  if (saveState === "auto-saving" || saveState === "manual-saving") return "saving";
  if (saveState === "auto-pending" || saveState === "idle") return "pending";
  return "saved";
}

export function EditorShell(props: { projectId?: string }) {
  const projectId = props.projectId ?? demoIds.projectId;
  const { capabilities } = useProjectAccess(projectId);
  const canMutateDeck = capabilities.canMutateDeck;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const resetProjectUiState = useEditorShellUiStore((state) => state.resetProjectUiState);
  const isDataViewOpen = useEditorShellUiStore((state) => state.isDataViewOpen);
  const setIsDataViewOpen = useEditorShellUiStore((state) => state.setIsDataViewOpen);
  const isAnimationPanelOpen = useEditorShellUiStore((state) => state.isAnimationPanelOpen);
  const setIsAnimationPanelOpen = useEditorShellUiStore((state) => state.setIsAnimationPanelOpen);
  const isRightPanelOpen = useEditorShellUiStore((state) => state.isRightPanelOpen);
  const setIsRightPanelOpen = useEditorShellUiStore((state) => state.setIsRightPanelOpen);
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("ai");
  const [presentationJourneyBusy, setPresentationJourneyBusy] = useState(false);
  const [presentationJourneyStatus, setPresentationJourneyStatus] = useState("");
  const presentationJourneyBusyRef = useRef(false);
  const [aiPanelView, setAiPanelView] = useState<AiPanelView>("chat");
  const [aiChatState, setAiChatState] = useState(() => createInitialAiChatState(projectId));
  const isSlidesPaneCollapsed = useEditorShellUiStore((state) => state.isSlidesPaneCollapsed);
  const setIsSlidesPaneCollapsed = useEditorShellUiStore((state) => state.setIsSlidesPaneCollapsed);
  const slidesPaneWidth = useEditorShellUiStore((state) => state.slidesPaneWidth);
  const setSlidesPaneWidth = useEditorShellUiStore((state) => state.setSlidesPaneWidth);
  const animationPaneWidth = useEditorShellUiStore((state) => state.animationPaneWidth);
  const setAnimationPaneWidth = useEditorShellUiStore((state) => state.setAnimationPaneWidth);
  const rightPaneWidth = useEditorShellUiStore((state) => state.rightPaneWidth);
  const setRightPaneWidth = useEditorShellUiStore((state) => state.setRightPaneWidth);
  const isPresenceDebugOpen = useEditorShellUiStore((state) => state.isPresenceDebugOpen);
  const setIsPresenceDebugOpen = useEditorShellUiStore((state) => state.setIsPresenceDebugOpen);
  const isAudienceLinkModalOpen = useEditorShellUiStore((state) => state.isAudienceLinkModalOpen);
  const setIsAudienceLinkModalOpen = useEditorShellUiStore(
    (state) => state.setIsAudienceLinkModalOpen
  );
  const isExitConfirmOpen = useEditorShellUiStore((state) => state.isExitConfirmOpen);
  const setIsExitConfirmOpen = useEditorShellUiStore((state) => state.setIsExitConfirmOpen);
  const [isExitSaving, setIsExitSaving] = useState(false);
  const animationPanelFocusedAnimationId = useEditorShellUiStore(
    (state) => state.animationPanelFocusedAnimationId
  );
  const setAnimationPanelFocusedAnimationId = useEditorShellUiStore(
    (state) => state.setAnimationPanelFocusedAnimationId
  );
  const {
    lastPresenceAt,
    sessionDebug,
    socketErrorMessage,
    socketId,
    socketStatus,
    users: projectPresenceUsers
  } = useProjectPresence({ isDebugOpen: isPresenceDebugOpen, projectId });
  const slidePanelView = useEditorShellUiStore((state) => state.slidePanelView);
  const setSlidePanelView = useEditorShellUiStore((state) => state.setSlidePanelView);
  const showIds = useEditorShellUiStore((state) => state.showIds);
  const selectedKeywordId = useEditorShellUiStore((state) => state.selectedKeywordId);
  const setSelectedKeywordId = useEditorShellUiStore((state) => state.setSelectedKeywordId);
  const selectedKeywordOccurrenceKey = useEditorShellUiStore(
    (state) => state.selectedKeywordOccurrenceKey
  );
  const setSelectedKeywordOccurrenceKey = useEditorShellUiStore(
    (state) => state.setSelectedKeywordOccurrenceKey
  );
  const selectedElementIds = useEditorShellUiStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useEditorShellUiStore((state) => state.setSelectedElementIds);
  const [validationHighlightElementIds, setValidationHighlightElementIds] = useState<string[]>([]);
  const [validationRepairStatus, setValidationRepairStatus] = useState("");
  const activeTopMenu = useEditorShellUiStore((state) => state.activeTopMenu);
  const setActiveTopMenu = useEditorShellUiStore((state) => state.setActiveTopMenu);
  const insertTool = useEditorShellUiStore((state) => state.insertTool);
  const setInsertTool = useEditorShellUiStore((state) => state.setInsertTool);
  const editingElementId = useEditorShellUiStore((state) => state.editingElementId);
  const setEditingElementId = useEditorShellUiStore((state) => state.setEditingElementId);
  const [imageCropElementId, setImageCropElementId] = useState<string | null>(null);
  const customShapeEditElementId = useEditorShellUiStore((state) => state.customShapeEditElementId);
  const setCustomShapeEditElementId = useEditorShellUiStore(
    (state) => state.setCustomShapeEditElementId
  );
  const isShapeMenuOpen = useEditorShellUiStore((state) => state.isShapeMenuOpen);
  const setIsShapeMenuOpen = useEditorShellUiStore((state) => state.setIsShapeMenuOpen);
  const shapeMenuPosition = useEditorShellUiStore((state) => state.shapeMenuPosition);
  const setShapeMenuPosition = useEditorShellUiStore((state) => state.setShapeMenuPosition);
  const shapeMenuButtonRef = useShapeMenuPlacement({
    isOpen: isShapeMenuOpen,
    setIsOpen: setIsShapeMenuOpen,
    setPosition: setShapeMenuPosition
  });
  const elementContextMenu = useEditorShellUiStore((state) => state.elementContextMenu);
  const setElementContextMenu = useEditorShellUiStore((state) => state.setElementContextMenu);
  const [semanticCueExtractionState, setSemanticCueExtractionState] =
    useState<SemanticCueExtractionUiState>({ status: "idle", message: "" });
  const editorStageRef = useRef<Konva.Stage | null>(null);
  const ooxmlSyncJob = useOoxmlSyncJob();

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
  const presentationBriefQuery = useQuery({
    queryKey: presentationBriefQueryKey(projectId),
    queryFn: () => fetchPresentationBrief(projectId),
    retry: false
  });
  const {
    refreshChangedSlideThumbnails,
    renderingDeck,
    slideThumbnailUrls,
    stageRefs: slideRenderStageRefs,
    uploadRehearsalSlideSnapshots
  } = useSlideRenderPipeline({
    persistedDeck: deckQuery.data,
    projectId
  });
  const {
    actions: speakerNotesPanelActions,
    refs: speakerNotesPanelRefs,
    state: speakerNotesPanelState
  } = useSpeakerNotesPanelLayout({ projectId });
  const { contentRef: speakerNotesContentRef } = speakerNotesPanelRefs;
  const {
    height: speakerNotesPanelHeight,
    isExpanded: isSpeakerNotesPanelExpanded,
    isResizing: isSpeakerNotesPanelResizing
  } = speakerNotesPanelState;

  useEffect(() => {
    resetProjectUiState();
    setRightPanelView("ai");
    setAiPanelView("chat");
    setAiChatState(createInitialAiChatState(projectId));
    setSemanticCueExtractionState({ status: "idle", message: "" });
  }, [projectId, resetProjectUiState]);

  const loadedDeck = deckQuery.data ?? fallbackDeck;
  const {
    actions: editorDocumentActions,
    refs: editorDocumentRefs,
    state: editorDocumentState
  } = useEditorDocumentController({
    currentSlideIndex,
    loadedDeck,
    onHydratedProjectChange: () => {
      setSelectedElementIds([]);
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setElementContextMenu(null);
    },
    onManualSaveStart: () => setActiveTopMenu(null),
    persistedDeck: deckQuery.data,
    projectId,
    refetchDeck: async () => {
      await deckQuery.refetch();
    }
  });
  const {
    deck,
    lastPatchLabel,
    lastSavedAt,
    redoStack,
    saveErrorCode,
    saveErrorMessage,
    saveState,
    undoStack
  } = editorDocumentState;
  const { pendingPatchInputsRef, persistedBaseDeckRef, saveQueueRef, workingDeckRef } =
    editorDocumentRefs;
  const {
    applyPersistedDeck,
    commitPatch: commitDeckPatch,
    flush: flushPendingSavesBeforeManualAction,
    flushPendingSaveBatch,
    flushScheduledUndoRedoPersist,
    setLastPatchLabel,
    setLastSavedAt,
    setRedoStack,
    setSaveError,
    setSaveState,
    setUndoStack
  } = editorDocumentActions;
  const commitPatch: typeof commitDeckPatch = (patchInput, baseDeck = workingDeckRef.current) => {
    if (!canMutateDeck) return false;
    const patch = resolvePatchInput(baseDeck, patchInput);
    const ooxmlCapability = resolveOoxmlPatchCapability(baseDeck, patch);
    if (!ooxmlCapability.enabled) {
      setLastPatchLabel(ooxmlCapability.reason ?? "이 변경을 PPTX에 안전하게 저장할 수 없습니다.");
      return false;
    }
    return commitDeckPatch(patch, baseDeck);
  };
  const {
    canManageShare: canManageShareFromAccess,
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
  const canManageShare = capabilities.canManageShare && canManageShareFromAccess;
  const isUsingFallbackDeck = !deckQuery.data;
  const isDeckLoading = deckQuery.isPending;
  const isDeckError = deckQuery.isError;
  const canOpenAudienceLink = Boolean(deckQuery.data?.projectId) && !isDeckLoading && !isDeckError;
  const currentSlide = deck.slides[currentSlideIndex] ?? deck.slides[0] ?? null;
  const { actions: speakerNotesEditorActions, state: speakerNotesEditorState } =
    useSpeakerNotesEditor({
      commitPatch,
      currentSlide,
      deck,
      flushPendingSaves: flushPendingSavesBeforeManualAction,
      onClearSelectedKeyword: clearSelectedKeyword,
      onExpandPanel: speakerNotesPanelActions.expand,
      persistedProjectId: deckQuery.data?.projectId,
      projectId,
      workingDeckRef
    });
  const {
    assistantError: speakerNotesAssistantError,
    assistantMode: speakerNotesAssistantMode,
    assistantOccurrenceWarning: speakerNotesAssistantOccurrenceWarning,
    assistantResult: speakerNotesAssistantResult,
    assistantSource: speakerNotesAssistantSource,
    assistantStatus: speakerNotesAssistantStatus,
    draft: speakerNotesDraft,
    guidance: speakerNotesLengthGuidance,
    isAssistantOpen: isSpeakerNotesAssistantOpen,
    isEditing: isSpeakerNotesEditing
  } = speakerNotesEditorState;
  const setSpeakerNotesDraft = speakerNotesEditorActions.setDraft;
  const setSpeakerNotesAssistantMode = speakerNotesEditorActions.setAssistantMode;
  const handleApplySpeakerNotesSuggestion = speakerNotesEditorActions.applySuggestion;
  const handleCancelSpeakerNotesEdit = speakerNotesEditorActions.cancelEdit;
  const handleGenerateSpeakerNotesSuggestion = speakerNotesEditorActions.generateSuggestion;
  const handleOpenSpeakerNotesAssistant = speakerNotesEditorActions.openAssistant;
  const handleSaveSpeakerNotesEdit = speakerNotesEditorActions.saveEdit;
  const handleStartSpeakerNotesEdit = speakerNotesEditorActions.startEdit;
  const getSpeakerNotesPanelMaxHeight = speakerNotesPanelActions.getMaxHeight;
  const handleToggleSpeakerNotesPanel = speakerNotesPanelActions.toggle;
  const handleSpeakerNotesResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) =>
    speakerNotesPanelActions.handleResizeStart(event, isSpeakerNotesEditing);
  const handleSpeakerNotesResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) =>
    speakerNotesPanelActions.handleResizeKeyDown(event, isSpeakerNotesEditing);
  function commitSpeakerNotesDraftIfDirty() {
    return speakerNotesEditorActions.commitDraftIfDirty();
  }
  function confirmDiscardSpeakerNotesDraft() {
    return speakerNotesEditorActions.confirmDiscardDraft();
  }
  function resetSpeakerNotesEditState(notes: string) {
    speakerNotesEditorActions.resetEditState(notes);
  }
  function handleSelectSlideIndex(index: number) {
    if (index === currentSlideIndex) return;
    if (!confirmDiscardSpeakerNotesDraft()) return;
    resetSpeakerNotesEditState(deck.slides[index]?.speakerNotes ?? "");
    speakerNotesEditorActions.closeAssistant();
    setCurrentSlideIndex(index);
  }

  function handleDuplicateSlide(slideId: string) {
    if (!canMutateDeck || !commitSpeakerNotesDraftIfDirty()) return;

    let duplicatedSlideId: string | null = null;
    const committed = commitPatch((currentDeck) => {
      const patch = createDuplicateSlidePatch(currentDeck, slideId);
      duplicatedSlideId = getAddedSlideId(patch);
      return patch;
    });
    if (!committed || !duplicatedSlideId) return;

    const index = workingDeckRef.current.slides.findIndex(
      (slide) => slide.slideId === duplicatedSlideId
    );
    if (index >= 0) handleSelectSlideIndex(index);
  }

  function handleDeleteSlide(slideId: string) {
    const activeDeck = workingDeckRef.current;
    if (!canMutateDeck || activeDeck.slides.length <= 1) return;
    if (
      activeDeck.slides[currentSlideIndex]?.slideId === slideId &&
      !confirmDiscardSpeakerNotesDraft()
    ) {
      return;
    }

    const nextSlideId = resolveSelectedSlideIdAfterDelete({
      deletedSlideId: slideId,
      selectedSlideId: activeDeck.slides[currentSlideIndex]?.slideId ?? null,
      slides: activeDeck.slides
    });
    const committed = commitPatch((currentDeck) => ({
      deckId: currentDeck.deckId,
      baseVersion: currentDeck.version,
      source: "user",
      operations: [{ type: "delete_slide", slideId }]
    }));
    if (!committed) return;

    const nextIndex = workingDeckRef.current.slides.findIndex(
      (slide) => slide.slideId === nextSlideId
    );
    if (nextIndex >= 0) {
      resetSpeakerNotesEditState(workingDeckRef.current.slides[nextIndex]?.speakerNotes ?? "");
      setCurrentSlideIndex(nextIndex);
    }
    setSelectedElementIds([]);
  }

  function handleReorderSlides(orderedSlideIds: readonly string[]) {
    if (!canMutateDeck) return;
    commitPatch((currentDeck) => createSlideRailReorderPatch(currentDeck, orderedSlideIds));
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
  const {
    actions: editorFileTransferActions,
    refs: editorFileTransferRefs,
    state: editorFileTransferState
  } = useEditorFileTransfer({
    commitPatch,
    onClearSelectedKeyword: clearSelectedKeyword,
    onCloseContextMenu: () => setElementContextMenu(null),
    onImportedDeck: (importedDeck) => {
      editorDocumentActions.hydrateFromServer(importedDeck);
      setCurrentSlideIndex(0);
      resetSpeakerNotesEditState(importedDeck.slides[0]?.speakerNotes ?? "");
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElementIds([]);
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setElementContextMenu(null);
      setLastPatchLabel(`PPTX 가져오기 · v${importedDeck.version}`);
      setSaveState("manual-saved");
      setSaveError(null, null);
    },
    onResetEditing: () => setEditingElementId(null),
    onSelectElement: (elementId) => setSelectedElementIds([elementId]),
    onSelectSlide: handleSelectSlideIndex,
    onSetSelectTool: () => setInsertTool("select"),
    persistedProjectId: deckQuery.data?.projectId,
    prepareForImport: async () => {
      pendingPatchInputsRef.current = [];
      await saveQueueRef.current.catch(() => undefined);
    },
    projectId,
    refetchDeck: async () => (await deckQuery.refetch()).data,
    workingDeckRef
  });
  const { imageFileInputRef, pptxFileInputRef } = editorFileTransferRefs;
  const {
    imageUploadError,
    imageUploadStatus,
    isImageUploadPending,
    isPptxExporting,
    pptxExportError,
    pptxExportStatus,
    pptxImportState
  } = editorFileTransferState;
  const openImageFilePicker = editorFileTransferActions.openImageFilePicker;
  const insertImageFiles = editorFileTransferActions.insertImageFiles;
  const handleImageFileInputChange = editorFileTransferActions.handleImageFileInputChange;
  const handlePptxFileInputChange = editorFileTransferActions.handlePptxFileInputChange;
  function openPptxFilePicker() {
    if (!canMutateDeck) return;
    setActiveTopMenu(null);
    editorFileTransferActions.openPptxFilePicker();
  }
  const hasBlockingEditorDialog = Boolean(
    isAudienceLinkModalOpen ||
    isExitConfirmOpen ||
    isPresenceDebugOpen ||
    isSharePanelOpen ||
    isSpeakerNotesAssistantOpen
  );
  const {
    activeStartAction: activePresentationAction,
    startPresentation: handleStartPresentation,
    startRehearsal: handleStartRehearsal
  } = useEditorPresentationActions({
    applyPersistedDeck,
    commitSpeakerNotesDraftIfDirty,
    flushPendingSaves: flushPendingSavesBeforeManualAction,
    isDeckLoading,
    persistedBaseDeckRef,
    persistedDeck: deckQuery.data,
    projectId,
    setActiveTopMenuClosed: () => setActiveTopMenu(null),
    setLastPatchLabel,
    setLastSavedAt,
    setSaveError,
    setSaveState,
    uploadRehearsalSlideSnapshots,
    workingDeckRef,
    canStartPresentation: capabilities.canCreatePresentationSession,
    canStartRehearsal: capabilities.canStartPersonalRehearsal
  });
  const saveStatusLabel = getEditorStatusLabel({
    isDeckError,
    isDeckLoading,
    isUsingFallbackDeck,
    saveState
  });
  const ooxmlSyncStatus = getOoxmlSyncStatus(ooxmlSyncJob);
  function hasUnsavedEditorChanges() {
    return editorDocumentActions.hasUnsavedChanges();
  }
  const visibleElements = currentSlide ? getRenderableSlideElements(currentSlide, deck.canvas) : [];
  const editorValidationItems = useMemo(
    () => getEditorValidationItems(deck, currentSlide ?? undefined),
    [deck, currentSlide]
  );
  const presentedEditorValidationItems = useMemo(
    () => presentEditorValidationItems(deck, editorValidationItems),
    [deck, editorValidationItems]
  );
  const safeTextOverflowRepair = useMemo(
    () => createSafeTextOverflowRepair({ deck, items: editorValidationItems }),
    [deck, editorValidationItems]
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
          riskCount: editorValidationItems.filter((item) => item.severity === "risk").length,
          warningCount: editorValidationItems.filter((item) => item.severity === "warning").length
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
  const {
    canvasViewportRef: editorCanvasViewportRef,
    editorViewportWidth,
    stageScale,
    zoom: editorZoom,
    zoomIn,
    zoomOut,
    zoomToActualSize,
    zoomToFit
  } = useEditorViewport({
    canvas: deck.canvas,
    isRightPanelOpen,
    projectId,
    setIsRightPanelOpen
  });
  const currentSlideAnimations = useMemo(
    () =>
      currentSlide
        ? [...currentSlide.animations].sort((left, right) => left.order - right.order)
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
    currentSlide?.keywords.find((keyword) => keyword.keywordId === selectedKeywordId) ?? null;
  const selectedKeywordUsage = selectedKeyword
    ? selectedKeywordOccurrenceKey
      ? (currentSlideKeywordActionUsage.byOccurrenceId[selectedKeywordOccurrenceKey] ?? {
          keywordId: selectedKeyword.keywordId,
          occurrenceId: selectedKeywordOccurrenceKey,
          animationIds: [],
          advancesSlide: false
        })
      : (currentSlideKeywordUsage[selectedKeyword.keywordId] ?? null)
    : null;
  const selectedKeywordRequiredActive = selectedKeyword
    ? selectedKeywordOccurrenceKey
      ? (selectedKeyword.requiredOccurrenceIds ?? []).includes(selectedKeywordOccurrenceKey)
      : selectedKeyword.required
    : false;
  const selectedElementId = selectedElementIds.at(-1) ?? null;
  const selectedElements = visibleElements.filter((element) =>
    selectedElementIds.includes(element.elementId)
  );
  const selectedElement =
    selectedElementIds.length === 1
      ? (selectedElements.find((element) => element.elementId === selectedElementId) ?? null)
      : null;
  const currentAnimationEditCapability = currentSlide
    ? resolveOoxmlEditCapability({
        deck,
        feature: "animation-main-sequence",
        slide: currentSlide
      })
    : null;
  const currentTransitionEditCapability = currentSlide
    ? resolveOoxmlEditCapability({
        deck,
        feature: "transition",
        slide: currentSlide
      })
    : null;
  const editorAddElementCapabilities = useMemo(
    () => (currentSlide ? resolveEditorAddElementCapabilities(deck, currentSlide) : null),
    [currentSlide, deck]
  );
  const isCropEditing = Boolean(
    imageCropElementId &&
    selectedElement?.type === "image" &&
    selectedElement.elementId === imageCropElementId
  );
  useEffect(() => {
    if (!imageCropElementId) return;
    if (selectedElement?.type === "image" && selectedElement.elementId === imageCropElementId) {
      return;
    }
    setImageCropElementId(null);
  }, [imageCropElementId, selectedElement]);
  const selectionInspectorModel = useMemo(
    () =>
      createSelectionInspectorModel({
        compact: resolveSelectionInspectorCompactMode(editorViewportWidth),
        currentSlideElementIds: currentSlide?.elements.map((element) => element.elementId) ?? [],
        origin: "canvas",
        selectedElementIds
      }),
    [currentSlide?.elements, editorViewportWidth, selectedElementIds]
  );
  const { actions: editorCanvasActions, refs: editorCanvasRefs } = useEditorCanvasCommands({
    commitPatch,
    confirmDiscardSpeakerNotesDraft,
    currentSlide,
    deck,
    resetSpeakerNotesEditState,
    selectedElement,
    selectedElementIds,
    selectedElements,
    setCurrentSlideIndex,
    setCustomShapeEditElementId,
    setEditingElementId,
    setElementContextMenu,
    setInsertTool,
    setIsShapeMenuOpen,
    setLastPatchLabel,
    setSelectedElementIds,
    workingDeckRef
  });
  const { copiedElementRef } = editorCanvasRefs;
  const handleAddChartElement = editorCanvasActions.addChartElement;
  const handleAddSlide = editorCanvasActions.addSlide;
  const handleAddTextElement = editorCanvasActions.addTextElement;
  const handleCanvasBackgroundSelectionClear = editorCanvasActions.clearCanvasSelection;
  const handleCommitCustomShapeGeometry = editorCanvasActions.commitCustomShapeGeometry;
  const handleCopySelectedElement = editorCanvasActions.copySelectedElement;
  const handleCreateCustomShape = editorCanvasActions.createCustomShape;
  const handleCreateDrawnElement = editorCanvasActions.createDrawnElement;
  const handleCreateGroupFromSelection = editorCanvasActions.createGroupFromSelection;
  const handleDeleteSelectedElement = editorCanvasActions.deleteSelectedElement;
  const handleDuplicateSelectedElement = editorCanvasActions.duplicateSelectedElement;
  const handleElementFrameChange = editorCanvasActions.changeElementFrame;
  const handleInsertShapeElement = editorCanvasActions.insertShapeElement;
  const handleOpenElementContextMenu = editorCanvasActions.openElementContextMenu;
  const handlePasteCopiedElement = editorCanvasActions.pasteCopiedElement;
  const handleUngroupElement = editorCanvasActions.ungroupElement;
  const editorSlideActions = useEditorSlideCommands({
    commitPatch,
    currentSlide,
    currentSlideKeywordUsage,
    deck,
    editorValidationItems,
    onChangeElementFrame: handleElementFrameChange,
    selectedKeywordId,
    selectedKeywordOccurrenceKey,
    setAnimationPanelFocusedAnimationId,
    setLastPatchLabel,
    setSelectedElementIds,
    setSelectedKeywordId,
    setSelectedKeywordOccurrenceKey,
    workingDeckRef
  });
  const handleAddAnimation = editorSlideActions.addAnimation;
  const handleElementPropsChange = editorSlideActions.changeElementProps;
  const handleSlideStyleChange = editorSlideActions.changeSlideStyle;
  const handleThemeChange = editorSlideActions.changeTheme;
  const handleDeleteAnimation = editorSlideActions.deleteAnimation;
  const handleDeleteSelectedKeyword = editorSlideActions.deleteSelectedKeyword;
  const handleSpeakerNotesKeywordSelection = editorSlideActions.selectSpeakerNotesKeyword;
  const handleSelectKeyword = editorSlideActions.selectKeyword;
  const handleToggleAdvanceSlideKeyword = editorSlideActions.toggleAdvanceSlideKeyword;
  const handleToggleKeywordRequired = editorSlideActions.toggleKeywordRequired;
  const handleUpdateAnimation = editorSlideActions.updateAnimation;
  const handleUpdateSlideTransition = editorSlideActions.updateSlideTransition;
  function clearSelectedKeyword() {
    editorSlideActions.clearSelectedKeyword();
  }
  const selectedAnimationPanelElement =
    selectedElement ??
    (selectedElementIds.length === 1
      ? (currentSlide?.elements.find((element) => element.elementId === selectedElementId) ?? null)
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
  const currentImageInsertCapability = currentSlide
    ? editorFileTransferActions.getImageInsertCapability(currentSlide.slideId)
    : null;
  const shapeDisabledReasons = editorAddElementCapabilities
    ? Object.fromEntries(
        Object.entries(editorAddElementCapabilities.shapes).flatMap(([shapeType, capability]) =>
          capability.enabled
            ? []
            : [[shapeType, capability.reason ?? "이 도형을 PPTX에 안전하게 추가할 수 없습니다."]]
        )
      )
    : undefined;
  const shapeAddCapabilities = editorAddElementCapabilities
    ? Object.values(editorAddElementCapabilities.shapes)
    : [];
  const toolbarShapeDisabledReason =
    shapeAddCapabilities.length > 0 &&
    shapeAddCapabilities.every((capability) => !capability.enabled)
      ? (shapeAddCapabilities.find((capability) => !capability.enabled)?.reason ??
        "도형을 PPTX에 안전하게 추가할 수 없습니다.")
      : undefined;
  const elementContextMenuDisabledReasons = (() => {
    if (!elementContextMenu) return undefined;
    const contextSlide = deck.slides.find(
      (slide) => slide.slideId === elementContextMenu.slideId
    );
    if (!contextSlide) {
      return { action: "편집할 슬라이드를 찾지 못했습니다." };
    }
    if (elementContextMenu.type === "image") {
      const capability = getImageReplaceCapability(
        deck,
        contextSlide.slideId,
        elementContextMenu.elementId
      );
      return {
        imageReplace: capability.enabled
          ? undefined
          : (capability.reason ?? "이 이미지를 PPTX에서 안전하게 교체할 수 없습니다.")
      };
    }
    if (elementContextMenu.type === "selection") {
      const elements = elementContextMenu.elementIds.flatMap((elementId) => {
        const element = contextSlide.elements.find(
          (candidate) => candidate.elementId === elementId
        );
        return element ? [element] : [];
      });
      const capability =
        elements.length >= 2
          ? resolveGroupCreationCapability(deck, contextSlide, elements)
          : null;
      return {
        group:
          capability?.enabled === false
            ? (capability.reason ??
              "이 요소들을 PPTX에서 안전하게 그룹화할 수 없습니다.")
            : undefined
      };
    }
    const groupElement = contextSlide.elements.find(
      (element) => element.elementId === elementContextMenu.elementId
    );
    const capability = resolveOoxmlEditCapability({
      deck,
      element: groupElement,
      feature: "delete-element"
    });
    return {
      ungroup: capability.enabled
        ? undefined
        : (capability.reason ?? "이 그룹을 PPTX에서 안전하게 해제할 수 없습니다.")
    };
  })();
  const imageDropEnabled =
    !isCropEditing &&
    !isCustomShapeEditingSelection &&
    canAcceptCanvasImageDrop({
      canMutateDeck,
      hasBlockingDialog: hasBlockingEditorDialog,
      hasCurrentSlide: Boolean(currentSlide),
      inlineTextEditing: Boolean(editingElementId),
      insertCapabilityEnabled: currentImageInsertCapability?.enabled ?? false,
      isUploadPending: isImageUploadPending,
      speakerNotesEditing: isSpeakerNotesEditing
    });
  const isDev = import.meta.env.DEV;
  function handleDesignAgentProposalApplied(response: ApplyDesignAgentProposalResponse) {
    if (!capabilities.canUseAiMutations) return;
    editorDocumentActions.applyDesignProposal(response, () => {
      setSelectedElementIds([]);
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setElementContextMenu(null);
    });
  }

  async function handleSaveDeck() {
    if (!canMutateDeck) return false;
    return editorDocumentActions.save(commitSpeakerNotesDraftIfDirty);
  }

  async function handleExportPptx() {
    if (!capabilities.canExportDeck) return;
    await editorFileTransferActions.exportPptx(handleSaveDeck);
  }

  function handleSemanticCueReviewChange(semanticCues: SemanticCue[]) {
    if (!currentSlide) {
      return;
    }
    const slideId = currentSlide.slideId;
    commitPatch((currentDeck) => createSemanticCueReviewPatch(currentDeck, slideId, semanticCues));
  }

  async function handleSemanticCueExtraction(force: boolean) {
    if (!capabilities.canUseAiMutations) return;
    if (semanticCueExtractionState.status === "running") {
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
      const queuedJob = await createSemanticCueExtractionJob(activeProjectId, force);
      const completedJob = await waitForSemanticCueExtractionJob(queuedJob.jobId);
      if (completedJob.status === "failed") {
        throw new Error(completedJob.error?.message ?? "Semantic Cue extraction failed.");
      }

      const selectedSlideId = currentSlide?.slideId;
      const refetchResult = await deckQuery.refetch();
      const extractedDeck = refetchResult.data;
      if (extractedDeck) {
        editorDocumentActions.hydrateFromServer(extractedDeck);
        const nextSlideIndex = selectedSlideId
          ? extractedDeck.slides.findIndex((slide) => slide.slideId === selectedSlideId)
          : -1;
        if (nextSlideIndex >= 0) {
          setCurrentSlideIndex(nextSlideIndex);
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

  function handleValidationTargetFocus(target: EditorValidationTargetView) {
    if (target.status !== "resolved" || !target.slideId) return;
    const targetIndex = workingDeckRef.current.slides.findIndex(
      (slide) => slide.slideId === target.slideId
    );
    if (targetIndex < 0) return;

    handleSelectSlideIndex(targetIndex);
    setSelectedElementIds(target.elementIds);
    setValidationHighlightElementIds(target.elementIds);
    setRightPanelView("ai");
    setAiPanelView("tools");
    setIsRightPanelOpen(true);
  }

  function handleSafeTextOverflowRepair(onlyElementIds?: readonly string[]) {
    if (!capabilities.canUseAiMutations) return;
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

    commitPatch(result.patch);
    setSelectedElementIds(result.repairedElementIds);
    setValidationHighlightElementIds(result.repairedElementIds);
    setValidationRepairStatus(
      `텍스트 넘침 ${result.repairedElementIds.length}개를 안전 수정했습니다. 실행 취소로 되돌릴 수 있습니다.`
    );
  }

  function handleElementSelection(elementId: string, modifiers: CanvasSelectionModifiers = {}) {
    const hasSelectionModifier = Boolean(
      modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey
    );

    setElementContextMenu(null);
    setCustomShapeEditElementId((current) =>
      current === elementId && !hasSelectionModifier ? current : null
    );

    if (hasSelectionModifier) {
      setEditingElementId(null);
    }

    setSelectedElementIds((current) =>
      applyCanvasSelection({
        currentSelection: current,
        elements: visibleElements,
        hitElementIds: [elementId],
        modifiers
      })
    );
  }

  function handleMarqueeSelection(elementIds: string[]) {
    setElementContextMenu(null);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setSelectedElementIds(elementIds);
  }

  function handleStartInlineElementEditing(elementId: string) {
    const element = currentSlide?.elements.find((candidate) => candidate.elementId === elementId);
    if (!element || element.type !== "text") return;
    const capability = resolveOoxmlEditCapability({
      deck: workingDeckRef.current,
      element,
      feature: "rich-text-content"
    });
    if (!capability.enabled) {
      setLastPatchLabel(capability.reason ?? "이 텍스트를 PPTX에 안전하게 저장할 수 없습니다.");
      return;
    }
    setEditingElementId(elementId);
  }

  function handleSelectAllElements() {
    setElementContextMenu(null);
    setEditingElementId(null);
    setCustomShapeEditElementId(null);
    setSelectedElementIds(
      getSelectableCanvasElements(visibleElements).map((element) => element.elementId)
    );
  }

  function handleMoveSelectionOrder(direction: "backward" | "forward") {
    if (!currentSlide) {
      return;
    }

    const patch = createElementOrderPatch({
      deck: workingDeckRef.current,
      direction,
      selectedElementIds,
      slideId: currentSlide.slideId
    });

    if (patch) {
      commitPatch(patch);
    }
  }

  function handleKeyboardUngroup() {
    if (!currentSlide || selectedElement?.type !== "group") {
      return;
    }

    handleUngroupElement(currentSlide.slideId, selectedElement.elementId);
  }

  function handleDismissKeyboardLayer(layer: EditorEscapeLayer) {
    switch (layer) {
      case "modal":
        if (isExitConfirmOpen) {
          setIsExitConfirmOpen(false);
          return;
        }
        if (isSpeakerNotesAssistantOpen) {
          speakerNotesEditorActions.closeAssistant();
          return;
        }
        if (isAudienceLinkModalOpen) {
          setIsAudienceLinkModalOpen(false);
          return;
        }
        if (isPresenceDebugOpen) {
          setIsPresenceDebugOpen(false);
          return;
        }
        if (isSharePanelOpen) {
          setIsSharePanelOpen(false);
        }
        return;
      case "menu":
        if (elementContextMenu) {
          setElementContextMenu(null);
          return;
        }
        if (isShapeMenuOpen) {
          setIsShapeMenuOpen(false);
          return;
        }
        setActiveTopMenu(null);
        return;
      case "crop-edit":
        return;
      case "custom-shape-edit":
        setCustomShapeEditElementId(null);
        return;
      case "inline-text-edit":
        setEditingElementId(null);
        return;
      case "insert-tool":
        setInsertTool("select");
        return;
      case "selection":
        setSelectedElementIds([]);
    }
  }

  const historyCallbacks = {
    confirmDiscard: confirmDiscardSpeakerNotesDraft,
    onNavigate: (_nextDeck: Deck, nextSlideIndex: number) => {
      setCurrentSlideIndex(nextSlideIndex);
      setSelectedElementIds([]);
      clearSelectedKeyword();
      setEditingElementId(null);
      setCustomShapeEditElementId(null);
      setElementContextMenu(null);
    },
    refreshThumbnails: refreshChangedSlideThumbnails,
    resetNotes: resetSpeakerNotesEditState
  };
  function handleUndo() {
    if (!canMutateDeck) return;
    editorDocumentActions.undo(historyCallbacks);
  }
  function handleRedo() {
    if (!canMutateDeck) return;
    editorDocumentActions.redo(historyCallbacks);
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

  function handleSlidesPaneResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
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

  function handleRightPaneResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    beginHorizontalPaneResize({
      direction: "expand-left",
      event,
      maxWidth: maxRightPaneWidth,
      minWidth: minRightPaneWidth,
      onWidthChange: setRightPaneWidth,
      startWidth: rightPaneWidth
    });
  }

  function handleAnimationPaneResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
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
    if (
      selectedKeywordId &&
      !currentSlide?.keywords.some((keyword) => keyword.keywordId === selectedKeywordId)
    ) {
      clearSelectedKeyword();
    }
  }, [currentSlide, selectedKeywordId]);

  useEffect(() => {
    setSelectedElementIds((current) =>
      applyCanvasSelection({
        currentSelection: [],
        elements: currentSlide?.elements ?? [],
        hitElementIds: current
      })
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
  }, [customShapeEditElementId, selectedElement, selectedElementId, selectedElementIds.length]);

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
        if (!canMutateDeck || !selectedElement || !currentSlide) {
          return false;
        }

        handleElementFrameChange(currentSlide.slideId, selectedElement.elementId, frame);
        return true;
      },
      updateCurrentSlideStyle: (style) => {
        if (!canMutateDeck || !currentSlide) {
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

  useEditorKeyboardShortcuts({
    canMutateDeck,
    canPasteImage: imageDropEnabled,
    copiedElementRef,
    editingElementId,
    hasOpenMenu: Boolean(activeTopMenu || isShapeMenuOpen || elementContextMenu),
    hasOpenModal: hasBlockingEditorDialog,
    insertToolActive: insertTool !== "select",
    isCropEditing,
    isCustomShapeEditingSelection,
    onCopy: handleCopySelectedElement,
    onDelete: handleDeleteSelectedElement,
    onDismissLayer: handleDismissKeyboardLayer,
    onDuplicate: handleDuplicateSelectedElement,
    onGroup: handleCreateGroupFromSelection,
    onMoveSelectionOrder: handleMoveSelectionOrder,
    onNavigateSlide: (direction) => {
      const nextIndex = Math.min(
        deck.slides.length - 1,
        Math.max(0, currentSlideIndex + (direction === "next" ? 1 : -1))
      );
      handleSelectSlideIndex(nextIndex);
    },
    onNudge: (deltaX, deltaY) => {
      if (!currentSlide) return;
      const patch = createSelectionNudgePatch({
        deck: workingDeckRef.current,
        deltaX,
        deltaY,
        selectedElementIds,
        slideId: currentSlide.slideId
      });
      if (patch) commitPatch(patch);
    },
    onPaste: handlePasteCopiedElement,
    onPasteImageFiles: (files) => {
      if (!currentSlide) return;
      void insertImageFiles(
        files,
        { slideId: currentSlide.slideId, type: "insert" },
        {
          centerX: deck.canvas.width / 2,
          centerY: deck.canvas.height / 2
        }
      );
    },
    onRedo: handleRedo,
    onSave: () => void handleSaveDeck(),
    onSelectAll: handleSelectAllElements,
    onUngroup: handleKeyboardUngroup,
    onUndo: handleUndo,
    selectedElement,
    selectedElementIds
  });

  function renderSelectionInspector(instanceKey: string) {
    const sharedProperties = {
      animations: selectedElementAnimations,
      animationDiagnostics: currentSlideAnimationDiagnostics,
      canvas: deck.canvas,
      customShapeEditActive: isCustomShapeEditingSelection,
      deck,
      instanceKey,
      onChangeElementFrame: handleElementFrameChange,
      onChangeElementProps: handleElementPropsChange,
      onChangeSlideStyle: (style: {
        backgroundColor?: string | null;
        textColor?: string | null;
        accentColor?: string | null;
      }) => {
        if (currentSlide) handleSlideStyleChange(currentSlide.slideId, style);
      },
      onChangeTheme: handleThemeChange,
      onCloseInlineEditing: () => setEditingElementId(null),
      onCommitCustomShapeGeometry: handleCommitCustomShapeGeometry,
      onDeleteAnimation: handleDeleteAnimation,
      onOpenAnimationEditor: openAnimationInspector,
      onStartImageCrop: (elementId: string) => {
        setEditingElementId(null);
        setCustomShapeEditElementId(null);
        setImageCropElementId(elementId);
      },
      onToggleCustomShapeEdit: (elementId: string) =>
        setCustomShapeEditElementId((current) => (current === elementId ? null : elementId)),
      selectedKeywordLabel: selectedKeyword?.text ?? null,
      showIds,
      theme: deck.theme
    };

    return (
      <SelectionInspector
        canEdit={canMutateDeck}
        elementControls={
          selectedElement ? (
            <EditorSelectionProperties
              {...sharedProperties}
              element={selectedElement}
              slide={currentSlide}
            />
          ) : null
        }
        elementLabel={selectedElement?.type}
        model={selectionInspectorModel}
        multiControls={
          <p className="selection-inspector-multi-summary">
            여러 요소를 함께 이동하거나 정렬할 수 있습니다.
          </p>
        }
        slideControls={
          <EditorSelectionProperties {...sharedProperties} element={null} slide={currentSlide} />
        }
        slideLabel={currentSlide?.title}
      />
    );
  }

  function openPresentationJourney() {
    setPresentationJourneyStatus("");
    setRightPanelView("journey");
    setIsRightPanelOpen(true);
  }

  async function handlePresentationJourneyAction(action: PresentationJourneyAction) {
    if (action.id === "open-validation" || action.id === "focus-validation") {
      setRightPanelView("ai");
      setAiPanelView("tools");
      setIsRightPanelOpen(true);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[data-testid='editor-validation-panel']")?.focus()
      );
      return;
    }
    if (presentationJourneyBusyRef.current) return;

    presentationJourneyBusyRef.current = true;
    setPresentationJourneyBusy(true);
    setPresentationJourneyStatus("");
    try {
      if (action.id === "edit-brief" || action.id === "view-brief") {
        if (action.id === "edit-brief" && !(await handleSaveDeck())) {
          setPresentationJourneyStatus(
            saveErrorMessage || "저장에 실패했습니다. 문제를 해결한 뒤 다시 시도해 주세요."
          );
          return;
        }
        window.history.pushState({}, "", `/project/${encodeURIComponent(projectId)}/brief`);
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
      if (action.id === "start-rehearsal") {
        await handleStartRehearsal();
        return;
      }
      if (action.id === "start-presentation") {
        await handleStartPresentation();
      }
    } finally {
      presentationJourneyBusyRef.current = false;
      setPresentationJourneyBusy(false);
    }
  }

  return (
    <>
      <main
        aria-busy={isDeckLoading}
        className={`editor-app-shell orbit-shell ${isDeckLoading ? "is-deck-loading" : ""}`}
      >
        <EditorTopbar
          activePresentationAction={activePresentationAction}
          activeTopMenu={activeTopMenu}
          canCreatePresentationSession={capabilities.canCreatePresentationSession}
          canExportDeck={capabilities.canExportDeck}
          canManageShare={canManageShare}
          canMutateDeck={canMutateDeck}
          canOpenAudienceLink={canOpenAudienceLink}
          canStartPersonalRehearsal={capabilities.canStartPersonalRehearsal}
          canvas={deck.canvas}
          deckTitle={deck.title}
          isDeckLoading={isDeckLoading}
          isPptxExporting={isPptxExporting}
          isSharePanelOpen={isSharePanelOpen}
          isSharePermissionLoading={isSharePermissionLoading}
          isUsingFallbackDeck={isUsingFallbackDeck}
          lastSavedAtLabel={formatLastSavedAtLabel(lastSavedAt)}
          ooxmlSyncStatus={ooxmlSyncStatus}
          onExitToHome={handleExitToHome}
          onExportPptx={() => void handleExportPptx()}
          onImportPptx={openPptxFilePicker}
          onOpenAudienceLink={() => {
            setIsAudienceLinkModalOpen(true);
            setActiveTopMenu(null);
          }}
          onOpenJourney={openPresentationJourney}
          onOpenPresenceDebug={() => setIsPresenceDebugOpen(true)}
          onOpenShare={openSharePanel}
          onRefresh={() => {
            void health.refetch();
            void deckQuery.refetch();
          }}
          onSave={() => void handleSaveDeck()}
          onStartPresentation={() => void handleStartPresentation()}
          onStartRehearsal={() => void handleStartRehearsal()}
          projectId={projectId}
          projectPresenceUsers={projectPresenceUsers}
          pptxExportMessage={pptxExportError || pptxExportStatus}
          pptxImportMeta={pptxImportMenuMeta(pptxImportState)}
          recoveryHint={saveErrorMessage ? getSaveRecoveryHint(saveErrorCode) : null}
          saveMenuMeta={
            saveErrorMessage
              ? getSaveErrorStatusLabel(saveErrorCode)
              : deckQuery.data
                ? saveStatusLabel
                : "demo fallback"
          }
          saveStatusLabel={saveStatusLabel}
          saving={isSaveInFlight(saveState)}
          setActiveTopMenu={setActiveTopMenu}
          showLoadedFileLabel={Boolean(deckQuery.data)}
        />
        {!canMutateDeck ? <ProjectReadOnlyBanner /> : null}
        <EditorModals
          audienceLink={{
            isOpen: isAudienceLinkModalOpen,
            onClose: () => setIsAudienceLinkModalOpen(false),
            projectId
          }}
          exitConfirm={{
            isOpen: isExitConfirmOpen,
            modalProps: {
              isSaving: isExitSaving,
              onCancel: () => setIsExitConfirmOpen(false),
              onDiscard: handleDiscardAndExit,
              onSaveAndExit: () => {
                void handleSaveAndExit();
              }
            }
          }}
          presence={{
            isOpen: isPresenceDebugOpen,
            lastPresenceAt,
            onClose: () => setIsPresenceDebugOpen(false),
            projectId,
            sessionDebug,
            socketErrorMessage,
            socketId,
            socketStatus,
            users: projectPresenceUsers
          }}
          share={{
            isOpen: isSharePanelOpen,
            modalProps: {
              activeTab: shareAccessTab,
              actionError: shareActionError,
              actionLabel: shareActionLabel,
              inviteEmail: shareInviteEmail,
              inviteRole: shareInviteRole,
              isLoading: isShareLoading,
              members: shareMembers,
              requests: shareRequests,
              onClose: () => setIsSharePanelOpen(false),
              onInvite: handleShareInvite,
              onInviteEmailChange: setShareInviteEmail,
              onInviteRoleChange: setShareInviteRole,
              onMemberRemove: handleShareMemberRemoval,
              onMemberRoleChange: handleShareMemberRoleChange,
              onRequestStatusChange: handleShareRequestStatus,
              onTabChange: setShareAccessTab
            }
          }}
        />
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
              "--right-pane-collapsed-width": `${collapsedRightPaneWidth}px`,
              "--speaker-notes-panel-height": `${speakerNotesPanelHeight}px`
            } as CSSProperties
          }
        >
          <SlideNavigatorPane
            canMutate={canMutateDeck}
            currentSlideIndex={currentSlideIndex}
            deck={deck}
            isCollapsed={isSlidesPaneCollapsed}
            onAddSlide={handleAddSlide}
            onDeleteSlide={handleDeleteSlide}
            onDuplicateSlide={handleDuplicateSlide}
            onMoveSlide={handleMoveSlide}
            onReorderSlides={handleReorderSlides}
            onResizeStart={handleSlidesPaneResizeStart}
            onSelectSlide={handleSelectSlideIndex}
            onSetView={setSlidePanelView}
            onToggleCollapsed={() => setIsSlidesPaneCollapsed((current) => !current)}
            showIds={showIds}
            slideThumbnailUrls={slideThumbnailUrls}
            view={slidePanelView}
          />
          {canMutateDeck && isAnimationPanelOpen ? (
            <AnimationSidePanel
              actionAnimationIds={currentSlide?.actions.flatMap((action) =>
                action.effect.kind === "play-animation"
                  ? [action.effect.animationId]
                  : []
              )}
              animations={selectedElementAnimations}
              canPlaySlideAnimations={canPlayCurrentSlideAnimations}
              canCreateAnimation={Boolean(
                currentSlide &&
                selectedAnimationPanelElement &&
                currentAnimationEditCapability?.enabled
              )}
              element={selectedAnimationPanelElement}
              isPlayingSlideAnimations={isPlayingCurrentSlideAnimations}
              keywordOptions={animationPanelKeywordOptions}
              keywordTriggerRestrictionMessage={animationKeywordTriggerPolicy.restrictionMessage}
              keywordTriggerWarningMessage={animationKeywordTriggerPolicy.warningMessage}
              mutationDisabledReason={
                currentAnimationEditCapability?.enabled === false
                  ? currentAnimationEditCapability.reason
                  : null
              }
              preferredAnimationId={animationPanelFocusedAnimationId}
              selectedKeywordId={selectedKeywordId}
              selectedKeywordLabel={selectedKeyword?.text ?? null}
              selectedKeywordOccurrenceId={selectedKeywordOccurrenceKey}
              slideAnimations={currentSlideAnimations}
              slideElements={currentSlide?.elements ?? []}
              slideTransition={currentSlide?.transition}
              transitionMutationDisabledReason={
                currentTransitionEditCapability?.enabled === false
                  ? currentTransitionEditCapability.reason
                  : null
              }
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
              onUpdateSlideTransition={(transition) => {
                if (!currentSlide) {
                  return;
                }

                handleUpdateSlideTransition(currentSlide.slideId, transition);
              }}
            />
          ) : null}

          <section className="stage-pane">
            <EditorToolbar
              actionDisabledReasons={{
                animation:
                  currentAnimationEditCapability?.enabled === false
                    ? (currentAnimationEditCapability.reason ?? undefined)
                    : undefined,
                chart:
                  editorAddElementCapabilities?.chart.enabled === false
                    ? (editorAddElementCapabilities.chart.reason ?? undefined)
                    : undefined,
                image:
                  currentImageInsertCapability?.enabled === false
                    ? (currentImageInsertCapability.reason ?? undefined)
                    : undefined,
                shape: toolbarShapeDisabledReason,
                text:
                  editorAddElementCapabilities?.text.enabled === false
                    ? (editorAddElementCapabilities.text.reason ?? undefined)
                    : undefined
              }}
              canMutate={canMutateDeck}
              canUseCurrentSlide={Boolean(currentSlide)}
              insertTool={insertTool}
              isAnimationPanelOpen={isAnimationPanelOpen}
              isImageUploadPending={isImageUploadPending}
              isShapeMenuOpen={isShapeMenuOpen}
              onAddChart={handleAddChartElement}
              onAddText={handleAddTextElement}
              onOpenAnimation={openAnimationInspector}
              onOpenImagePicker={() => {
                if (currentSlide) {
                  openImageFilePicker({
                    slideId: currentSlide.slideId,
                    type: "insert"
                  });
                }
              }}
              onRedo={handleRedo}
              onSelectTool={() => setInsertTool("select")}
              onToggleShapeMenu={() => setIsShapeMenuOpen((current) => !current)}
              onUndo={handleUndo}
              redoDisabled={redoStack.length === 0}
              selectedElementAnimationCount={selectedElementAnimations.length}
              selectionProperties={renderSelectionInspector("toolbar-properties")}
              shapeMenuButtonRef={shapeMenuButtonRef}
              undoDisabled={undoStack.length === 0}
              zoomControl={
                <EditorZoomControl
                  canZoomIn={stageScale < maximumManualEditorZoom}
                  canZoomOut={stageScale > minimumManualEditorZoom}
                  isFit={editorZoom.mode === "fit"}
                  onFit={zoomToFit}
                  onReset={zoomToActualSize}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  zoomPercent={stageScale * 100}
                />
              }
            />

            <EditorCanvasStage
              assistantDialog={
                <SpeakerNotesAssistantDialog
                  errorMessage={speakerNotesAssistantError}
                  mode={speakerNotesAssistantMode}
                  occurrenceWarning={speakerNotesAssistantOccurrenceWarning}
                  onApply={handleApplySpeakerNotesSuggestion}
                  onClose={speakerNotesEditorActions.closeAssistant}
                  onGenerate={() => void handleGenerateSpeakerNotesSuggestion()}
                  onModeChange={setSpeakerNotesAssistantMode}
                  open={isSpeakerNotesAssistantOpen}
                  originalNotes={speakerNotesAssistantSource?.notes ?? ""}
                  result={speakerNotesAssistantResult}
                  status={speakerNotesAssistantStatus}
                />
              }
              canvasViewportRef={editorCanvasViewportRef}
              currentSlide={currentSlide}
              deck={deck}
              editableCanvasProps={{
                customShapeEditElementId,
                disableInteractions: !canMutateDeck || isPlayingCurrentSlideAnimations,
                editingElementId: canMutateDeck ? editingElementId : null,
                imageCropElementId: canMutateDeck ? imageCropElementId : null,
                elementStates: animationPreviewElementStates,
                insertTool,
                selectedElementIds,
                showIds,
                stageScale,
                stageRef: editorStageRef,
                validationHighlightElementIds,
                visibleElements,
                onClearSelection: handleCanvasBackgroundSelectionClear,
                onCommitElementFrame: handleElementFrameChange,
                onCommitElementProps: (elementId, nextProps) => {
                  if (currentSlide) {
                    handleElementPropsChange(currentSlide.slideId, elementId, nextProps);
                  }
                },
                onCreateElement: handleCreateDrawnElement,
                onCreateCustomShape: handleCreateCustomShape,
                onCommitCustomShapeGeometry: (elementId, nodes, closed) => {
                  if (currentSlide) {
                    handleCommitCustomShapeGeometry(currentSlide.slideId, elementId, nodes, closed);
                  }
                },
                onDoubleClickElement: handleStartInlineElementEditing,
                onFinishEditing: () => setEditingElementId(null),
                onFinishImageCrop: () => setImageCropElementId(null),
                onSetCustomShapeEditElementId: setCustomShapeEditElementId,
                onSetInsertTool: setInsertTool,
                onOpenElementContextMenu: handleOpenElementContextMenu,
                onSelectElement: handleElementSelection,
                onSelectElements: handleMarqueeSelection
              }}
              imageDropEnabled={imageDropEnabled}
              imageTransferMessage={
                imageUploadError
                  ? { kind: "error", message: imageUploadError }
                  : imageUploadStatus
                    ? { kind: "status", message: imageUploadStatus }
                    : null
              }
              onImageFilesDrop={(files, placement) => {
                if (!currentSlide) return;
                void insertImageFiles(
                  files,
                  { slideId: currentSlide.slideId, type: "insert" },
                  placement
                );
              }}
              renderingDeck={renderingDeck}
              slideRenderStageRefs={slideRenderStageRefs}
              stageScale={stageScale}
            />

            <SpeakerNotesPanel
              canEdit={canMutateDeck}
              contentRef={speakerNotesContentRef}
              currentSlide={currentSlide}
              draft={speakerNotesDraft}
              guidance={speakerNotesLengthGuidance}
              height={speakerNotesPanelHeight}
              isEditing={isSpeakerNotesEditing}
              isExpanded={isSpeakerNotesPanelExpanded}
              isResizing={isSpeakerNotesPanelResizing}
              maxHeight={getSpeakerNotesPanelMaxHeight()}
              minHeight={minSpeakerNotesPanelHeight}
              onCancelEdit={handleCancelSpeakerNotesEdit}
              onClearKeyword={clearSelectedKeyword}
              onDeleteKeyword={() => {
                if (currentSlide && selectedKeyword) {
                  handleDeleteSelectedKeyword(currentSlide.slideId, selectedKeyword.keywordId);
                }
              }}
              onDraftChange={setSpeakerNotesDraft}
              onOpenAssistant={handleOpenSpeakerNotesAssistant}
              onResizeKeyDown={handleSpeakerNotesResizeKeyDown}
              onResizeStart={handleSpeakerNotesResizeStart}
              onSaveEdit={handleSaveSpeakerNotesEdit}
              onSelectKeyword={handleSelectKeyword}
              onSelectKeywordText={handleSpeakerNotesKeywordSelection}
              onStartEdit={handleStartSpeakerNotesEdit}
              onToggleAdvanceSlide={() => {
                if (currentSlide && selectedKeyword) {
                  handleToggleAdvanceSlideKeyword(
                    currentSlide.slideId,
                    selectedKeyword.keywordId,
                    !(selectedKeywordUsage?.advancesSlide ?? false)
                  );
                }
              }}
              onTogglePanel={handleToggleSpeakerNotesPanel}
              onToggleRequired={() => {
                if (currentSlide && selectedKeyword) {
                  handleToggleKeywordRequired(
                    currentSlide.slideId,
                    selectedKeyword.keywordId,
                    selectedKeywordOccurrenceKey
                  );
                }
              }}
              selectedKeyword={selectedKeyword}
              selectedKeywordId={selectedKeywordId}
              selectedKeywordOccurrenceKey={selectedKeywordOccurrenceKey}
              selectedKeywordRequiredActive={selectedKeywordRequiredActive}
              selectedKeywordUsage={selectedKeywordUsage}
              showIds={showIds}
              usageByKeywordId={currentSlideKeywordUsage}
            />
          </section>

          <EditorRightPanel
            aiChatState={aiChatState}
            aiPanelView={aiPanelView}
            canRepairValidation={capabilities.canUseAiMutations}
            canUseAiMutations={capabilities.canUseAiMutations}
            currentSlide={currentSlide}
            deck={deck}
            designProperties={renderSelectionInspector("design-properties")}
            editorValidationItems={presentedEditorValidationItems}
            isOpen={isRightPanelOpen}
            journeyPanel={
              <PresentationJourneyPanel
                busy={presentationJourneyBusy}
                model={presentationJourneyModel}
                onAction={(action) => void handlePresentationJourneyAction(action)}
                statusMessage={presentationJourneyStatus || saveErrorMessage}
              />
            }
            onAiChatStateChange={setAiChatState}
            onFocusValidationTarget={handleValidationTargetFocus}
            onHighlightElementIds={setValidationHighlightElementIds}
            onProposalApplied={handleDesignAgentProposalApplied}
            onRepairTextOverflow={handleSafeTextOverflowRepair}
            onResizeStart={handleRightPaneResizeStart}
            onSemanticCueChange={handleSemanticCueReviewChange}
            onSemanticCueExtract={(force) => void handleSemanticCueExtraction(force)}
            projectId={projectId}
            pptxImportState={pptxImportState}
            repairableValidationElementIds={safeTextOverflowRepair.repairedElementIds}
            rightPanelView={rightPanelView}
            selectedElementIds={selectedElementIds}
            semanticCueExtractionState={semanticCueExtractionState}
            setAiPanelView={setAiPanelView}
            setIsOpen={setIsRightPanelOpen}
            setRightPanelView={setRightPanelView}
            validationRepairStatus={validationRepairStatus}
          />
        </section>

        <EditorDebugPanels
          currentSlide={currentSlide}
          currentSlideAnimations={currentSlideAnimations}
          deck={deck}
          isDataViewOpen={isDataViewOpen}
          isDev={isDev}
          lastPatchLabel={lastPatchLabel}
          onCloseDataView={() => setIsDataViewOpen(false)}
          redoCount={redoStack.length}
          saveStatusLabel={saveStatusLabel}
          undoCount={undoStack.length}
          visibleElements={visibleElements}
        />
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
      <EditorContextMenus
        elementContextMenu={elementContextMenu}
        elementActionDisabledReasons={elementContextMenuDisabledReasons}
        isImageUploadPending={isImageUploadPending}
        isShapeMenuOpen={isShapeMenuOpen}
        onCloseElementContextMenu={() => setElementContextMenu(null)}
        onCloseShapeMenu={() => setIsShapeMenuOpen(false)}
        onCreateGroup={handleCreateGroupFromSelection}
        onInsertShape={handleInsertShapeElement}
        onReplaceImage={openImageFilePicker}
        onUngroup={handleUngroupElement}
        shapeDisabledReasons={shapeDisabledReasons}
        shapeMenuPosition={shapeMenuPosition}
      />
    </>
  );
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
