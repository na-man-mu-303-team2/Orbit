import { runtimeConfigResponseSchema, type Deck, type Slide } from "@orbit/shared";
import {
  IconChartBar as ChartBar,
  IconChevronDown as ChevronDown,
  IconFileText as FileText,
  IconGripHorizontal as GripHorizontal,
  IconMessageQuestion as MessageQuestion,
  IconMicrophone as Microphone,
} from "@tabler/icons-react";
import {
  cloneElement,
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import { SlidePracticeHistoryPanel } from "../../practice/SlidePracticeHistoryPanel";
import { SlidePracticePanel } from "../../practice/SlidePracticePanel";
import { SlideQuestionGuidePanel } from "../../practice/SlideQuestionGuidePanel";
import type { SpeakerNotesPanelProps } from "./SpeakerNotesPanel";

type DockTab = "notes" | "practice" | "questions" | "analysis";

export function EditorBottomDock(props: {
  projectId: string;
  deck: Deck;
  currentSlide: Slide | null;
  notesPanel: ReactElement<SpeakerNotesPanelProps>;
  height: number;
  isExpanded: boolean;
  isResizing: boolean;
  maxHeight: number;
  minHeight: number;
  onResizeKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTogglePanel: () => void;
  flushPendingSaves: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<DockTab>("notes");
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [featureFlags, setFeatureFlags] = useState({ practice: false, questions: false });
  const notesEditing = props.notesPanel.props.isEditing;

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/runtime-config", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Runtime config request failed");
        return runtimeConfigResponseSchema.parse(await response.json());
      })
      .then((config) => {
        if (!active) return;
        setFeatureFlags({
          practice: config.slidePracticeEnabled,
          questions: config.slideQuestionGuidesEnabled,
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if ((activeTab === "practice" || activeTab === "analysis") && !featureFlags.practice) setActiveTab("notes");
    if (activeTab === "questions" && !featureFlags.questions) setActiveTab("notes");
  }, [activeTab, featureFlags]);

  function selectTab(tab: DockTab) {
    if (notesEditing && tab !== "notes") return;
    setActiveTab(tab);
    if (!props.isExpanded) props.onTogglePanel();
  }

  return (
    <section
      aria-label="에디터 하단 도구"
      className={`script-panel stage-speaker-notes-panel editor-bottom-dock ${props.isExpanded ? "expanded" : "collapsed"} ${props.isResizing ? "is-resizing" : ""}`}
      style={{ "--speaker-notes-panel-height": `${props.height}px` } as CSSProperties}
    >
      {props.isExpanded ? (
        <button
          aria-label="하단 도크 높이 조절"
          aria-orientation="horizontal"
          aria-valuemax={props.maxHeight}
          aria-valuemin={props.minHeight}
          aria-valuenow={props.height}
          className="speaker-notes-resize-handle"
          disabled={notesEditing}
          role="separator"
          type="button"
          onKeyDown={props.onResizeKeyDown}
          onPointerDown={props.onResizeStart}
        >
          <GripHorizontal aria-hidden="true" size={18} stroke={1.7} />
        </button>
      ) : null}
      <div className="editor-bottom-dock-header">
        <div aria-label="슬라이드 도구" className="editor-bottom-dock-tabs" role="tablist">
          <DockTabButton active={activeTab === "notes"} icon={<FileText size={16} />} label="발표 메모" onClick={() => selectTab("notes")} />
          {featureFlags.practice ? <DockTabButton active={activeTab === "practice"} disabled={notesEditing} icon={<Microphone size={16} />} label="바로 연습" onClick={() => selectTab("practice")} /> : null}
          {featureFlags.questions ? <DockTabButton active={activeTab === "questions"} disabled={notesEditing} icon={<MessageQuestion size={16} />} label="예상 질문" onClick={() => selectTab("questions")} /> : null}
          {featureFlags.practice ? <DockTabButton active={activeTab === "analysis"} disabled={notesEditing} icon={<ChartBar size={16} />} label="연습 기록" onClick={() => selectTab("analysis")} /> : null}
        </div>
        <button
          aria-expanded={props.isExpanded}
          aria-label={props.isExpanded ? "하단 도크 접기" : "하단 도크 펼치기"}
          className="editor-bottom-dock-toggle"
          disabled={notesEditing}
          type="button"
          onClick={props.onTogglePanel}
        >
          <ChevronDown aria-hidden="true" size={17} />
        </button>
      </div>
      <div className="editor-bottom-dock-content" hidden={!props.isExpanded}>
        <div hidden={activeTab !== "notes"} role="tabpanel">
          {cloneElement(props.notesPanel, { embedded: true, isExpanded: props.isExpanded, isResizing: false })}
        </div>
        {featureFlags.practice ? <div hidden={activeTab !== "practice"} role="tabpanel">
          <SlidePracticePanel
            deck={props.deck}
            projectId={props.projectId}
            slide={props.currentSlide}
            onReportCreated={() => setHistoryRefreshToken((current) => current + 1)}
          />
        </div> : null}
        {featureFlags.questions ? <div hidden={activeTab !== "questions"} role="tabpanel">
          <SlideQuestionGuidePanel
            deck={props.deck}
            flushPendingSaves={props.flushPendingSaves}
            projectId={props.projectId}
            slide={props.currentSlide}
          />
        </div> : null}
        {featureFlags.practice ? <div hidden={activeTab !== "analysis"} role="tabpanel">
          <SlidePracticeHistoryPanel
            deck={props.deck}
            projectId={props.projectId}
            refreshToken={historyRefreshToken}
            slide={props.currentSlide}
          />
        </div> : null}
      </div>
    </section>
  );
}

function DockTabButton(props: {
  active: boolean;
  disabled?: boolean;
  icon: ReactElement;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={props.active}
      className={props.active ? "active" : ""}
      disabled={props.disabled}
      role="tab"
      type="button"
      onClick={props.onClick}
    >
      {props.icon}<span>{props.label}</span>
    </button>
  );
}
