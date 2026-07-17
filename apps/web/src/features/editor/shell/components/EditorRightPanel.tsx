import type { ApplyDesignAgentProposalResponse, Deck, SemanticCue, Slide } from "@orbit/shared";
import {
  IconAdjustmentsHorizontal as Properties,
  IconLayoutSidebarRightCollapse as PanelRightClose,
  IconLayoutSidebarRightExpand as PanelRightOpen,
  IconSparkles as Sparkles,
  IconX as Close
} from "@tabler/icons-react";
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

export type RightPanelView = "ai" | "design";
export type AiPanelView = "chat" | "tools" | "semantic-cues";

type EditorRightPanelProps = {
  aiChatState: AiChatState;
  aiPanelView: AiPanelView;
  currentSlide: Slide | null;
  deck: Deck;
  designProperties: ReactNode;
  editorValidationItems: EditorValidationItem[];
  isOpen: boolean;
  onAiChatStateChange: Dispatch<SetStateAction<AiChatState>>;
  onApplyAllValidationTextOverflow: () => void;
  onHighlightElementIds: (elementIds: string[]) => void;
  onProposalApplied: (response: ApplyDesignAgentProposalResponse) => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onSemanticCueChange: (semanticCues: SemanticCue[]) => void;
  onSemanticCueExtract: (force: boolean) => void;
  onTextOverflowAction: (
    item: EditorValidationItem,
    action: ValidationTextOverflowAction
  ) => void;
  projectId: string;
  pptxImportState: PptxImportState;
  rightPanelView: RightPanelView;
  selectedElementIds: string[];
  semanticCueExtractionState: SemanticCueExtractionUiState;
  setAiPanelView: Dispatch<SetStateAction<AiPanelView>>;
  setIsOpen: (open: boolean) => void;
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>;
};

export function EditorRightPanel(props: EditorRightPanelProps) {
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
    <aside className={`ai-pane ${props.isOpen ? "" : "collapsed"}`}>
      {props.isOpen ? (
        <>
          <button aria-label="오른쪽 패널 크기 조정" className="right-pane-resizer" type="button" onPointerDown={props.onResizeStart} />
          <div className="inspector-header">
            <div className="inspector-title"><Properties aria-hidden="true" size={15} /><strong>속성</strong></div>
            <div className="inspector-actions">
              <button
                aria-label={props.rightPanelView === "ai" ? "AI 코치 닫기" : "AI 코치 열기"}
                aria-pressed={props.rightPanelView === "ai"}
                className={`ai-coach-toggle ${props.rightPanelView === "ai" ? "active" : ""}`}
                title="AI 코치"
                type="button"
                onClick={() => props.setRightPanelView((current) => current === "ai" ? "design" : "ai")}
              >
                <Sparkles size={16} />
                <span>AI 코치</span>
              </button>
              <button aria-label="오른쪽 패널 접기" className="collapse-right-pane-button" title="오른쪽 패널 접기" type="button" onClick={() => props.setIsOpen(false)}>
                <PanelRightClose size={16} />
              </button>
            </div>
          </div>
          <div className="assistant-panel-slot inspector-panel-slot">
            <div aria-labelledby="editor-design-heading" className="assistant-panel-view editor-design-panel" id="editor-design-panel" role="region">
              <span className="orbit-ds-eyebrow">SLIDE PROPERTIES</span>
              <h3 id="editor-design-heading">현재 슬라이드</h3>
              <p>슬라이드와 덱의 기본 시각 속성을 조정합니다.</p>
              {props.designProperties}
            </div>
          </div>
          {props.rightPanelView === "ai" ? (
            <section aria-label="AI 코치" className="ai-coach-dock" id="editor-ai-panel">
              <header className="ai-coach-dock-header">
                <div><Sparkles aria-hidden="true" size={16} /><strong>AI 코치</strong></div>
                <button aria-label="AI 코치 닫기" title="AI 코치 닫기" type="button" onClick={() => props.setRightPanelView("design")}><Close size={16} /></button>
              </header>
              <div className="editor-ai-coach-panel">
              <div aria-label="AI 코치 보기" className="assistant-subtabs" role="tablist">
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
          ) : null}
        </>
      ) : (
        <div className="collapsed-right-rail">
          <button aria-label="오른쪽 패널 펼치기" className="collapse-right-pane-button" title="오른쪽 패널 펼치기" type="button" onClick={() => props.setIsOpen(true)}><PanelRightOpen size={16} /></button>
          <span>속성</span>
        </div>
      )}
    </aside>
  );
}
