import type { ApplyDesignAgentProposalResponse, Deck, SemanticCue, Slide } from "@orbit/shared";
import {
  IconLayoutSidebarRightCollapse as PanelRightClose,
  IconLayoutSidebarRightExpand as PanelRightOpen
} from "@tabler/icons-react";
import { useRef, type Dispatch, type KeyboardEvent, type PointerEvent, type ReactNode, type SetStateAction } from "react";

import { SourceLedgerPanel } from "../../ai/quality/SourceLedgerPanel";
import { ValidationPanel } from "../../ai/quality/ValidationPanel";
import type {
  EditorValidationPresentationItem,
  EditorValidationTargetView,
} from "../../ai/quality/validationPresentation";
import {
  SemanticCueReviewPanel,
  type SemanticCueExtractionUiState
} from "../../semantic-cues/SemanticCueReviewPanel";
import { AiChatPanel, type AiChatState } from "./AiChatPanel";
import {
  PptxImportQualityPanel,
  type PptxImportState
} from "./PptxImportQualityPanel";

export type RightPanelView = "journey" | "ai" | "design";
export type AiPanelView = "chat" | "tools" | "semantic-cues";

type EditorRightPanelProps = {
  aiChatState: AiChatState;
  aiPanelView: AiPanelView;
  canRepairValidation: boolean;
  canUseAiMutations: boolean;
  currentSlide: Slide | null;
  deck: Deck;
  designProperties: ReactNode;
  editorValidationItems: EditorValidationPresentationItem[];
  isOpen: boolean;
  journeyPanel: ReactNode;
  onAiChatStateChange: Dispatch<SetStateAction<AiChatState>>;
  onFocusValidationTarget: (target: EditorValidationTargetView) => void;
  onHighlightElementIds: (elementIds: string[]) => void;
  onProposalApplied: (response: ApplyDesignAgentProposalResponse) => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onSemanticCueChange: (semanticCues: SemanticCue[]) => void;
  onSemanticCueExtract: (force: boolean) => void;
  onRepairTextOverflow: (elementIds?: readonly string[]) => void;
  projectId: string;
  pptxImportState: PptxImportState;
  repairableValidationElementIds: readonly string[];
  validationRepairStatus: string;
  rightPanelView: RightPanelView;
  selectedElementIds: string[];
  semanticCueExtractionState: SemanticCueExtractionUiState;
  setAiPanelView: Dispatch<SetStateAction<AiPanelView>>;
  setIsOpen: (open: boolean) => void;
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>;
};

