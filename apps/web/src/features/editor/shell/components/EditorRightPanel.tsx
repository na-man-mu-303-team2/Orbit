import type { ApplyDesignAgentProposalResponse, Deck, SemanticCue, Slide } from "@orbit/shared";
import {
  IconAdjustmentsHorizontal as Properties,
  IconChevronDown as ChevronDown,
  IconChevronUp as ChevronUp,
  IconLayoutSidebarRightCollapse as PanelRightClose,
  IconMicrophone,
  IconPlayerPlay as Play,
  IconSparkles as Sparkles,
  IconX
} from "@tabler/icons-react";
import { useState } from "react";
import type { Dispatch, KeyboardEvent, PointerEvent, ReactNode, SetStateAction } from "react";

import { SourceLedgerPanel } from "../../ai/quality/SourceLedgerPanel";
import {
  ValidationPanel,
  type ValidationTextOverflowAction
} from "../../ai/quality/ValidationPanel";
import type { EditorValidationItem } from "../../ai/quality/editorValidation";
import {
  SemanticCueReviewPanel,
  type SemanticCueExtractionUiState
} from "../../semantic-cues/SemanticCueReviewPanel";
import { AiChatPanel, type AiChatState } from "./AiChatPanel";
import {
  PptxImportQualityPanel,
  type PptxImportState
} from "./PptxImportQualityPanel";

