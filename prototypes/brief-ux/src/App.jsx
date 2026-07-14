import { useEffect, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconFileText,
  IconFileTypePpt,
  IconFlag,
  IconInfoCircle,
  IconLayout,
  IconListCheck,
  IconPalette,
  IconPaperclip,
  IconPencil,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
  IconTarget,
  IconUpload,
  IconUsers,
  IconWand,
  IconX,
} from "@tabler/icons-react";

const SCREENS = new Set(["ai-brief", "pptx-import", "editor"]);

const initialBrief = {
  topic: "2026년 하반기 마케팅 전략",
  audience: "경영진",
  purpose: "의사결정",
  duration: "15분",
  outcome: "하반기 핵심 캠페인과 예산 우선순위 승인",
  messages: [
    "성장 모멘텀을 만들 핵심 시장 기회",
    "브랜드 영향력을 확대할 실행 전략",
    "운영 효율을 높일 예산 우선순위",
  ],
  opening: "최근 상반기 성과와 하반기 시장 환경 요약",
  closing: "예산 승인 요청 및 다음 단계 안내",
  lens: "의사결정자",
};

const importedBrief = {
  topic: "2026년 3분기 사업 전략 보고",
  audience: "경영진",
  purpose: "보고",
  duration: "12분",
  outcome: "4분기 실행 전략과 신규 투자 우선순위 승인",
  messages: [
    "3분기 매출은 전년 동기 대비 12% 성장",
    "핵심 사업의 수익성과 운영 효율 개선",
    "신규 투자 2건의 기대 효과와 리스크",
  ],
  opening: "시장 변화와 분기 핵심 성과를 짧게 제시",
  closing: "승인 요청과 담당자별 다음 행동 명시",
  lens: "의사결정자",
};

