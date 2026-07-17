import type { Keyword, Slide } from "@orbit/shared";
import {
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconFileText as FileText,
  IconGripHorizontal as GripHorizontal,
  IconPencil as PenLine,
  IconSparkles as Sparkles,
  IconX as X
} from "@tabler/icons-react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { useState } from "react";

import type { KeywordUsageSummary } from "./KeywordInspector";
import {
  KeywordDetail,
  KeywordHighlightedNotes,
  KeywordList
} from "./KeywordInspector";
import { SpeakerNotesLengthMeter } from "./SpeakerNotesAssistantDialog";
import type { getSpeakerNotesLengthGuidance } from "../speakerNotesAssistant";

type SpeakerNotesTab = "script" | "qna" | "report";

const speakerNotesTabs: Array<{ id: SpeakerNotesTab; label: string }> = [
  { id: "script", label: "대본" },
  { id: "qna", label: "QnA" },
  { id: "report", label: "리포트" }
];

export function SpeakerNotesPanel(props: {
  contentRef: RefObject<HTMLDivElement | null>;
  currentSlide: Slide | null;
  draft: string;
  guidance: ReturnType<typeof getSpeakerNotesLengthGuidance>;
  height: number;
  isEditing: boolean;
  isExpanded: boolean;
  isResizing: boolean;
  maxHeight: number;
  minHeight: number;
  onCancelEdit: () => void;
  onClearKeyword: () => void;
  onDeleteKeyword: () => void;
  onDraftChange: (draft: string) => void;
  onOpenAssistant: () => void;
  onResizeKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSaveEdit: () => void;
  onSelectKeyword: (keywordId: string, occurrenceKey?: string | null) => void;
  onSelectKeywordText: (value: string, start: number) => void;
  onStartEdit: () => void;
  onToggleAdvanceSlide: () => void;
  onTogglePanel: () => void;
  onToggleRequired: () => void;
  selectedKeyword: Keyword | null;
  selectedKeywordId: string | null;
  selectedKeywordOccurrenceKey: string | null;
  selectedKeywordRequiredActive: boolean;
  selectedKeywordUsage: KeywordUsageSummary | null;
  showIds: boolean;
  usageByKeywordId: Record<string, KeywordUsageSummary>;
}) {
  const [activeTab, setActiveTab] = useState<SpeakerNotesTab>("script");
  const notesPreview = (props.currentSlide?.speakerNotes ?? "").trim();

  return (
    <section
      aria-labelledby="speaker-notes-title"
      className={`script-panel stage-speaker-notes-panel ${
        props.isExpanded ? "expanded" : "collapsed"
      } ${props.isEditing ? "editing" : ""} ${
        props.isResizing ? "is-resizing" : ""
      }`}
      style={
        {
          "--speaker-notes-panel-height": `${props.height}px`
        } as CSSProperties
      }
    >
      {props.isExpanded ? (
        <button
          aria-disabled={props.isEditing}
          aria-label="발표 메모 높이 조절"
          aria-orientation="horizontal"
          aria-valuemax={props.maxHeight}
          aria-valuemin={props.minHeight}
          aria-valuenow={props.height}
          className="speaker-notes-resize-handle"
          role="separator"
          tabIndex={props.isEditing ? -1 : 0}
          type="button"
          onKeyDown={props.onResizeKeyDown}
          onPointerDown={props.onResizeStart}
        >
          <GripHorizontal aria-hidden="true" size={18} stroke={1.7} />
        </button>
      ) : null}
      <div className="script-panel-header">
        <span className="visually-hidden" id="speaker-notes-title">발표 메모</span>
        {props.isExpanded ? (
          <>
            <div aria-label="발표 준비 자료" className="speaker-notes-tabs" role="tablist">
              {speakerNotesTabs.map((tab) => (
                <button
                  aria-controls={`speaker-notes-${tab.id}-panel`}
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  disabled={props.isEditing && tab.id !== "script"}
                  id={`speaker-notes-${tab.id}-tab`}
                  key={tab.id}
                  role="tab"
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {props.isEditing ? <span className="script-panel-status">편집 중</span> : null}
            <button
              aria-controls="speaker-notes-content"
              aria-expanded="true"
              aria-label="발표 메모 접기"
              className="speaker-notes-collapse-button"
              disabled={props.isEditing}
              title="발표 메모 접기"
              type="button"
              onClick={props.onTogglePanel}
            >
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          </>
        ) : (
          <button
            aria-controls="speaker-notes-content"
            aria-expanded="false"
            aria-label="발표 메모 펼치기"
            className="script-panel-heading speaker-notes-toggle"
            type="button"
            onClick={props.onTogglePanel}
          >
            <span aria-hidden="true" className="script-panel-icon"><FileText size={18} /></span>
            <div className="speaker-notes-toggle-copy">
              <div className="script-panel-title-row">
                <strong>발표 메모</strong>
              </div>
              <span className="speaker-notes-preview">
                {notesPreview || "발표자 노트를 추가하려면 클릭하세요."}
              </span>
            </div>
            <ChevronDown aria-hidden="true" className="speaker-notes-toggle-chevron" size={16} />
          </button>
        )}
      </div>
      <div id="speaker-notes-content" hidden={!props.isExpanded} ref={props.contentRef}>
        {activeTab === "script" ? (
          <div
            aria-labelledby="speaker-notes-script-tab"
            id="speaker-notes-script-panel"
            role="tabpanel"
          >
            {props.isExpanded ? (
              <div className="speaker-notes-action-row">
                {props.isEditing ? (
                  <div className="script-panel-actions">
                    <button aria-label="메모 편집 취소" className="script-panel-action" title="취소" type="button" onClick={props.onCancelEdit}>
                      <X aria-hidden="true" size={15} />
                    </button>
                    <button aria-label="메모 저장" className="script-panel-action primary" title="저장" type="button" onClick={props.onSaveEdit}>
                      <Check aria-hidden="true" size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="script-panel-actions">
                    <button
                      aria-label={notesPreview ? "AI로 메모 다듬기" : "AI 메모 초안 만들기"}
                      className="script-panel-action assistant"
                      title={notesPreview ? "AI로 다듬기" : "AI 초안 만들기"}
                      type="button"
                      onClick={props.onOpenAssistant}
                    >
                      <Sparkles aria-hidden="true" size={14} />
                    </button>
                    <button aria-label="메모 편집" className="script-panel-action" title="메모 편집" type="button" onClick={props.onStartEdit}>
                      <PenLine aria-hidden="true" size={14} />
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            {props.isEditing ? (
              <div className="script-panel-body">
                <textarea
                  aria-label="발표 메모 수정"
                  autoFocus
                  className="script-notes-editor"
                  placeholder={"슬라이드에서 말할 내용을 입력하세요.\n문단을 나누면 발표할 때도 그대로 표시됩니다."}
                  value={props.draft}
                  onChange={(event) => props.onDraftChange(event.target.value)}
                />
                <div aria-live="polite" className="script-panel-meta script-panel-character-count">
                  <span>{props.draft.length.toLocaleString()}자</span>
                </div>
                <SpeakerNotesLengthMeter guidance={props.guidance} />
              </div>
            ) : (
              <div className="script-panel-body">
                <div className="script-notes-surface">
                  <KeywordHighlightedNotes
                    keywords={props.currentSlide?.keywords ?? []}
                    notes={props.currentSlide?.speakerNotes ?? ""}
                    selectedKeywordId={props.selectedKeywordId}
                    selectedKeywordOccurrenceKey={props.selectedKeywordOccurrenceKey}
                    showIds={props.showIds}
                    slideId={props.currentSlide?.slideId ?? ""}
                    onSelectKeyword={props.onSelectKeyword}
                    onSelectKeywordText={props.onSelectKeywordText}
                  />
                </div>
                <div className="script-panel-meta script-panel-character-count">
                  <span>{(props.currentSlide?.speakerNotes ?? "").length.toLocaleString()}자</span>
                </div>
                <section aria-labelledby="speaker-notes-keywords-title" className="script-keyword-section">
                  <div className="script-keyword-heading"><strong id="speaker-notes-keywords-title">발표 체크포인트</strong></div>
                  <KeywordList
                    keywords={props.currentSlide?.keywords ?? []}
                    selectedKeywordId={props.selectedKeywordId}
                    showIds={props.showIds}
                    usageByKeywordId={props.usageByKeywordId}
                    onSelectKeyword={props.onSelectKeyword}
                  />
                </section>
                <SpeakerNotesLengthMeter guidance={props.guidance} />
                {props.selectedKeyword ? (
                  <KeywordDetail
                    keyword={props.selectedKeyword}
                    requiredActive={props.selectedKeywordRequiredActive}
                    showIds={props.showIds}
                    usage={props.selectedKeywordUsage}
                    onClearSelection={props.onClearKeyword}
                    onDeleteKeyword={props.onDeleteKeyword}
                    onToggleAdvanceSlide={props.onToggleAdvanceSlide}
                    onToggleRequired={props.onToggleRequired}
                  />
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div
            aria-labelledby={`speaker-notes-${activeTab}-tab`}
            className="speaker-notes-empty-panel"
            id={`speaker-notes-${activeTab}-panel`}
            role="tabpanel"
          >
            <strong>{activeTab === "qna" ? "QnA" : "리포트"}</strong>
            <p>
              {activeTab === "qna"
                ? "예상 질문과 답변이 준비되면 이곳에 표시됩니다."
                : "리허설을 완료하면 슬라이드별 분석 결과가 이곳에 표시됩니다."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
