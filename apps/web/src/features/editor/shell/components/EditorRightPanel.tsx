import type {
  ApplyDesignAgentProposalResponse,
  Deck,
  SemanticCue,
  Slide,
  SpeakerNotesSuggestionMode,
} from "@orbit/shared";
import {
  IconAdjustmentsHorizontal as Properties,
  IconChevronRight as ChevronRight,
  IconMicrophone,
  IconMovie as Animation,
  IconPlayerPlay as Play,
  IconSparkles as Sparkles,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type {
  Dispatch,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  SetStateAction,
} from "react";

import { SourceLedgerPanel } from "../../ai/quality/SourceLedgerPanel";
import {
  ValidationPanel,
  type ValidationTextOverflowAction,
} from "../../ai/quality/ValidationPanel";
import type { EditorValidationItem } from "../../ai/quality/editorValidation";
import {
  SemanticCueReviewPanel,
  type SemanticCueExtractionUiState,
} from "../../semantic-cues/SemanticCueReviewPanel";
import { AiChatPanel, type AiChatState } from "./AiChatPanel";
import {
  PptxImportQualityPanel,
  type PptxImportState,
} from "./PptxImportQualityPanel";
import { getDesignPanelLabel } from "../utils/slideEditingPolicy";

export type AiPanelView = "chat" | "tools" | "semantic-cues";
type RightPanelMode = "assistant" | "animation" | "properties";

type EditorRightPanelProps = {
  aiChatState: AiChatState;
  aiPanelView: AiPanelView;
  animationCount: number;
  animationProperties: ReactNode;
  canPlayAnimations: boolean;
  currentSlide: Slide | null;
  deck: Deck;
  designProperties: ReactNode;
  editorValidationItems: EditorValidationItem[];
  isOpen: boolean;
  isAnimationPropertiesOpen: boolean;
  isPlayingAnimations: boolean;
  onAiChatStateChange: Dispatch<SetStateAction<AiChatState>>;
  onApplyAllValidationTextOverflow: () => void;
  onHighlightElementIds: (elementIds: string[]) => void;
  onExitRehearsal?: () => void;
  onProposalApplied: (response: ApplyDesignAgentProposalResponse) => void;
  onPlayAnimations: () => void;
  onSpeakerNotesAssistantRequest: (mode: SpeakerNotesSuggestionMode) => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onSemanticCueChange: (semanticCues: SemanticCue[]) => void;
  onSemanticCueExtract: (force: boolean) => void;
  onTextOverflowAction: (
    item: EditorValidationItem,
    action: ValidationTextOverflowAction,
  ) => void;
  projectId: string;
  pptxImportState: PptxImportState;
  rehearsalPanel?: ReactNode;
  rehearsalTitle?: string;
  selectedElementIds: string[];
  semanticCueExtractionState: SemanticCueExtractionUiState;
  setAiPanelView: Dispatch<SetStateAction<AiPanelView>>;
  setIsAnimationPropertiesOpen: (open: boolean) => void;
  setIsOpen: (open: boolean) => void;
};

export function EditorRightPanel(props: EditorRightPanelProps) {
  const hasElementSelection = props.selectedElementIds.length === 1;
  const designPanelLabel = getDesignPanelLabel(props.currentSlide);
  const isSpecialSlide = designPanelLabel === "장표 설정";
  const [activePanelMode, setActivePanelMode] =
    useState<RightPanelMode>("assistant");

  useEffect(() => {
    if (props.isAnimationPropertiesOpen) {
      setActivePanelMode("animation");
    }
  }, [props.isAnimationPropertiesOpen]);

  useEffect(() => {
    if (isSpecialSlide) {
      setActivePanelMode("properties");
      props.setIsAnimationPropertiesOpen(false);
    }
  }, [isSpecialSlide, props.currentSlide?.slideId]);

  function closePanel() {
    props.setIsOpen(false);
    if (activePanelMode === "animation") {
      props.setIsAnimationPropertiesOpen(false);
    }
  }

  function selectPanelMode(mode: RightPanelMode) {
    if (props.isOpen && activePanelMode === mode) {
      closePanel();
      return;
    }

    setActivePanelMode(mode);
    props.setIsOpen(true);
    props.setIsAnimationPropertiesOpen(mode === "animation");
  }

  const activePanelLabel =
    activePanelMode === "properties"
      ? "속성"
      : activePanelMode === "animation"
        ? "애니메이션"
        : "AI 어시스턴트";

  function handleAiPanelTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const views = ["chat", "tools"] as const;
    const currentIndex = props.aiPanelView === "tools" ? 1 : 0;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextView =
      views[(currentIndex + direction + views.length) % views.length];
    props.setAiPanelView(nextView);
    requestAnimationFrame(() =>
      document.getElementById(`editor-ai-${nextView}-tab`)?.focus(),
    );
  }

  return (
    <aside
      className={`ai-pane ${props.isOpen ? "" : "collapsed"} ${props.rehearsalPanel ? "rehearsal-mode" : ""}`}
    >
      {props.isOpen && props.rehearsalPanel ? (
        <>
          <button
            aria-label="오른쪽 패널 크기 조정"
            className="right-pane-resizer"
            type="button"
            onPointerDown={props.onResizeStart}
          />
          <div className="inspector-header editor-slide-rehearsal-header">
            <div className="inspector-title">
              <IconMicrophone aria-hidden="true" size={15} />
              <strong>{props.rehearsalTitle ?? "슬라이드 리허설"}</strong>
            </div>
            <button
              aria-label="슬라이드 리허설 종료"
              className="collapse-right-pane-button"
              title="슬라이드 리허설 종료"
              type="button"
              onClick={props.onExitRehearsal}
            >
              <IconX aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="editor-slide-rehearsal-panel">
            {props.rehearsalPanel}
          </div>
        </>
      ) : null}
      {!props.rehearsalPanel ? (
        <>
          <button
            aria-label="오른쪽 패널 크기 조정"
            className="right-pane-resizer"
            type="button"
            onPointerDown={props.onResizeStart}
          />
          <div
            aria-hidden={!props.isOpen}
            className="editor-right-panel-content"
            id="editor-right-panel-content"
            inert={props.isOpen ? undefined : true}
          >
            <div className="inspector-header">
              <div className="inspector-title">
                {activePanelMode === "properties" ? (
                  <Properties aria-hidden="true" size={15} />
                ) : null}
                {activePanelMode === "animation" ? (
                  <Animation aria-hidden="true" size={15} />
                ) : null}
                {activePanelMode === "assistant" ? (
                  <Sparkles aria-hidden="true" size={15} />
                ) : null}
                <strong>
                  {activePanelMode === "properties" ? "속성" : null}
                  {activePanelMode === "animation" ? "애니메이션" : null}
                  {activePanelMode === "assistant" ? "AI 어시스턴트" : null}
                </strong>
              </div>
              <div className="inspector-actions">
                <button
                  aria-label={`${activePanelLabel} 패널 닫기`}
                  className="collapse-right-pane-button"
                  title={`${activePanelLabel} 패널 닫기`}
                  type="button"
                  onClick={closePanel}
                >
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </div>
            </div>
            <div
              className={`assistant-panel-slot inspector-panel-slot right-panel-${activePanelMode}`}
            >
              {activePanelMode === "animation" ? (
                <div
                  aria-label="애니메이션 속성"
                  className="assistant-panel-view inspector-animation-properties"
                  id="editor-animation-properties"
                  role="tabpanel"
                >
                  <div className="inspector-animation-actions">
                    <span className="redesign-eyebrow">MOTION</span>
                    <button
                      aria-label={
                        props.isPlayingAnimations
                          ? "애니메이션 재생 중"
                          : "애니메이션 미리보기"
                      }
                      className="inspector-icon-action"
                      disabled={
                        !props.canPlayAnimations || props.isPlayingAnimations
                      }
                      title={props.isPlayingAnimations ? "재생 중" : "미리보기"}
                      type="button"
                      onClick={props.onPlayAnimations}
                    >
                      <Play aria-hidden="true" size={15} />
                    </button>
                  </div>
                  {props.animationProperties}
                </div>
              ) : null}
              {activePanelMode === "properties" ? (
                <div
                  aria-label={
                    hasElementSelection
                      ? "선택 요소"
                      : isSpecialSlide
                        ? designPanelLabel
                        : undefined
                  }
                  aria-labelledby={
                    hasElementSelection || isSpecialSlide
                      ? undefined
                      : "editor-design-heading"
                  }
                  className="assistant-panel-view editor-design-panel"
                  id="editor-design-panel"
                  role="tabpanel"
                >
                  {!isSpecialSlide ? (
                    <span className="redesign-eyebrow">
                      {hasElementSelection
                        ? "ELEMENT PROPERTIES"
                        : "GLOBAL STYLES"}
                    </span>
                  ) : null}
                  {!hasElementSelection && !isSpecialSlide ? (
                    <>
                      <h3 id="editor-design-heading">{designPanelLabel}</h3>
                      <p>슬라이드와 덱의 기본 시각 속성을 조정합니다.</p>
                    </>
                  ) : null}
                  {props.designProperties}
                </div>
              ) : null}
              {activePanelMode === "assistant" ? (
                <section
                  aria-label="AI 어시스턴트"
                  className="editor-ai-assistant-panel"
                  id="editor-ai-panel"
                  role="tabpanel"
                >
                  <div className="editor-ai-coach-panel">
                    <div
                      aria-label="AI 어시스턴트 보기"
                      className="assistant-subtabs"
                      role="tablist"
                    >
                      <button
                        aria-controls="editor-ai-chat-panel"
                        aria-selected={props.aiPanelView === "chat"}
                        className={props.aiPanelView === "chat" ? "active" : ""}
                        id="editor-ai-chat-tab"
                        role="tab"
                        tabIndex={props.aiPanelView === "chat" ? 0 : -1}
                        type="button"
                        onClick={() => props.setAiPanelView("chat")}
                        onKeyDown={handleAiPanelTabKeyDown}
                      >
                        채팅
                      </button>
                      <button
                        aria-controls="editor-ai-tools-panel"
                        aria-selected={props.aiPanelView === "tools"}
                        className={
                          props.aiPanelView === "tools" ? "active" : ""
                        }
                        id="editor-ai-tools-tab"
                        role="tab"
                        tabIndex={props.aiPanelView === "tools" ? 0 : -1}
                        type="button"
                        onClick={() => props.setAiPanelView("tools")}
                        onKeyDown={handleAiPanelTabKeyDown}
                      >
                        검사
                      </button>
                    </div>
                    <div
                      aria-labelledby="editor-ai-chat-tab"
                      className="assistant-panel-subview"
                      hidden={props.aiPanelView !== "chat"}
                      id="editor-ai-chat-panel"
                      role="tabpanel"
                    >
                      <AiChatPanel
                        projectId={props.projectId}
                        deck={props.deck}
                        currentSlide={props.currentSlide}
                        designEditingEnabled={!isSpecialSlide}
                        selectedElementIds={props.selectedElementIds}
                        chatState={props.aiChatState}
                        onChatStateChange={props.onAiChatStateChange}
                        onProposalApplied={props.onProposalApplied}
                        onSpeakerNotesAssistantRequest={
                          props.onSpeakerNotesAssistantRequest
                        }
                      />
                    </div>
                    <div
                      aria-labelledby="editor-ai-tools-tab"
                      className="assistant-panel-subview editor-ai-tools-subview"
                      hidden={props.aiPanelView !== "tools"}
                      id="editor-ai-tools-panel"
                      role="tabpanel"
                    >
                      <PptxImportQualityPanel state={props.pptxImportState} />
                      <ValidationPanel
                        items={props.editorValidationItems}
                        onApplyAllTextOverflow={
                          props.onApplyAllValidationTextOverflow
                        }
                        onHighlightElementIds={props.onHighlightElementIds}
                        onTextOverflowAction={props.onTextOverflowAction}
                      />
                      <SourceLedgerPanel slide={props.currentSlide} />
                      <SemanticCueReviewPanel
                        extractionState={props.semanticCueExtractionState}
                        slide={props.currentSlide}
                        onChange={props.onSemanticCueChange}
                        onExtract={props.onSemanticCueExtract}
                      />
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
          <div
            aria-label="오른쪽 패널 보기"
            className="editor-right-panel-rail"
            role="tablist"
          >
            <button
              aria-label="속성"
              aria-controls="editor-right-panel-content"
              aria-expanded={props.isOpen && activePanelMode === "properties"}
              aria-selected={props.isOpen && activePanelMode === "properties"}
              className={activePanelMode === "properties" ? "active" : ""}
              role="tab"
              title="속성 패널 열기"
              type="button"
              onClick={() => selectPanelMode("properties")}
            >
              <Properties aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="애니메이션"
              aria-controls="editor-right-panel-content"
              aria-expanded={props.isOpen && activePanelMode === "animation"}
              aria-selected={props.isOpen && activePanelMode === "animation"}
              className={activePanelMode === "animation" ? "active" : ""}
              role="tab"
              title="애니메이션 패널 열기"
              type="button"
              onClick={() => selectPanelMode("animation")}
            >
              <Animation aria-hidden="true" size={16} />
              {props.animationCount > 0 ? (
                <span
                  aria-label={`애니메이션 ${props.animationCount}개`}
                  className="inspector-mode-count"
                >
                  {props.animationCount}
                </span>
              ) : null}
            </button>
            <button
              aria-label="AI 어시스턴트"
              aria-controls="editor-right-panel-content"
              aria-expanded={props.isOpen && activePanelMode === "assistant"}
              aria-selected={props.isOpen && activePanelMode === "assistant"}
              className={activePanelMode === "assistant" ? "active" : ""}
              role="tab"
              title="AI 어시스턴트 패널 열기"
              type="button"
              onClick={() => selectPanelMode("assistant")}
            >
              <Sparkles aria-hidden="true" size={16} />
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
