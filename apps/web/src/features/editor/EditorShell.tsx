import { createDemoDeck } from "@orbit/editor-core";
import { demoIds } from "@orbit/shared";
import orbitLogo from "../../assets/orbit-logo.png";
import type {
  Chart,
  Deck,
  DeckCanvas,
  DeckElement,
  GetDeckResponse,
  GroupElementProps,
  ImageElementProps,
  Keyword,
  Slide
} from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  Cloud,
  Download,
  FileText,
  FolderPlus,
  Home,
  ImagePlus,
  LayoutTemplate,
  MonitorPlay,
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
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type TopMenu = "file" | "resize" | "editMode" | "quickEdit" | "presentation";
type SlidePanelView = "thumbnail" | "list";
type RightPanelTab = "ai" | "properties";

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json() as Promise<HealthResponse>;
}

async function fetchDeck(projectId: string): Promise<Deck> {
  const response = await fetch(`/api/v1/projects/${projectId}/deck`);
  if (!response.ok) {
    throw new Error("Deck fetch failed");
  }
  const payload = (await response.json()) as GetDeckResponse;
  return payload.deck;
}

export function EditorShell(props: { projectId?: string }) {
  const projectId = props.projectId ?? demoIds.projectId;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isDataViewOpen, setIsDataViewOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isSlidesPaneCollapsed, setIsSlidesPaneCollapsed] = useState(false);
  const [slidesPaneWidth, setSlidesPaneWidth] = useState(defaultSlidesPaneWidth);
  const [slidePanelView, setSlidePanelView] =
    useState<SlidePanelView>("thumbnail");
  const [showIds, setShowIds] = useState(false);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("ai");
  const [activeTopMenu, setActiveTopMenu] = useState<TopMenu | null>(null);
  const [manualSaveStatus, setManualSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const topbarRef = useRef<HTMLElement | null>(null);

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

  const deck = deckQuery.data ?? fallbackDeck;
  const isUsingFallbackDeck = !deckQuery.data;
  const isDeckLoading = deckQuery.isPending;
  const isDeckError = deckQuery.isError;
  const hasSlides = deck.slides.length > 0;
  const currentSlide = deck.slides[currentSlideIndex] ?? deck.slides[0] ?? null;
  const saveStatusLabel =
    manualSaveStatus === "saving"
      ? "저장 중"
      : manualSaveStatus === "saved"
        ? "수동 저장됨"
        : manualSaveStatus === "error"
          ? "저장 실패"
          : deckQuery.data
            ? "저장됨"
            : "로컬 데모";
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

  async function handleManualSave() {
    if (manualSaveStatus === "saving") return;

    setManualSaveStatus("saving");

    try {
      const deckToSave: Deck = {
        ...deck,
        deckId: deckQuery.data?.deckId ?? `deck_${crypto.randomUUID()}`,
        projectId,
        version: Math.max(1, deck.version)
      };

      const response = await fetch(`/api/v1/projects/${projectId}/deck`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          deck: deckToSave,
          snapshotReason: "deck-replaced"
        })
      });

      if (!response.ok) {
        throw new Error((await response.text()) || "Deck save failed");
      }

      await deckQuery.refetch();
      setManualSaveStatus("saved");
    } catch {
      setManualSaveStatus("error");
    }
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

  return (
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
          <span className="save-state">{saveStatusLabel}</span>
        </div>

        <div className="top-actions">
          <span className="avatar">김</span>
          <button
            className={`header-chip-button ${manualSaveStatus === "saved" ? "active" : ""}`}
            type="button"
            onClick={() => void handleManualSave()}
            disabled={manualSaveStatus === "saving"}
            title="수동 저장"
          >
            <Cloud size={15} />
            {manualSaveStatus === "saving" ? "저장 중" : "저장"}
          </button>
          <button
            className={`header-chip-button ${isRightPanelOpen ? "active" : ""}`}
            type="button"
            onClick={() => setIsRightPanelOpen((current) => !current)}
          >
            {isRightPanelOpen ? (
              <PanelRightClose size={15} />
            ) : (
              <PanelRightOpen size={15} />
            )}
            AI
          </button>
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
            }px`
          } as CSSProperties
        }
      >
        <aside
          className={`slides-pane ${isSlidesPaneCollapsed ? "collapsed" : ""}`}
        >
          <div className="slides-pane-header">
            {!isSlidesPaneCollapsed ? (
              <button className="add-slide-button" type="button">
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
                      {slide.title || `슬라이드 ${index + 1}`}
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
          <div className="editor-toolbar">
            <div className="tool-group">
              <button className="icon-button" type="button" title="Undo">
                ‹
              </button>
              <button className="icon-button" type="button" title="Redo">
                ›
              </button>
              <button className="icon-button selected-tool" type="button" title="Select">
                ⌖
              </button>
              <div className="toolbar-divider" />
              <button className="tool-button active" type="button">
                <Type size={14} />
                텍스트
              </button>
              <button className="tool-button" type="button">
                <Shapes size={14} />
                도형
              </button>
              <button className="tool-button" type="button">
                <ImagePlus size={14} />
                이미지
              </button>
              <button className="tool-button" type="button">
                <BarChart3 size={14} />
                차트
              </button>
            </div>

            <div className="tool-group">
              <button className="tool-button" type="button">
                그룹
              </button>
              <button className="tool-button" type="button">
                <LayoutTemplate size={14} />
                템플릿
              </button>
              <button
                className={`tool-button ${showIds ? "active" : ""}`}
                type="button"
                onClick={() => setShowIds((current) => !current)}
              >
                ID
              </button>
            </div>
          </div>

          <div className="canvas-scroll">
            <EditorStateNotice
              isError={isDeckError}
              isLoading={isDeckLoading}
              isUsingFallback={isUsingFallbackDeck}
            />
            <div className="workspace-summary">
              {showIds ? (
                <div className="summary-chip id-summary-chip">
                  <IdBadge id={deck.projectId} />
                </div>
              ) : null}
              <div className="summary-chip">
                {deck.canvas.preset} / {deck.canvas.width} × {deck.canvas.height}
              </div>
              <div className="summary-chip">v{deck.version}</div>
              <div className="summary-chip">
                {deck.metadata.language} / {deck.metadata.locale}
              </div>
              <div className="summary-chip save-conflict-chip">
                충돌 없음 · base v{deck.version}
              </div>
            </div>

            {currentSlide ? (
              <div className="konva-wrap">
                <div
                  className="konva-stage-shell orbit-stage-shell"
                  style={{
                    width: deck.canvas.width * stageScale,
                    height: deck.canvas.height * stageScale,
                    background:
                      currentSlide.style.backgroundColor ?? deck.theme.backgroundColor,
                    color: currentSlide.style.textColor ?? deck.theme.textColor,
                    borderRadius: deck.theme.effects.borderRadius * 0.8
                  }}
                >
                  {currentSlide.style.backgroundImage ? (
                    <div
                      className="background-image-overlay"
                      style={{
                        opacity: currentSlide.style.backgroundImage.opacity
                      }}
                    >
                      <span>{currentSlide.style.backgroundImage.src}</span>
                      <small>
                        {currentSlide.style.backgroundImage.alt} ·{" "}
                        {currentSlide.style.backgroundImage.fit}
                      </small>
                    </div>
                  ) : null}

                  {visibleElements.map((element) => (
                    <SlideElementView
                      key={element.elementId}
                      deck={deck}
                      element={element}
                      isSelected={element.elementId === selectedElementId}
                      showIds={showIds}
                      slide={currentSlide}
                      stageScale={stageScale}
                      onSelect={() => {
                        setSelectedElementId(element.elementId);
                        setRightPanelTab("properties");
                      }}
                    />
                  ))}
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

        {isRightPanelOpen ? (
          <aside className="ai-pane">
            <div className="ai-header">
              <h2>{rightPanelTab === "ai" ? "AI" : "속성"}</h2>
              <div>
                <button
                  type="button"
                  title="Close AI panel"
                  onClick={() => setIsRightPanelOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="right-panel-tabs" role="tablist" aria-label="Right panel">
              <button
                aria-selected={rightPanelTab === "ai"}
                className={rightPanelTab === "ai" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setRightPanelTab("ai")}
              >
                AI
              </button>
              <button
                aria-selected={rightPanelTab === "properties"}
                className={rightPanelTab === "properties" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setRightPanelTab("properties")}
              >
                속성
              </button>
            </div>
            {rightPanelTab === "ai" ? (
              <div className="assistant-panel-slot" />
            ) : (
              <ElementInspector
                element={selectedElement}
                showIds={showIds}
              />
            )}
          </aside>
        ) : null}
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
    </main>
  );
}

function buildSlideThumbBackground(slide: Slide, deck: Deck) {
  const background = slide.style.backgroundColor ?? deck.theme.backgroundColor;
  const accent = slide.style.accentColor ?? deck.theme.accentColor;

  return [
    "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.18))",
    `linear-gradient(90deg, ${accent} 0 20%, transparent 20% 28%, ${accent} 28% 55%, transparent 55% 64%, ${accent} 64% 84%, transparent 84%)`,
    background
  ].join(",");
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

function ElementInspector(props: {
  element: DeckElement | null;
  showIds: boolean;
}) {
  const { element, showIds } = props;

  if (!element) {
    return (
      <section className="property-panel empty">
        <strong>선택된 요소 없음</strong>
        <p>캔버스의 텍스트, 도형, 이미지, 차트를 선택하면 정보가 표시됩니다.</p>
      </section>
    );
  }

  return (
    <section className="property-panel">
      <div className="property-panel-header">
        <div>
          <span>{element.type}</span>
          <strong>{element.role ?? "role 없음"}</strong>
        </div>
        {showIds ? <IdBadge id={element.elementId} /> : null}
      </div>

      <div className="property-grid">
        <PropertyMetric label="x" value={Math.round(element.x)} />
        <PropertyMetric label="y" value={Math.round(element.y)} />
        <PropertyMetric label="w" value={Math.round(element.width)} />
        <PropertyMetric label="h" value={Math.round(element.height)} />
      </div>

      <div className="property-list">
        <PropertyRow label="rotation" value={`${element.rotation}deg`} />
        <PropertyRow label="opacity" value={String(element.opacity)} />
        <PropertyRow label="zIndex" value={String(element.zIndex)} />
        <PropertyRow label="locked" value={element.locked ? "true" : "false"} />
        <PropertyRow label="visible" value={element.visible ? "true" : "false"} />
      </div>

      <div className="property-props">
        <strong>주요 props</strong>
        <div className="property-list">
          {summarizeElementProps(element).map((line) => (
            <PropertyRow key={line.label} label={line.label} value={line.value} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PropertyMetric(props: { label: string; value: number }) {
  return (
    <div className="property-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PropertyRow(props: { label: string; value: string }) {
  return (
    <div className="property-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function summarizeElementProps(element: DeckElement) {
  if (element.type === "text") {
    return [
      { label: "text", value: truncateValue(element.props.text, 72) },
      { label: "fontSize", value: String(element.props.fontSize) },
      { label: "fontWeight", value: String(element.props.fontWeight) },
      { label: "color", value: element.props.color ?? "theme" }
    ];
  }

  if (element.type === "image") {
    const imageProps = element.props as ImageElementProps;

    return [
      { label: "src", value: truncateValue(imageProps.src, 72) },
      { label: "alt", value: imageProps.alt || "none" },
      { label: "fit", value: imageProps.fit }
    ];
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;

    return [
      { label: "chartType", value: chart.type },
      { label: "title", value: chart.title || "none" },
      { label: "data", value: `${chart.data.length}개` },
      { label: "colors", value: chart.style.colors.join(", ") || "theme" }
    ];
  }

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;

    return [
      {
        label: "children",
        value: groupProps.childElementIds.join(", ") || "none"
      }
    ];
  }

  if (element.type === "customShape") {
    return [
      { label: "props", value: truncateValue(JSON.stringify(element.props), 96) }
    ];
  }

  return [
    { label: "fill", value: element.props.fill },
    { label: "stroke", value: element.props.stroke },
    { label: "strokeWidth", value: String(element.props.strokeWidth) }
  ];
}

function truncateValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function IdBadge(props: { id: string }) {
  return (
    <span className={`id-badge id-badge-${getIdKind(props.id)}`}>
      {props.id}
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

function SlideElementView(props: {
  deck: Deck;
  element: DeckElement;
  isSelected: boolean;
  showIds: boolean;
  slide: Slide;
  stageScale: number;
  onSelect: () => void;
}) {
  const { deck, element, isSelected, onSelect, showIds, slide, stageScale } =
    props;
  const commonStyle = {
    left: element.x * stageScale,
    top: element.y * stageScale,
    width: element.width * stageScale,
    height: element.height * stageScale,
    opacity: element.visible ? element.opacity : 0,
    transform: `rotate(${element.rotation}deg)`
  } satisfies CSSProperties;
  const interactiveProps = {
    onClick: onSelect,
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    },
    role: "button",
    tabIndex: 0
  };
  const selectedClass = isSelected ? " selected" : "";

  if (element.type === "text") {
    return (
      <div
        className={`stage-element text-element${selectedClass}`}
        {...interactiveProps}
        style={{
          ...commonStyle,
          color: element.props.color ?? slide.style.textColor ?? deck.theme.textColor,
          fontFamily:
            element.props.fontFamily ??
            slide.style.fontFamily ??
            deck.theme.typography.bodyFontFamily,
          fontSize: element.props.fontSize * stageScale,
          fontWeight: String(element.props.fontWeight),
          lineHeight: String(element.props.lineHeight),
          justifyContent:
            element.props.verticalAlign === "middle"
              ? "center"
              : element.props.verticalAlign === "bottom"
                ? "flex-end"
                : "flex-start",
          textAlign: element.props.align
        }}
      >
        <span>{element.props.text}</span>
        {showIds ? (
          <small className="element-meta">
            <IdBadge id={element.elementId} />
            {element.role ? <span className="role-badge">{element.role}</span> : null}
          </small>
        ) : null}
      </div>
    );
  }

  if (element.type === "image") {
    const imageProps = element.props as ImageElementProps;
    return (
      <div
        className={`stage-element media-card${selectedClass}`}
        {...interactiveProps}
        style={commonStyle}
      >
        <strong>image</strong>
        {showIds ? <IdBadge id={element.elementId} /> : null}
        <span>{imageProps.src}</span>
        <small>
          {imageProps.alt || "no alt"} · fit {imageProps.fit}
        </small>
      </div>
    );
  }

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    return (
      <div
        className={`stage-element group-card${selectedClass}`}
        {...interactiveProps}
        style={commonStyle}
      >
        <strong>group</strong>
        {showIds ? <IdBadge id={element.elementId} /> : null}
        <span>{groupProps.childElementIds.join(", ") || "no children"}</span>
      </div>
    );
  }

  if (element.type === "customShape") {
    return (
      <div
        className={`stage-element custom-card${selectedClass}`}
        {...interactiveProps}
        style={commonStyle}
      >
        <strong>customShape</strong>
        {showIds ? <IdBadge id={element.elementId} /> : null}
        <pre>{JSON.stringify(element.props, null, 2)}</pre>
      </div>
    );
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;
    return (
      <div
        className={`stage-element chart-card${selectedClass}`}
        {...interactiveProps}
        style={commonStyle}
      >
        <strong>
          {chart.type} chart {chart.title ? `· ${chart.title}` : ""}
        </strong>
        {showIds ? <IdBadge id={element.elementId} /> : null}
        <div className="chart-bars">
          {chart.data.slice(0, 5).map((datum, index) => {
            const value = "value" in datum ? datum.value : datum.y;
            const label = datum.label ?? `item-${index + 1}`;
            return (
              <div className="chart-bar-row" key={`${label}-${index}`}>
                <span>{label}</span>
                <div className="chart-bar-track">
                  <div
                    className="chart-bar-fill"
                    style={{
                      width: `${Math.max(12, Math.min(100, Math.abs(value)))}%`,
                      background:
                        chart.style.colors[index] ??
                        slide.style.accentColor ??
                        deck.theme.accentColor
                    }}
                  />
                </div>
                <small>{String(value)}</small>
              </div>
            );
          })}
        </div>
        <small className="element-meta">
          legend {chart.style.legendPosition} · unit {chart.style.unit || "none"}
        </small>
      </div>
    );
  }

  const shadow = element.props.shadow;
  const shapeStyle: CSSProperties = {
    ...commonStyle,
    background:
      element.type === "line" || element.type === "arrow"
        ? "transparent"
        : element.props.fill === "transparent"
          ? "rgba(49, 87, 245, 0.08)"
          : element.props.fill,
    border:
      element.type === "line" || element.type === "arrow"
        ? "none"
        : `${Math.max(1, element.props.strokeWidth * stageScale)}px solid ${
            element.props.stroke === "transparent"
              ? "rgba(16, 24, 40, 0.18)"
              : element.props.stroke
          }`,
    borderRadius:
      element.type === "ellipse"
        ? "999px"
        : `${element.props.borderRadius * stageScale}px`,
    boxShadow: shadow
      ? `${shadow.offsetX * stageScale}px ${shadow.offsetY * stageScale}px ${
          shadow.blur * stageScale
        }px rgba(0, 0, 0, ${shadow.opacity})`
      : undefined
  };

  return (
    <div
      className={`stage-element shape-element shape-${element.type}${selectedClass}`}
      {...interactiveProps}
      style={shapeStyle}
    >
      <span>{element.type}</span>
      {showIds ? (
        <small className="element-meta">
          <IdBadge id={element.elementId} />
          {element.role ? <span className="role-badge">{element.role}</span> : null}
        </small>
      ) : null}
    </div>
  );
}