function screenFromHash() {
  const value = window.location.hash.replace(/^#\/?/, "");
  return SCREENS.has(value) ? value : "ai-brief";
}

function usePrototypeRoute() {
  const [screen, setScreen] = useState(screenFromHash);

  useEffect(() => {
    const onHashChange = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next) => {
    window.location.hash = `/${next}`;
    setScreen(next);
  };

  return [screen, navigate];
}

export function App() {
  const [screen, navigate] = usePrototypeRoute();
  const [brief, setBrief] = useState(initialBrief);
  const [briefSource, setBriefSource] = useState("AI 생성 시 작성");

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, [screen]);

  if (screen === "pptx-import") {
    return (
      <PptxImportScreen
        onBackToAi={() => navigate("ai-brief")}
        onContinue={(nextBrief) => {
          setBrief(nextBrief);
          setBriefSource("PPTX 가져오기에서 자동 정리");
          navigate("editor");
        }}
      />
    );
  }

  if (screen === "editor") {
    return (
      <EditorBriefScreen
        brief={brief}
        briefSource={briefSource}
        onChangeBrief={setBrief}
        onLogoClick={() => navigate("ai-brief")}
      />
    );
  }

  return (
    <AiBriefScreen
      brief={brief}
      onChangeBrief={setBrief}
      onImport={() => navigate("pptx-import")}
      onContinue={() => {
        setBriefSource("AI 생성 시 작성");
        navigate("editor");
      }}
    />
  );
}

function ProductHeader({ active = "프로젝트", onLogoClick }) {
  return (
    <header className="product-header">
      <button className="brand-button" type="button" onClick={onLogoClick} aria-label="ORBIT 홈">
        <img src="/assets/orbit-logo.png" alt="ORBIT" />
      </button>
      <nav aria-label="주요 메뉴">
        {["홈", "프로젝트", "리허설", "리포트"].map((item) => (
          <button className={item === active ? "active" : ""} key={item} type="button">
            {item}
          </button>
        ))}
      </nav>
      <button className="account-button" type="button" aria-label="계정 메뉴">
        <span>T</span>
        <strong>test@test.com</strong>
        <IconChevronDown size={16} />
      </button>
    </header>
  );
}

function StepRail({ active, importMode = false }) {
  const steps = importMode
    ? [
        ["file", "파일 선택"],
        ["brief", "브리프 확인"],
        ["done", "가져오기"],
      ]
    : [
        ["brief", "발표 기준"],
        ["style", "디자인"],
        ["references", "참고자료"],
        ["preview", "생성 확인"],
      ];
  const activeIndex = steps.findIndex(([id]) => id === active);

  return (
    <ol className="step-rail" aria-label="진행 단계">
      {steps.map(([id, label], index) => {
        const complete = index < activeIndex;
        return (
          <li className={id === active ? "active" : complete ? "complete" : ""} key={id}>
            <span>{complete ? <IconCheck size={16} /> : index + 1}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function AiBriefScreen({ brief, onChangeBrief, onImport, onContinue }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const update = (key, value) => onChangeBrief({ ...brief, [key]: value });

  const submit = (event) => {
    event.preventDefault();
    setIsGenerating(true);
    window.setTimeout(onContinue, 650);
  };

  return (
    <div className="prototype-page">
      <ProductHeader onLogoClick={() => {}} />
      <main className="wizard-page">
        <section className="wizard-hero lilac-hero">
          <div>
            <p className="eyebrow"><IconSparkles size={16} /> AI PRESENTATION</p>
            <h1>AI 발표자료 만들기</h1>
            <p>발표 목적을 먼저 맞추면 구성과 리허설 피드백까지 한 방향으로 이어집니다.</p>
          </div>
          <button className="alternative-entry cream" type="button" onClick={onImport}>
            <IconUpload size={20} />
            <span><small>기존 자료가 있다면</small><strong>PPTX 가져오기</strong></span>
            <IconArrowRight size={18} />
          </button>
        </section>

        <div className="wizard-layout">
          <aside className="wizard-steps"><StepRail active="brief" /></aside>
          <form className="brief-form" onSubmit={submit}>
            <div className="section-heading">
              <p className="eyebrow">1. PRESENTATION BRIEF</p>
              <h2>발표 방향을 먼저 맞춰볼게요.</h2>
              <p>이 단계에서만 짧게 정리하고, 발표자료를 만든 뒤에는 필요할 때 다시 열어볼 수 있어요.</p>
            </div>

            <div className="field-grid">
              <Field label="발표 주제" className="wide">
                <input required value={brief.topic} onChange={(event) => update("topic", event.currentTarget.value)} />
              </Field>
              <Field label="청중">
                <select value={brief.audience} onChange={(event) => update("audience", event.currentTarget.value)}>
                  <option>경영진</option><option>팀원</option><option>고객</option><option>파트너</option>
                </select>
              </Field>
              <Field label="발표 목적">
                <select value={brief.purpose} onChange={(event) => update("purpose", event.currentTarget.value)}>
                  <option>의사결정</option><option>설득</option><option>보고</option><option>교육</option>
                </select>
              </Field>
              <Field label="목표 시간">
                <select value={brief.duration} onChange={(event) => update("duration", event.currentTarget.value)}>
                  <option>5분</option><option>10분</option><option>15분</option><option>20분</option>
                </select>
              </Field>
              <Field label="발표 후 원하는 결과" className="span-two">
                <input value={brief.outcome} onChange={(event) => update("outcome", event.currentTarget.value)} />
              </Field>
              <Field label="반드시 전달할 내용" hint="핵심 문장 세 개를 줄바꿈으로 구분해 주세요." className="wide">
                <textarea
                  rows={4}
                  value={brief.messages.join("\n")}
                  onChange={(event) => update("messages", event.currentTarget.value.split("\n").slice(0, 3))}
                />
              </Field>
              <Field label="오프닝 조건" className="span-two">
                <input value={brief.opening} onChange={(event) => update("opening", event.currentTarget.value)} />
              </Field>
              <Field label="클로징 조건" className="span-two">
                <input value={brief.closing} onChange={(event) => update("closing", event.currentTarget.value)} />
              </Field>
            </div>

            <fieldset className="lens-fieldset">
              <legend>AI가 먼저 볼 평가 관점</legend>
              <div>
                {["처음 듣는 청중", "의사결정자", "엄격한 검토자"].map((lens) => (
                  <button
                    aria-pressed={brief.lens === lens}
                    className={brief.lens === lens ? "selected" : ""}
                    key={lens}
                    onClick={() => update("lens", lens)}
                    type="button"
                  >
                    {brief.lens === lens ? <IconCheck size={16} /> : null}{lens}
                  </button>
                ))}
              </div>
            </fieldset>
          </form>

          <aside className="brief-summary-panel">
            <p className="eyebrow">LIVE SUMMARY</p>
            <h2>입력한 발표 기준</h2>
            <SummaryItem icon={IconUsers} label="청중" value={brief.audience} />
            <SummaryItem icon={IconTarget} label="발표 목적" value={brief.purpose} />
            <SummaryItem icon={IconClock} label="목표 시간" value={brief.duration} />
            <SummaryItem icon={IconFlag} label="원하는 결과" value={brief.outcome} />
            <div className="impact-note">
              <IconSparkles size={20} />
              <p><strong>이 기준은 계속 이어져요.</strong> AI 구성과 이후 리허설 평가에 함께 사용됩니다.</p>
            </div>
            <button className="primary-button" disabled={isGenerating} type="submit" onClick={submit}>
              {isGenerating ? "발표자료 구성 중…" : "브리프 저장하고 디자인 선택"}
              {!isGenerating ? <IconArrowRight size={18} /> : null}
            </button>
            <button className="quiet-button" type="button" onClick={onContinue}>일반 기준으로 시작</button>
          </aside>
        </div>
      </main>
    </div>
  );
}

function PptxImportScreen({ onBackToAi, onContinue }) {
  const [mode, setMode] = useState("review");
  const [fileName, setFileName] = useState("2026-Q3-business-strategy.pptx");
  const [brief, setBrief] = useState(importedBrief);
  const [isImporting, setIsImporting] = useState(false);
  const update = (key, value) => setBrief((current) => ({ ...current, [key]: value }));

  const confirm = () => {
    setIsImporting(true);
    window.setTimeout(() => onContinue(brief), 650);
  };

  return (
    <div className="prototype-page">
      <ProductHeader onLogoClick={onBackToAi} />
      <main className="wizard-page import-page">
        <section className="wizard-hero cream-hero">
          <div>
            <p className="eyebrow"><IconFileTypePpt size={17} /> PPTX IMPORT</p>
            <h1>기존 발표자료 가져오기</h1>
            <p>슬라이드는 그대로 가져오고, AI가 발표 맥락을 먼저 정리해 드립니다.</p>
          </div>
          <button className="quiet-link-button" type="button" onClick={onBackToAi}>
            <IconArrowLeft size={18} /> AI로 새 발표 만들기
          </button>
        </section>

        <div className="wizard-layout import-layout">
          <aside className="wizard-steps"><StepRail active={mode === "upload" ? "file" : "brief"} importMode /></aside>
          {mode === "upload" ? (
            <section className="upload-stage">
              <div className="section-heading">
                <p className="eyebrow">1. FILE</p>
                <h2>가져올 PPTX를 선택하세요.</h2>
                <p>원본 파일은 변경하지 않고 새 ORBIT 프로젝트로 복사합니다.</p>
              </div>
              <label className="file-dropzone">
                <IconUpload size={32} />
                <strong>PPTX 파일을 놓거나 선택하세요.</strong>
                <span>Microsoft PowerPoint · 최대 100MB</span>
                <input
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  type="file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) setFileName(file.name);
                    setMode("review");
                  }}
                />
                <span className="secondary-button">파일 선택</span>
              </label>
            </section>
          ) : (
            <section className="import-review-stage">
              <div className="section-heading">
                <p className="eyebrow">2. BRIEF REVIEW</p>
                <h2>가져온 내용에서 발표 기준을 정리했어요.</h2>
                <p>AI가 추출한 내용이 맞는지 확인하세요. 가져온 뒤에도 에디터에서 다시 수정할 수 있습니다.</p>
              </div>
              <div className="import-file-row">
                <span><IconFileTypePpt size={23} /></span>
                <div><strong>{fileName}</strong><small>18개 슬라이드 · 분석 완료</small></div>
                <span className="status-badge"><IconCheck size={15} /> 브리프 추출됨</span>
                <button type="button" onClick={() => setMode("upload")}><IconRefresh size={17} /> 다시 선택</button>
              </div>
              <div className="extracted-note"><IconSparkles size={18} /> 가져온 PPT에서 찾은 내용을 브리프에 반영했습니다.</div>
              <div className="compact-fields">
                <Field label="청중"><input value={brief.audience} onChange={(event) => update("audience", event.currentTarget.value)} /></Field>
                <Field label="발표 목적"><input value={brief.purpose} onChange={(event) => update("purpose", event.currentTarget.value)} /></Field>
                <Field label="발표 후 원하는 결과" className="wide"><input value={brief.outcome} onChange={(event) => update("outcome", event.currentTarget.value)} /></Field>
                <Field label="반드시 전달할 내용" className="wide"><textarea rows={4} value={brief.messages.join("\n")} onChange={(event) => update("messages", event.currentTarget.value.split("\n").slice(0, 3))} /></Field>
                <Field label="목표 시간"><input value={brief.duration} onChange={(event) => update("duration", event.currentTarget.value)} /></Field>
                <Field label="평가 관점"><input value={brief.lens} onChange={(event) => update("lens", event.currentTarget.value)} /></Field>
              </div>
            </section>
          )}

          <aside className="import-preview-panel">
            <div className="slide-preview-image"><img src="/assets/editor-reference.png" alt="가져온 PPTX 미리보기" /></div>
            <div className="preview-copy"><strong>가져온 슬라이드는 그대로 유지돼요.</strong><p>브리프는 이후 AI 제안과 리허설 피드백의 기준으로만 사용됩니다.</p></div>
            {mode === "review" ? (
              <button className="primary-button" disabled={isImporting} type="button" onClick={confirm}>
                {isImporting ? "프로젝트로 가져오는 중…" : "브리프 확인하고 가져오기"}
                {!isImporting ? <IconArrowRight size={18} /> : null}
              </button>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}

function EditorBriefScreen({ brief, briefSource, onChangeBrief, onLogoClick }) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(brief), [brief]);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    onChangeBrief(draft);
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const editorStyle = useMemo(() => ({ "--drawer-width": drawerOpen ? "392px" : "0px" }), [drawerOpen]);

  return (
    <main className="editor-prototype" style={editorStyle}>
      <img className="editor-reference" src="/assets/editor-reference.png" alt="ORBIT 슬라이드 에디터" />
      <button className="editor-logo-hit" type="button" onClick={onLogoClick} aria-label="AI 발표자료 생성 화면으로 이동" />
      <button
        aria-expanded={drawerOpen}
        className={`brief-trigger ${drawerOpen ? "active" : ""}`}
        type="button"
        onClick={() => setDrawerOpen((current) => !current)}
      >
        <IconFileText size={18} /> 발표 기준
      </button>

      {drawerOpen ? (
        <aside className="brief-drawer" aria-label="발표 브리프">
          <header>
            <div><h1>발표 브리프</h1><span>{briefSource} · 2026. 7. 14. 수정</span></div>
            <div className="drawer-header-actions">
              <button type="button" onClick={() => setEditing((current) => !current)}>
                {editing ? <IconX size={16} /> : <IconPencil size={16} />}{editing ? "취소" : "수정"}
              </button>
              <button aria-label="브리프 닫기" className="icon-button" type="button" onClick={() => setDrawerOpen(false)}><IconX size={20} /></button>
            </div>
          </header>

          <div className="drawer-content">
            {editing ? (
              <div className="drawer-fields">
                <Field label="청중"><input value={draft.audience} onChange={(event) => update("audience", event.currentTarget.value)} /></Field>
                <Field label="발표 목적"><input value={draft.purpose} onChange={(event) => update("purpose", event.currentTarget.value)} /></Field>
                <Field label="목표 시간"><input value={draft.duration} onChange={(event) => update("duration", event.currentTarget.value)} /></Field>
                <Field label="발표 후 원하는 결과"><textarea rows={3} value={draft.outcome} onChange={(event) => update("outcome", event.currentTarget.value)} /></Field>
                <Field label="반드시 전달할 내용"><textarea rows={5} value={draft.messages.join("\n")} onChange={(event) => update("messages", event.currentTarget.value.split("\n").slice(0, 4))} /></Field>
                <Field label="오프닝 조건"><textarea rows={2} value={draft.opening} onChange={(event) => update("opening", event.currentTarget.value)} /></Field>
                <Field label="클로징 조건"><textarea rows={2} value={draft.closing} onChange={(event) => update("closing", event.currentTarget.value)} /></Field>
                <Field label="평가 관점"><input value={draft.lens} onChange={(event) => update("lens", event.currentTarget.value)} /></Field>
              </div>
            ) : (
              <div className="drawer-summary">
                <DrawerSection icon={IconUsers} title="청중" value={`${draft.audience} (CEO, 임원진, BU 리더)`} helper="성과와 투자 효율, 리스크를 중시합니다." />
                <DrawerSection icon={IconTarget} title="발표 목적" value={draft.outcome} helper="핵심 방향, 예산, 우선순위 확정" />
                <DrawerSection icon={IconClock} title="목표 시간" value={draft.duration} />
                <DrawerSection icon={IconFlag} title="발표 후 원하는 결과" value={draft.outcome} />
                <DrawerSection icon={IconListCheck} title="반드시 전달할 내용" value={draft.messages} />
                <DrawerSection icon={IconPlayerPlay} title="오프닝 조건" value={draft.opening} />
                <DrawerSection icon={IconLayout} title="클로징 조건" value={draft.closing} />
                <DrawerSection icon={IconWand} title="평가 관점 (AI 리허설 기준)" value={`${draft.lens} · 명확성 · 논리성 · 실행가능성`} />
              </div>
            )}
          </div>

          <footer>
            <div className="drawer-impact-note"><IconSparkles size={19} /><p>브리프를 바꾸면 이후 AI 슬라이드 제안과 리허설 피드백에 반영됩니다.<strong>기존 슬라이드는 그대로 유지됩니다.</strong></p></div>
            <button className="primary-button" type="button" onClick={save}>
              변경사항 저장
            </button>
          </footer>
        </aside>
      ) : null}

      {saved ? <div className="toast" role="status"><IconCheck size={18} /> 브리프가 저장되었습니다.</div> : null}
    </main>
  );
}

function Field({ children, className = "", hint, label }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function SummaryItem({ icon: Icon, label, value }) {
  return (
    <div className="summary-item"><Icon size={19} /><div><small>{label}</small><strong>{value}</strong></div></div>
  );
}

function DrawerSection({ helper, icon: Icon, title, value }) {
  return (
    <section className="drawer-section">
      <Icon size={19} />
      <div>
        <h2>{title}</h2>
        {Array.isArray(value) ? <ul>{value.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{value}</p>}
        {helper ? <small>{helper}</small> : null}
      </div>
    </section>
  );
}