export function EditorRightPanel(props: EditorRightPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);

  function setPanelOpenWithFocus(open: boolean) {
    props.setIsOpen(open);
    requestAnimationFrame(() => {
      (open ? closeButtonRef.current : openButtonRef.current)?.focus();
    });
  }

  function handleRightPanelTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const views = ["journey", "ai", "design"] as const;
    const currentIndex = views.indexOf(props.rightPanelView);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextView = views[(currentIndex + direction + views.length) % views.length];
    props.setRightPanelView(nextView);
    requestAnimationFrame(() => document.getElementById(`editor-${nextView}-tab`)?.focus());
  }

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
    <aside
      className={`ai-pane ${props.isOpen ? "" : "collapsed"}`}
      data-testid="editor-inspector-pane"
    >
      {props.isOpen ? (
        <>
          <button aria-label="오른쪽 패널 크기 조정" className="right-pane-resizer" type="button" onPointerDown={props.onResizeStart} />
          <div className="ai-header">
            <h2>편집 패널</h2>
            <div>
              <button aria-label="오른쪽 패널 접기" className="collapse-right-pane-button" ref={closeButtonRef} title="오른쪽 패널 접기" type="button" onClick={() => setPanelOpenWithFocus(false)}>
                <PanelRightClose size={16} />
              </button>
            </div>
          </div>
          <div aria-label="오른쪽 패널 보기" className="right-panel-tabs" role="tablist">
            <button aria-controls="editor-journey-panel" aria-selected={props.rightPanelView === "journey"} className={props.rightPanelView === "journey" ? "active" : ""} id="editor-journey-tab" role="tab" tabIndex={props.rightPanelView === "journey" ? 0 : -1} type="button" onClick={() => props.setRightPanelView("journey")} onKeyDown={handleRightPanelTabKeyDown}>준비 경로</button>
            <button aria-controls="editor-ai-panel" aria-selected={props.rightPanelView === "ai"} className={props.rightPanelView === "ai" ? "active" : ""} id="editor-ai-tab" role="tab" tabIndex={props.rightPanelView === "ai" ? 0 : -1} type="button" onClick={() => props.setRightPanelView("ai")} onKeyDown={handleRightPanelTabKeyDown}>AI 코치</button>
            <button aria-controls="editor-design-panel" aria-selected={props.rightPanelView === "design"} className={props.rightPanelView === "design" ? "active" : ""} id="editor-design-tab" role="tab" tabIndex={props.rightPanelView === "design" ? 0 : -1} type="button" onClick={() => props.setRightPanelView("design")} onKeyDown={handleRightPanelTabKeyDown}>디자인</button>
          </div>
          <div className="assistant-panel-slot">
            <div aria-labelledby="editor-journey-tab" className="assistant-panel-view editor-journey-panel" hidden={props.rightPanelView !== "journey"} id="editor-journey-panel" role="tabpanel">
              {props.journeyPanel}
            </div>
            <div aria-labelledby="editor-ai-tab" className="assistant-panel-view editor-ai-coach-panel" hidden={props.rightPanelView !== "ai"} id="editor-ai-panel" role="tabpanel">
              <div aria-label="AI 코치 보기" className="assistant-subtabs" role="tablist">
                <button aria-controls="editor-ai-chat-panel" aria-selected={props.aiPanelView === "chat"} className={props.aiPanelView === "chat" ? "active" : ""} id="editor-ai-chat-tab" role="tab" tabIndex={props.aiPanelView === "chat" ? 0 : -1} type="button" onClick={() => props.setAiPanelView("chat")} onKeyDown={handleAiPanelTabKeyDown}>채팅</button>
                <button aria-controls="editor-ai-tools-panel" aria-selected={props.aiPanelView === "tools"} className={props.aiPanelView === "tools" ? "active" : ""} id="editor-ai-tools-tab" role="tab" tabIndex={props.aiPanelView === "tools" ? 0 : -1} type="button" onClick={() => props.setAiPanelView("tools")} onKeyDown={handleAiPanelTabKeyDown}>검사</button>
              </div>
              <div aria-labelledby="editor-ai-chat-tab" className="assistant-panel-subview" hidden={props.aiPanelView !== "chat"} id="editor-ai-chat-panel" role="tabpanel">
                {props.canUseAiMutations ? (
                  <AiChatPanel projectId={props.projectId} deck={props.deck} currentSlide={props.currentSlide} selectedElementIds={props.selectedElementIds} chatState={props.aiChatState} onChatStateChange={props.onAiChatStateChange} onProposalApplied={props.onProposalApplied} />
                ) : (
                  <p className="editor-read-only-tool-message">보기 전용에서는 AI 편집을 실행할 수 없습니다.</p>
                )}
              </div>
              <div aria-labelledby="editor-ai-tools-tab" className="assistant-panel-subview editor-ai-tools-subview" hidden={props.aiPanelView !== "tools"} id="editor-ai-tools-panel" role="tabpanel">
                <PptxImportQualityPanel state={props.pptxImportState} />
                <ValidationPanel
                  canRepair={props.canRepairValidation}
                  items={props.editorValidationItems}
                  onFocusTarget={props.onFocusValidationTarget}
                  onHighlightElementIds={props.onHighlightElementIds}
                  onRepairTextOverflow={props.onRepairTextOverflow}
                  repairableElementIds={props.repairableValidationElementIds}
                  repairStatus={props.validationRepairStatus}
                />
                <SourceLedgerPanel slide={props.currentSlide} />
                {props.canUseAiMutations ? <SemanticCueReviewPanel extractionState={props.semanticCueExtractionState} slide={props.currentSlide} onChange={props.onSemanticCueChange} onExtract={props.onSemanticCueExtract} /> : null}
              </div>
            </div>
            <div aria-labelledby="editor-design-tab" className="assistant-panel-view editor-design-panel" hidden={props.rightPanelView !== "design"} id="editor-design-panel" role="tabpanel">
              <span className="orbit-ds-eyebrow">SLIDE DESIGN</span>
              <h3>현재 슬라이드</h3>
              <p>슬라이드와 덱의 기본 시각 속성을 조정합니다.</p>
              {props.designProperties}
            </div>
          </div>
        </>
      ) : (
        <div className="collapsed-right-rail">
          <button aria-label="오른쪽 패널 펼치기" className="collapse-right-pane-button" ref={openButtonRef} title="오른쪽 패널 펼치기" type="button" onClick={() => setPanelOpenWithFocus(true)}><PanelRightOpen size={16} /></button>
          <span>도구</span>
        </div>
      )}
    </aside>
  );
}