export type AiPanelView = "chat" | "tools" | "semantic-cues";

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
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onSemanticCueChange: (semanticCues: SemanticCue[]) => void;
  onSemanticCueExtract: (force: boolean) => void;
  onTextOverflowAction: (
    item: EditorValidationItem,
    action: ValidationTextOverflowAction
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
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);

  function handleAiPanelTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const views = ["chat", "tools"] as const;
    const currentIndex = props.aiPanelView === "tools" ? 1 : 0;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextView = views[(currentIndex + direction + views.length) % views.length];
    props.setAiPanelView(nextView);
    requestAnimationFrame(() => document.getElementById(`editor-ai-${nextView}-tab`)?.focus());
  }

  return (
    <aside className={`ai-pane ${props.isOpen ? "" : "collapsed"} ${isAssistantCollapsed ? "assistant-collapsed" : ""} ${props.rehearsalPanel ? "rehearsal-mode" : ""}`}>
      {props.isOpen && props.rehearsalPanel ? (
        <>
          <button aria-label="오른쪽 패널 크기 조정" className="right-pane-resizer" type="button" onPointerDown={props.onResizeStart} />
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
          <div className="editor-slide-rehearsal-panel">{props.rehearsalPanel}</div>
        </>
      ) : null}
      {props.isOpen && !props.rehearsalPanel ? (
        <>
          <button aria-label="오른쪽 패널 크기 조정" className="right-pane-resizer" type="button" onPointerDown={props.onResizeStart} />
          <div className="inspector-header">
            <div className="inspector-title">
              {props.isAnimationPropertiesOpen ? (
                <Sparkles aria-hidden="true" size={15} />
              ) : (
                <Properties aria-hidden="true" size={15} />
              )}
              <strong>{props.isAnimationPropertiesOpen ? "애니메이션" : "속성"}</strong>
            </div>
            <div className="inspector-actions">
              <div aria-label="속성 보기" className="inspector-mode-switch" role="tablist">
                <button
                  aria-label="디자인 속성"
                  aria-selected={!props.isAnimationPropertiesOpen}
                  className={!props.isAnimationPropertiesOpen ? "active" : ""}
                  role="tab"
                  title="디자인 속성"
                  type="button"
                  onClick={() => props.setIsAnimationPropertiesOpen(false)}
                >
                  <Properties aria-hidden="true" size={15} />
                </button>
                <button
                  aria-label="애니메이션 속성"
                  aria-selected={props.isAnimationPropertiesOpen}
                  className={props.isAnimationPropertiesOpen ? "active" : ""}
                  role="tab"
                  title="애니메이션 속성"
                  type="button"
                  onClick={() => props.setIsAnimationPropertiesOpen(true)}
                >
                  <Sparkles aria-hidden="true" size={15} />
                  {props.animationCount > 0 ? (
                    <span aria-label={`애니메이션 ${props.animationCount}개`} className="inspector-mode-count">
                      {props.animationCount}
                    </span>
                  ) : null}
                </button>
              </div>
              <button aria-label="오른쪽 패널 접기" className="collapse-right-pane-button" title="오른쪽 패널 접기" type="button" onClick={() => props.setIsOpen(false)}>
                <PanelRightClose aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
          <div className="assistant-panel-slot inspector-panel-slot">
            {props.isAnimationPropertiesOpen ? (
              <div aria-label="애니메이션 속성" className="assistant-panel-view inspector-animation-properties" id="editor-animation-properties" role="tabpanel">
                <div className="inspector-animation-actions">
                  <span className="orbit-ds-eyebrow">MOTION</span>
                  <button
                    aria-label={props.isPlayingAnimations ? "애니메이션 재생 중" : "애니메이션 미리보기"}
                    className="inspector-icon-action"
                    disabled={!props.canPlayAnimations || props.isPlayingAnimations}
                    title={props.isPlayingAnimations ? "재생 중" : "미리보기"}
                    type="button"
                    onClick={props.onPlayAnimations}
                  >
                    <Play aria-hidden="true" size={15} />
                  </button>
                </div>
                {props.animationProperties}
              </div>
            ) : (
              <div aria-labelledby="editor-design-heading" className="assistant-panel-view editor-design-panel" id="editor-design-panel" role="tabpanel">
                <span className="orbit-ds-eyebrow">
                  {hasElementSelection ? "ELEMENT PROPERTIES" : "GLOBAL STYLES"}
                </span>
                <h3 id="editor-design-heading">
                  {hasElementSelection ? "선택 요소" : "현재 슬라이드"}
                </h3>
                <p>
                  {hasElementSelection
                    ? "선택한 요소의 시각 속성과 배치를 조정합니다."
                    : "슬라이드와 덱의 기본 시각 속성을 조정합니다."}
                </p>
                {props.designProperties}
              </div>
            )}
          </div>
          <section aria-label="AI 어시스턴트" className={`ai-coach-dock ai-coach-persistent ${isAssistantCollapsed ? "is-collapsed" : ""}`} id="editor-ai-panel">
            <header className="ai-coach-dock-header">
              <div><Sparkles aria-hidden="true" size={16} /><strong>AI 어시스턴트</strong></div>
              <button
                aria-expanded={!isAssistantCollapsed}
                aria-label={isAssistantCollapsed ? "AI 어시스턴트 펼치기" : "AI 어시스턴트 접기"}
                className="ai-coach-collapse-button"
                title={isAssistantCollapsed ? "AI 어시스턴트 펼치기" : "AI 어시스턴트 접기"}
                type="button"
                onClick={() => setIsAssistantCollapsed((collapsed) => !collapsed)}
              >
                {isAssistantCollapsed ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
              </button>
            </header>
            <div className="editor-ai-coach-panel" hidden={isAssistantCollapsed}>
              <div aria-label="AI 어시스턴트 보기" className="assistant-subtabs" role="tablist">
                <button aria-controls="editor-ai-chat-panel" aria-selected={props.aiPanelView === "chat"} className={props.aiPanelView === "chat" ? "active" : ""} id="editor-ai-chat-tab" role="tab" tabIndex={props.aiPanelView === "chat" ? 0 : -1} type="button" onClick={() => props.setAiPanelView("chat")} onKeyDown={handleAiPanelTabKeyDown}>채팅</button>
                <button aria-controls="editor-ai-tools-panel" aria-selected={props.aiPanelView === "tools"} className={props.aiPanelView === "tools" ? "active" : ""} id="editor-ai-tools-tab" role="tab" tabIndex={props.aiPanelView === "tools" ? 0 : -1} type="button" onClick={() => props.setAiPanelView("tools")} onKeyDown={handleAiPanelTabKeyDown}>검사</button>
              </div>
              <div aria-labelledby="editor-ai-chat-tab" className="assistant-panel-subview" hidden={props.aiPanelView !== "chat"} id="editor-ai-chat-panel" role="tabpanel">
                <AiChatPanel projectId={props.projectId} deck={props.deck} currentSlide={props.currentSlide} selectedElementIds={props.selectedElementIds} chatState={props.aiChatState} onChatStateChange={props.onAiChatStateChange} onProposalApplied={props.onProposalApplied} />
              </div>
              <div aria-labelledby="editor-ai-tools-tab" className="assistant-panel-subview editor-ai-tools-subview" hidden={props.aiPanelView !== "tools"} id="editor-ai-tools-panel" role="tabpanel">
                <PptxImportQualityPanel state={props.pptxImportState} />
                <ValidationPanel items={props.editorValidationItems} onApplyAllTextOverflow={props.onApplyAllValidationTextOverflow} onHighlightElementIds={props.onHighlightElementIds} onTextOverflowAction={props.onTextOverflowAction} />
                <SourceLedgerPanel slide={props.currentSlide} />
                <SemanticCueReviewPanel extractionState={props.semanticCueExtractionState} slide={props.currentSlide} onChange={props.onSemanticCueChange} onExtract={props.onSemanticCueExtract} />
              </div>
            </div>
          </section>
        </>
      ) : !props.isOpen ? (
        <div className="collapsed-right-rail">
          <button aria-label="속성 패널 펼치기" className="collapse-right-pane-button" title="속성 패널 펼치기" type="button" onClick={() => props.setIsOpen(true)}><Properties aria-hidden="true" size={16} /></button>
        </div>
      ) : null}
    </aside>
  );
}
